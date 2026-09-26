import { AimOutlined } from '@ant-design/icons';
import { Button, Card, Col, Empty, List, Row, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@shared/components/PageHeader';
import { useDeliverySettings, useLiveRiders } from '@shared/hooks/useDelivery';
import { useWarehouses } from '../../../hooks/useWarehouses';
import { OutletSelect, TASK_STATUS, listOf } from './riderParts';

dayjs.extend(relativeTime);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const riderIcon = (initial: string, busy: boolean, stale: boolean) =>
  L.divIcon({
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<span style="display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:${stale ? '#bfbfbf' : busy ? '#ff8a00' : '#16a34a'};color:#fff;font:600 13px/1 system-ui;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35)">${esc(initial)}</span>`,
  });
const outletIcon = L.divIcon({
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  html: '<span style="display:block;width:16px;height:16px;border-radius:4px;background:#1e293b;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.35)"></span>',
});

/** Riders online right now, on OpenStreetMap, with what each is carrying. Refreshes every 15 s. */
export function LiveRidersPage() {
  const [outlet, setOutlet] = useState<string | undefined>();
  const live = useLiveRiders();
  const settings = useDeliverySettings();
  const warehouses = useWarehouses();
  const navigate = useNavigate();
  const freshMin = settings.data?.locationFreshMinutes ?? 10;

  const riders = useMemo(() => (live.data ?? []).filter((r) => !outlet || r.warehouse?.id === outlet), [live.data, outlet]);
  const outlets = useMemo(
    () => listOf<{ id: string; name: string; isActive: boolean; latitude?: string | null; longitude?: string | null }>(warehouses.data)
      .filter((w) => w.isActive && w.latitude && w.longitude && (!outlet || w.id === outlet))
      .map((w) => ({ id: w.id, name: w.name, lat: Number(w.latitude), lng: Number(w.longitude) })),
    [warehouses.data, outlet],
  );
  const isStale = (at: string | null) => !at || dayjs().diff(dayjs(at), 'minute') > freshMin;

  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const fitted = useRef(false);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current).setView([22.9734, 78.6569], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const t = setTimeout(() => m.invalidateSize(), 200);
    return () => {
      clearTimeout(t);
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    markers.current.clear();
    const pts: L.LatLngExpression[] = [];
    for (const o of outlets) {
      L.marker([o.lat, o.lng], { icon: outletIcon }).bindTooltip(esc(o.name)).addTo(g);
      pts.push([o.lat, o.lng]);
    }
    for (const r of riders) {
      if (r.lastLatitude === null || r.lastLongitude === null) continue;
      const pos: L.LatLngExpression = [Number(r.lastLatitude), Number(r.lastLongitude)];
      const busy = r.tasks.length > 0;
      const mk = L.marker(pos, { icon: riderIcon(r.fullName.charAt(0).toUpperCase(), busy, isStale(r.lastLocationAt)) })
        .bindPopup(`<b>${esc(r.fullName)}</b><br/>${esc(r.phone)}<br/>${busy ? `${r.tasks.map((t) => esc(t.taskNumber)).join(', ')}` : 'Free'}<br/><small>Seen ${esc(r.lastLocationAt ? dayjs(r.lastLocationAt).fromNow() : 'never')}</small>`)
        .addTo(g);
      markers.current.set(r.id, mk);
      pts.push(pos);
    }
    if (!fitted.current && pts.length) {
      fitted.current = true;
      if (pts.length === 1) m.setView(pts[0], 14);
      else m.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riders, outlets, freshMin]);

  const focus = (id: string) => {
    const mk = markers.current.get(id);
    if (mk && map.current) {
      map.current.setView(mk.getLatLng(), 16);
      mk.openPopup();
    }
  };

  const busy = riders.filter((r) => r.tasks.length).length;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="Live Riders"
        subtitle={`Riders online now. Green = free, orange = carrying a delivery, grey = no location for over ${freshMin} min. Outlets are dark squares.`}
        extra={<OutletSelect allowClear placeholder="All outlets" value={outlet} onChange={(v) => { fitted.current = false; setOutlet(v); }} style={{ width: 200 }} />}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card className="page-card" styles={{ body: { padding: 0, overflow: 'hidden', borderRadius: 12 } }}>
            <div ref={el} style={{ height: 'calc(100vh - 260px)', minHeight: 420 }} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card className="page-card" title={`${riders.length} online`} extra={<Space size={4}><Tag color="orange">{busy} busy</Tag><Tag color="green">{riders.length - busy} free</Tag></Space>}
            styles={{ body: { padding: 0, maxHeight: 'calc(100vh - 318px)', minHeight: 362, overflowY: 'auto' } }}>
            {riders.length === 0 ? (
              <Empty style={{ padding: 32 }} description={live.isLoading ? 'Loading…' : 'No rider is online'} />
            ) : (
              <List
                dataSource={riders}
                renderItem={(r) => (
                  <List.Item style={{ padding: '12px 16px' }}
                    actions={[<Button key="f" type="text" icon={<AimOutlined />} aria-label="Show on map" disabled={r.lastLatitude === null} onClick={() => focus(r.id)} />]}>
                    <List.Item.Meta
                      title={<a onClick={() => navigate(`/riders/${r.id}`)}>{r.fullName}</a>}
                      description={
                        <Space direction="vertical" size={4}>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {[r.warehouse?.name, r.lastLocationAt ? `seen ${dayjs(r.lastLocationAt).fromNow()}` : 'no location yet'].filter(Boolean).join(' · ')}
                          </Typography.Text>
                          {r.tasks.length ? (
                            <Space size={4} wrap>
                              {r.tasks.map((t) => (
                                <Tag key={t.id} color={TASK_STATUS[t.status as keyof typeof TASK_STATUS]?.color} style={{ cursor: 'pointer' }} onClick={() => navigate(`/delivery-board?task=${t.id}`)}>
                                  {t.taskNumber} · {TASK_STATUS[t.status as keyof typeof TASK_STATUS]?.label ?? t.status}
                                </Tag>
                              ))}
                            </Space>
                          ) : <Tag color="green">Free</Tag>}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
