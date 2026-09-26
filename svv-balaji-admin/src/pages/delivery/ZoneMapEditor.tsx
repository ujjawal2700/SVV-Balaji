import { Button, Space, Typography } from 'antd';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

export type LatLng = [number, number];

interface Outlet { id: string; name: string; lat: number; lng: number }

const dot = (color: string, size = 14) =>
  L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.35)"></span>`,
  });

/**
 * Draw a delivery-zone boundary on OpenStreetMap. Click the map to add a
 * point, drag a point to move it. The serving outlet, the radius cap and the
 * other zones are drawn for reference.
 */
export function ZoneMapEditor({
  value, onChange, outlets, servingOutletId, radiusKm, otherZones,
}: {
  value: LatLng[];
  onChange: (v: LatLng[]) => void;
  outlets: Outlet[];
  servingOutletId?: string;
  radiusKm?: number | null;
  otherZones: Array<{ name: string; boundary: LatLng[] }>;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const outletsRef = useRef(outlets);
  outletsRef.current = servingOutletId ? outlets.filter((o) => o.id === servingOutletId) : outlets;
  const fitted = useRef(false);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true }).setView([22.9734, 78.6569], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => onChangeRef.current([...valueRef.current, [round(e.latlng.lat), round(e.latlng.lng)]]));
    map.current = m;
    // Opened inside a drawer that is still animating: measure again once it has
    // its real size, then fit to the zone (fitting a 0x0 box zooms to the country).
    const t = setTimeout(() => {
      m.invalidateSize();
      const pts: LatLng[] = valueRef.current.length ? valueRef.current : outletsRef.current.map((o) => [o.lat, o.lng] as LatLng);
      if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15 });
      else if (pts.length === 1) m.setView(pts[0], 13);
    }, 400);
    return () => {
      clearTimeout(t);
      m.remove();
      map.current = null;
    };
  }, []);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();

    otherZones.forEach((z) => {
      if (z.boundary.length >= 3) L.polygon(z.boundary, { color: '#94a3b8', weight: 1, fillOpacity: 0.06, dashArray: '4 4' }).bindTooltip(z.name).addTo(g);
    });

    const serving = outlets.find((o) => o.id === servingOutletId);
    outlets.forEach((o) => L.marker([o.lat, o.lng], { icon: dot(o.id === servingOutletId ? '#16a34a' : '#64748b', o.id === servingOutletId ? 18 : 12) }).bindTooltip(o.name).addTo(g));
    if (serving && radiusKm) L.circle([serving.lat, serving.lng], { radius: radiusKm * 1000, color: '#16a34a', weight: 1, fillOpacity: 0.04, dashArray: '6 6' }).addTo(g);

    if (value.length >= 2) L.polygon(value, { color: '#ea580c', weight: 2, fillOpacity: 0.15 }).addTo(g);
    value.forEach((p, i) => {
      const mk = L.marker(p, { icon: dot('#ea580c', 14), draggable: true }).addTo(g);
      mk.on('dragend', () => {
        const ll = mk.getLatLng();
        const next = [...valueRef.current];
        next[i] = [round(ll.lat), round(ll.lng)];
        onChangeRef.current(next);
      });
    });

    if (!fitted.current) {
      const pts: LatLng[] = value.length ? value : serving ? [[serving.lat, serving.lng]] : outlets.map((o) => [o.lat, o.lng] as LatLng);
      if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15 });
      else if (pts.length === 1) m.setView(pts[0], 13);
      if (pts.length) fitted.current = true;
    }
  }, [value, outlets, servingOutletId, radiusKm, otherZones]);

  useEffect(() => {
    // Jump to the chosen outlet when it changes and nothing is drawn yet.
    const serving = outlets.find((o) => o.id === servingOutletId);
    if (serving && valueRef.current.length === 0) map.current?.setView([serving.lat, serving.lng], 13);
  }, [servingOutletId, outlets]);

  return (
    <div>
      <div ref={el} style={{ height: 380, borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Click the map to add boundary points ({value.length} so far{value.length > 0 && value.length < 3 ? ', need at least 3' : ''}). Drag a point to move it.
          Green = serving outlet{radiusKm ? ` and its ${radiusKm} km cap` : ''}; dashed grey = other zones.
        </Typography.Text>
        <Space>
          <Button size="small" disabled={!value.length} onClick={() => onChange(value.slice(0, -1))}>Undo point</Button>
          <Button size="small" danger disabled={!value.length} onClick={() => onChange([])}>Clear</Button>
        </Space>
      </div>
    </div>
  );
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
