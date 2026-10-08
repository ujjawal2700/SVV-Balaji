/// <reference types="google.maps" />
import { useQuery } from '@tanstack/react-query';
import { Card, Typography } from 'antd';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { checkoutApi, type LiveLocation } from '../api/checkout';
import { googleMapsAvailable, loadGoogleMaps, onGoogleAuthFailure } from '../maps/googleMaps';

type Live = Extract<LiveLocation, { tracking: true }>;

const RIDER = '#ea580c';
const STALE = '#94a3b8';
const DROP = '#16a34a';

const STATUS_TEXT: Record<string, string> = {
  PICKED_UP: 'Picked up your order',
  OUT_FOR_DELIVERY: 'On the way to you',
  AT_DROP: 'Has reached your address',
};

/** Google Maps: the rider glides between fixes, the road route is drawn when the server has one. */
function GoogleLiveMap({ live, onFail }: { live: Live; onFail: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const rider = useRef<google.maps.Marker | null>(null);
  const drop = useRef<google.maps.Marker | null>(null);
  const line = useRef<google.maps.Polyline | null>(null);
  const fitted = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const off = onGoogleAuthFailure(onFail);
    void loadGoogleMaps().then((g) => {
      if (cancelled) return;
      if (!g || !el.current) return onFail();
      map.current = new g.maps.Map(el.current, {
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'cooperative',
        clickableIcons: false,
        // A tracking map: roads and areas only - shops and bus stops are noise next to the rider.
        styles: [
          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', stylers: [{ visibility: 'off' }] },
        ],
        center: { lat: live.rider.latitude, lng: live.rider.longitude },
        zoom: 15,
      });
      setReady(true);
    });
    return () => {
      cancelled = true;
      off();
    };
    // Created once; updates below move the markers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const to = { lat: live.rider.latitude, lng: live.rider.longitude };
    const icon = (color: string, scale: number): google.maps.Symbol => ({
      path: google.maps.SymbolPath.CIRCLE, scale, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3,
    });

    if (!rider.current) {
      rider.current = new google.maps.Marker({ map: m, position: to, icon: icon(live.rider.stale ? STALE : RIDER, 9), zIndex: 2, title: live.rider.firstName });
    } else {
      rider.current.setIcon(icon(live.rider.stale ? STALE : RIDER, 9));
      // Glide from the last fix to the new one instead of jumping.
      const from = rider.current.getPosition();
      if (from) {
        const start = performance.now();
        const step = (t: number) => {
          const k = Math.min(1, (t - start) / 1200);
          rider.current?.setPosition({ lat: from.lat() + (to.lat - from.lat()) * k, lng: from.lng() + (to.lng - from.lng()) * k });
          if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      } else rider.current.setPosition(to);
    }

    if (live.drop) {
      const d = { lat: live.drop.latitude, lng: live.drop.longitude };
      if (!drop.current) drop.current = new google.maps.Marker({ map: m, position: d, icon: icon(DROP, 8), zIndex: 1, title: 'You' });
      const path = live.route?.polyline && google.maps.geometry?.encoding
        ? google.maps.geometry.encoding.decodePath(live.route.polyline)
        : [new google.maps.LatLng(to), new google.maps.LatLng(d)];
      const dashed = !live.route?.polyline;
      line.current?.setMap(null);
      line.current = new google.maps.Polyline({
        map: m,
        path,
        strokeColor: RIDER,
        strokeOpacity: dashed ? 0 : 0.85,
        strokeWeight: 4,
        // Straight-line fallback is drawn dashed so it never passes for a road route.
        icons: dashed ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '14px' }] : undefined,
      });
      if (!fitted.current) {
        const b = new google.maps.LatLngBounds();
        path.forEach((p) => b.extend(p));
        b.extend(to);
        b.extend(d);
        m.fitBounds(b, 40);
        fitted.current = true;
      } else if (!m.getBounds()?.contains(to)) m.panTo(to);
    }
  }, [ready, live]);

  return <div ref={el} style={{ height: 260, width: '100%' }} />;
}

/** OpenStreetMap fallback (no key, Google blocked or refused). Straight line only - no Google data on it. */
function LeafletLiveMap({ live }: { live: Live }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: false, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current || !layer.current) return;
    const pin = (color: string, size = 22) =>
      L.divIcon({
        className: '',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:4px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)"></span>`,
      });
    layer.current.clearLayers();
    const r: [number, number] = [live.rider.latitude, live.rider.longitude];
    L.marker(r, { icon: pin(live.rider.stale ? STALE : RIDER, 24) }).addTo(layer.current);
    if (live.drop) {
      const d: [number, number] = [live.drop.latitude, live.drop.longitude];
      L.marker(d, { icon: pin(DROP) }).addTo(layer.current);
      L.polyline([r, d], { color: RIDER, weight: 3, dashArray: '6 8' }).addTo(layer.current);
      if (!fitted.current) map.current.fitBounds(L.latLngBounds([r, d]), { padding: [32, 32], maxZoom: 16 });
      else if (!map.current.getBounds().contains(r)) map.current.panTo(r);
    } else if (!fitted.current) map.current.setView(r, 15);
    fitted.current = true;
  }, [live]);

  return <div ref={el} style={{ height: 240, width: '100%' }} />;
}

/**
 * Where the delivery partner is, live, for a local delivery on its way. Polls
 * every 10 s; renders nothing unless the server says the order is being carried
 * right now. Google Maps when a key is configured, OpenStreetMap otherwise.
 */
export function LiveRiderMap({ orderNumber }: { orderNumber: string }) {
  const q = useQuery({
    queryKey: ['storefront', 'orders', orderNumber, 'live'],
    queryFn: () => checkoutApi.liveLocation(orderNumber),
    refetchInterval: 10_000,
  });
  const [useGoogle, setUseGoogle] = useState(googleMapsAvailable());
  const live = q.data && q.data.tracking ? q.data : null;
  if (!live) return null;

  const mins = Math.round(live.rider.ageSeconds / 60);
  const eta = live.route?.etaMinutes;
  return (
    <Card
      title={`${live.rider.firstName} · ${STATUS_TEXT[live.status] ?? 'On the way'}`}
      extra={eta && live.status !== 'AT_DROP' ? <Typography.Text strong style={{ color: RIDER }}>~{eta} min</Typography.Text> : null}
      styles={{ body: { padding: 0 } }}
      style={{ overflow: 'hidden' }}
    >
      {useGoogle ? <GoogleLiveMap live={live} onFail={() => setUseGoogle(false)} /> : <LeafletLiveMap live={live} />}
      <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <Typography.Text>
          {eta && live.status !== 'AT_DROP' ? (
            <>Arriving in about <strong>{eta} min</strong>{live.distanceKm !== null ? ` · ${live.distanceKm} km by road` : ''}</>
          ) : live.distanceKm !== null ? (
            <>About <strong>{live.distanceKm} km</strong> away</>
          ) : (
            'Location shared by your delivery partner'
          )}
        </Typography.Text>
        <Typography.Text type={live.rider.stale ? 'warning' : 'secondary'} style={{ fontSize: 12 }}>
          {live.rider.stale ? `Last seen ${mins} min ago - location may be out of date` : live.rider.ageSeconds < 60 ? 'Updated just now' : `Updated ${mins} min ago`}
        </Typography.Text>
      </div>
    </Card>
  );
}
