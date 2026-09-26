import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

export interface MapPoint {
  lat: number;
  lng: number;
  kind: 'store' | 'drop' | 'me';
}

const COLORS: Record<MapPoint['kind'], string> = { store: '#23232d', drop: '#e2453b', me: '#ff8a00' };

const pin = (kind: MapPoint['kind']) =>
  L.divIcon({
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<span style="display:block;width:26px;height:26px;border-radius:50%;background:${COLORS[kind]};border:4px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.25)"></span>`,
  });

/** OpenStreetMap preview of the store, the customer and (optionally) the rider. */
export function MiniMap({ points, height = 190 }: { points: MapPoint[]; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

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
    layer.current.clearLayers();
    const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    valid.forEach((p) => L.marker([p.lat, p.lng], { icon: pin(p.kind) }).addTo(layer.current!));
    const store = valid.find((p) => p.kind === 'store');
    const drop = valid.find((p) => p.kind === 'drop');
    if (store && drop) L.polyline([[store.lat, store.lng], [drop.lat, drop.lng]], { color: '#ff8a00', weight: 3, dashArray: '6 8' }).addTo(layer.current);
    if (valid.length > 1) map.current.fitBounds(L.latLngBounds(valid.map((p) => [p.lat, p.lng] as [number, number])), { padding: [28, 28], maxZoom: 16 });
    else if (valid.length === 1) map.current.setView([valid[0].lat, valid[0].lng], 15);
  }, [points]);

  return <div ref={el} className="map" style={{ height }} />;
}
