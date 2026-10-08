import { useQuery } from '@tanstack/react-query';
import { Card, Typography } from 'antd';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { checkoutApi } from '../api/checkout';

const pin = (color: string, size = 22) =>
  L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:4px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)"></span>`,
  });

const STATUS_TEXT: Record<string, string> = {
  PICKED_UP: 'Picked up your order',
  OUT_FOR_DELIVERY: 'On the way to you',
  AT_DROP: 'Has reached your address',
};

/**
 * Where the delivery partner is, live, for a local delivery on its way. Polls
 * every 10 s; renders nothing at all unless the server says the order is being
 * carried right now.
 */
export function LiveRiderMap({ orderNumber }: { orderNumber: string }) {
  const q = useQuery({
    queryKey: ['storefront', 'orders', orderNumber, 'live'],
    queryFn: () => checkoutApi.liveLocation(orderNumber),
    refetchInterval: 10_000,
  });
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);
  const d = q.data;
  const live = d && d.tracking ? d : null;

  useEffect(() => {
    if (!live || !el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: false, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
      fitted.current = false;
    };
  }, [live]);

  useEffect(() => {
    if (!live || !map.current || !layer.current) return;
    layer.current.clearLayers();
    const rider: [number, number] = [live.rider.latitude, live.rider.longitude];
    L.marker(rider, { icon: pin(live.rider.stale ? '#94a3b8' : '#ea580c', 24) }).addTo(layer.current);
    if (live.drop) {
      const drop: [number, number] = [live.drop.latitude, live.drop.longitude];
      L.marker(drop, { icon: pin('#16a34a') }).addTo(layer.current);
      L.polyline([rider, drop], { color: '#ea580c', weight: 3, dashArray: '6 8' }).addTo(layer.current);
      // Fit once; after that keep the customer's own zoom and only follow the rider.
      if (!fitted.current) map.current.fitBounds(L.latLngBounds([rider, drop]), { padding: [32, 32], maxZoom: 16 });
      else if (!map.current.getBounds().contains(rider)) map.current.panTo(rider);
    } else if (!fitted.current) {
      map.current.setView(rider, 15);
    }
    fitted.current = true;
  }, [live]);

  if (!live) return null;
  const mins = Math.round(live.rider.ageSeconds / 60);
  return (
    <Card title={`${live.rider.firstName} · ${STATUS_TEXT[live.status] ?? 'On the way'}`} styles={{ body: { padding: 0 } }} style={{ overflow: 'hidden' }}>
      <div ref={el} style={{ height: 240, width: '100%' }} />
      <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <Typography.Text>
          {live.distanceKm !== null ? <>About <strong>{live.distanceKm} km</strong> away</> : 'Location shared by your delivery partner'}
        </Typography.Text>
        <Typography.Text type={live.rider.stale ? 'warning' : 'secondary'} style={{ fontSize: 12 }}>
          {live.rider.stale ? `Last seen ${mins} min ago - location may be out of date` : live.rider.ageSeconds < 60 ? 'Updated just now' : `Updated ${mins} min ago`}
        </Typography.Text>
      </div>
    </Card>
  );
}
