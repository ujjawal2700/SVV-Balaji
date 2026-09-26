import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { riderApi } from '../api/rider';
import { ArrowLeft, Box, Chat, Clock, Locate, Navigate as NavIcon, Phone, Pin, Store } from '../ui/icons';
import { Spinner, TopBar, time } from '../ui/kit';

type LatLng = [number, number];

const dot = (bg: string, inner: string, size = 34) =>
  L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span style="display:grid;place-items:center;width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:4px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.25)">${inner}</span>`,
  });
const PIN_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11Z"/></svg>';
const BAG_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>';

/** km between two points (haversine). */
function km(a: LatLng, b: LatLng) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b[0] - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(r(b[1] - a[1]) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** WhatsApp chat link for an Indian mobile number, or null. */
const whatsapp = (phone: string | null) => {
  const d = (phone ?? '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `https://wa.me/91${d}` : null;
};

/**
 * "Track Your Order": the live map to where the rider is heading next (the
 * store before pickup, the customer after), with who to contact and when the
 * order is due. Navigation hands over to Google Maps for turn-by-turn.
 */
export function TrackScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['task', id], queryFn: () => riderApi.task(id), refetchInterval: 20_000 });
  const [me, setMe] = useState<LatLng | null>(null);
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);
  const t = q.data;

  // Follow the rider's position while the screen is open.
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const w = navigator.geolocation.watchPosition((p) => setMe([p.coords.latitude, p.coords.longitude]), () => undefined, { enableHighAccuracy: true, maximumAge: 10_000 });
    return () => navigator.geolocation.clearWatch(w);
  }, []);

  useEffect(() => {
    if (!el.current || map.current || !t) return;
    map.current = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([22.9734, 78.6569], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [t]);

  const toStore = t ? ['ASSIGNED', 'AT_PICKUP', 'FAILED'].includes(t.status) : false;
  const target = t ? (toStore ? t.pickup : t.drop) : null;
  const dest: LatLng | null = target && target.latitude !== null && target.longitude !== null ? [target.latitude, target.longitude] : null;

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const pts: LatLng[] = [];
    if (dest) {
      L.marker(dest, { icon: dot('#e2453b', PIN_SVG) }).addTo(g);
      pts.push(dest);
    }
    if (me) {
      L.marker(me, { icon: dot('#ff8a00', BAG_SVG, 38) }).addTo(g);
      pts.push(me);
    }
    if (me && dest) L.polyline([me, dest], { color: '#ff8a00', weight: 4, dashArray: '2 9', lineCap: 'round' }).addTo(g);
    if (!fitted.current && pts.length) {
      fitted.current = pts.length > 1;
      if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [40, 90], paddingBottomRight: [40, 330], maxZoom: 16 });
      else m.setView(pts[0], 15);
    }
  }, [me, dest?.[0], dest?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const recenter = () => {
    const pts = [me, dest].filter(Boolean) as LatLng[];
    if (!map.current || !pts.length) return;
    if (pts.length > 1) map.current.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [40, 90], paddingBottomRight: [40, 330], maxZoom: 16 });
    else map.current.setView(pts[0], 16);
  };

  if (q.isLoading) return <div className="app"><TopBar title="Track Your Order" back /><Spinner /></div>;
  if (!t || !target) return <div className="app"><TopBar title="Track Your Order" back /><div className="page"><div className="card empty">{errorMessage(q.error, 'This delivery is not available')}</div></div></div>;

  const distance = me && dest ? km(me, dest) : t.distanceKm;
  // Rough city riding speed of 20 km/h, as a range.
  const eta = distance !== null && distance !== undefined ? Math.max(3, Math.round((distance / 20) * 60)) : null;
  const wa = toStore ? null : whatsapp(t.drop.phone);
  const phone = toStore ? t.pickup.phone : t.drop.phone;

  return (
    <div className="track">
      <div ref={el} className="map-full" />
      <div className="float-bar">
        <button className="icon-btn" aria-label="Back" onClick={() => navigate(-1)}><ArrowLeft /></button>
        <h1>Track Your Order</h1>
        <button className="icon-btn" aria-label="Centre the map" onClick={recenter}><Locate /></button>
      </div>

      <div className="track-sheet">
        <div className="track-contact">
          <div className="avatar">{toStore ? <Store size={24} /> : target.name.charAt(0).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ellipsis" style={{ fontSize: 16, fontWeight: 600 }}>{target.name}</div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>{toStore ? 'Pickup store' : 'Customer'}</div>
          </div>
          {!toStore ? (
            <a className="round-btn" href={wa ?? undefined} target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp" aria-disabled={!wa}><Chat size={20} /></a>
          ) : null}
          <a className="round-btn" href={phone ? `tel:${phone}` : undefined} aria-label="Call" aria-disabled={!phone}><Phone size={20} /></a>
        </div>
        <div className="track-details">
          <div className="track-row">
            <div className="ico" style={{ background: 'var(--orange-soft)', color: 'var(--orange)' }}><Pin size={20} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="k">Address</div>
              <div className="v" style={{ fontSize: 14 }}>{target.address || '—'}</div>
            </div>
            <a className="round-btn" href={target.navigationUrl} target="_blank" rel="noreferrer" aria-label="Navigate in Google Maps"><NavIcon size={18} /></a>
          </div>
          <div className="track-row">
            <div className="ico" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}><Clock size={20} /></div>
            <div>
              <div className="k">{toStore ? 'Time to store' : 'Delivery Time'}</div>
              <div className="v">
                {eta !== null ? `${eta}-${eta + 10} minutes` : 'Location off'}
                {!toStore && t.promisedBy ? <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}> · due {time(t.promisedBy)}</span> : null}
              </div>
            </div>
          </div>
          <div className="track-row">
            <div className="ico" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}><Box size={20} /></div>
            <div>
              <div className="k">Order#</div>
              <div className="v">{t.orderNumber ?? t.taskNumber}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
