import {
  BarcodeOutlined,
  CalendarOutlined,
  CarOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  EnvironmentOutlined,
  HomeOutlined,
  InboxOutlined,
  LinkOutlined,
  PhoneOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Card, Col, Descriptions, Divider, Row, Space, Statistic, Tag, Timeline, Tooltip, Typography } from 'antd';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/format';

const { Text, Title } = Typography;
const DASH = '—';

/**
 * Everything in this file reads what the order actually holds: its lines, its
 * batch allocations and the upstream chain behind them, its address snapshot,
 * its event timeline, its rider / shipment. Where the system has not recorded
 * something (gross weight, cartons) it says "Not recorded" instead of inventing
 * a number - the layout is unchanged, the values are the order's own.
 */

const digits = (s?: string | null) => (s ?? '').replace(/\D/g, '').slice(-10);
export const customerPhone = (d: any): string | null => d?.customer?.phone ?? null;
export const deliveryPhone = (d: any): string | null => d?.addressSnapshot?.phone ?? null;
export const openWhatsApp = (phone?: string | null) => {
  const n = digits(phone);
  if (n.length === 10) window.open(`https://wa.me/91${n}`, '_blank');
};

export const PAYMENT_MODE_LABEL: Record<string, string> = {
  ONLINE: 'Paid online',
  COD: 'Cash on delivery',
  CREDIT: 'On account (credit)',
};

/** How this order was paid, in words - from the order, never assumed. */
export function paymentLabel(d: any): string {
  if (d?.paymentMode) return PAYMENT_MODE_LABEL[d.paymentMode] ?? d.paymentMode;
  const terms = String(d?.paymentTerms ?? '');
  return terms && terms !== 'PREPAID' ? `Credit · ${terms.replace('CREDIT_', '')} days` : 'Prepaid';
}

export function formatAddress(d: any): string {
  const a = d?.addressSnapshot;
  if (a) {
    return [a.fullName, a.line1, a.line2, a.landmark, [a.city, a.state, a.pincode].filter(Boolean).join(', ')].filter(Boolean).join(', ');
  }
  return d?.deliveryAddress || DASH;
}

/** The live (not released) allocations for one line. */
const liveAllocations = (d: any, itemId: string): any[] =>
  (d?.allocations ?? []).filter((a: any) => a.orderItemId === itemId && !a.releasedAt);

const uniq = <T,>(xs: T[]): T[] => [...new Set(xs)];

/** Raw lots and growers behind a set of allocations. */
function upstream(allocs: any[]) {
  const lots: string[] = [];
  const origins: string[] = [];
  for (const a of allocs) {
    for (const c of a.fgBatch?.productionBatch?.consumptions ?? []) {
      const rm = c.rawMaterialBatch;
      if (!rm) continue;
      lots.push(rm.batchNumber);
      if (rm.farmer) origins.push(`${rm.farmer.fullName} (${rm.farmer.farmerCode}) — ${[rm.farmer.village, rm.farmer.district, rm.farmer.state].filter(Boolean).join(', ')}`);
      else if (rm.supplier) origins.push(`${rm.supplier.fullName} (${rm.supplier.supplierCode}) — ${[rm.supplier.city, rm.supplier.district, rm.supplier.state].filter(Boolean).join(', ')}`);
    }
  }
  return { lots: uniq(lots), origins: uniq(origins) };
}

// ---------------------------------------------------------------- item cards
export function OrderItemCards({ data, manualOverride }: { data: any; manualOverride: boolean }) {
  const items: any[] = data.items ?? [];
  const warehouseName = data.warehouse?.name ?? DASH;

  return (
    <>
      {items.map((item) => {
        const allocs = liveAllocations(data, item.id);
        const first = allocs[0]?.fgBatch;
        const { lots, origins } = upstream(allocs);
        const name = item.nameSnapshot ?? item.product?.name ?? DASH;
        const sku = item.skuSnapshot ?? item.product?.sku ?? DASH;
        const discount = Number(item.lineDiscount ?? 0);

        return (
          <Card key={item.id} size="small" style={{ borderRadius: 10, borderLeft: '4px solid #1677ff', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)', background: '#fff' }}>
            <Row gutter={[12, 12]} align="middle">
              <Col xs={24} md={15}>
                <Space align="start" size={12}>
                  <Avatar shape="square" size={46} style={{ backgroundColor: '#e6f4ff', color: '#1677ff', fontWeight: 700, borderRadius: 6 }}>
                    {name.charAt(0)}
                  </Avatar>
                  <Space direction="vertical" size={3}>
                    <Text strong style={{ fontSize: 14, color: '#1f1f1f' }}>{name}</Text>
                    <Space size={6} wrap style={{ marginTop: 2 }}>
                      <Tag color="blue" style={{ fontSize: 11, margin: 0, borderRadius: 4 }}>Unit: {item.product?.unit ?? 'PACK'}</Tag>
                      <Tag color="default" style={{ fontSize: 11, margin: 0, borderRadius: 4 }}>SKU: {sku}</Tag>
                      <Tag color="purple" style={{ fontSize: 11, margin: 0, borderRadius: 4 }}>Qty: {item.quantity} pack(s)</Tag>
                    </Space>
                  </Space>
                </Space>
              </Col>
              <Col xs={24} md={9} style={{ textAlign: 'right' }}>
                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                  Rate: {formatCurrency(item.unitPrice)} / pack · GST: {Number(item.gstRatePercent)}%
                  {discount > 0 ? ` · Discount: −${formatCurrency(String(discount))}` : ''}
                </Text>
                <Title level={4} style={{ margin: 0, color: '#389e0d', fontWeight: 700 }}>{formatCurrency(item.lineTotal)}</Title>
              </Col>
            </Row>

            <Divider style={{ margin: '12px 0 10px 0' }} />

            <div style={{ background: '#f8fafc', border: '1px solid #e8e8e8', borderRadius: 8, padding: '12px 14px' }}>
              <Row gutter={[16, 12]}>
                <Col xs={24} sm={12}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>FIFO Allocation Tag</Text>
                  {first ? (
                    <Tag color="green" icon={<CheckCircleOutlined />} style={{ fontWeight: 600, fontSize: 11, margin: 0 }}>
                      Oldest-first allocation (Mfg: {formatDate(first.manufacturingDate)})
                    </Tag>
                  ) : (
                    <Tag style={{ fontSize: 11, margin: 0 }}>Not allocated yet</Tag>
                  )}
                </Col>

                <Col xs={24} sm={12}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Upstream RM Lot</Text>
                  {lots.length ? (
                    <Space size={4} wrap>
                      <BarcodeOutlined style={{ color: '#52c41a' }} />
                      {lots.map((l) => <Text key={l} code style={{ fontSize: 11, fontWeight: 700 }}>{l}</Text>)}
                    </Space>
                  ) : <Text type="secondary" style={{ fontSize: 12 }}>{DASH}</Text>}
                </Col>

                <Col xs={24} sm={12}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Allocated Batch #</Text>
                  {allocs.length ? (
                    <Space size={4} wrap>
                      {allocs.map((a) => (
                        <Tooltip key={a.id} title="Open the farm-origin trace for this batch">
                          <Tag color="geekblue" style={{ cursor: 'pointer', fontWeight: 600, fontSize: 11, margin: 0 }} onClick={() => window.open(`/trace?batch=${a.fgBatch.fgBatchNumber}`, '_blank')}>
                            <SafetyCertificateOutlined /> {a.fgBatch.fgBatchNumber} × {a.quantity}{a.scannedAt ? ' ✓' : ''}
                          </Tag>
                        </Tooltip>
                      ))}
                    </Space>
                  ) : <Text type="secondary" style={{ fontSize: 12 }}>{DASH}</Text>}
                </Col>

                <Col xs={24} sm={12}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Allocation Engine Mode</Text>
                  <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>{manualOverride ? 'Manual Admin Override' : 'Automated FIFO Selection'}</Tag>
                </Col>

                <Col xs={24}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Fulfilling Warehouse Node</Text>
                  <Space size={6} align="center">
                    <HomeOutlined style={{ color: '#1677ff' }} />
                    <Text strong style={{ fontSize: 12 }}>
                      {warehouseName}{data.warehouse?.kind ? ` (${data.warehouse.kind === 'OUTLET' ? 'franchise outlet' : 'central warehouse'})` : ''}
                    </Text>
                  </Space>
                </Col>

                <Col xs={24}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Farmer / Supplier Cluster Origin</Text>
                  {origins.length ? (
                    <Space direction="vertical" size={2}>
                      {origins.map((o) => (
                        <Space key={o} size={6} align="start"><UserOutlined style={{ color: '#fa8c16', marginTop: 3 }} /><Text style={{ fontSize: 12 }}>{o}</Text></Space>
                      ))}
                    </Space>
                  ) : <Text type="secondary" style={{ fontSize: 12 }}>{allocs.length ? 'No farm origin recorded on this batch' : DASH}</Text>}
                </Col>

                <Col xs={24}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Manufacturing & Expiry Info</Text>
                  <Space size={12} wrap align="center">
                    <Text style={{ fontSize: 11 }}><Text type="secondary">Mfg Date:</Text> <Text strong>{first ? formatDate(first.manufacturingDate) : DASH}</Text></Text>
                    <Text style={{ fontSize: 11 }}>
                      <Text type="secondary">Expiry:</Text>{' '}
                      {first?.expiryDate ? <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>{formatDate(first.expiryDate)}</Tag> : <Text strong>{DASH}</Text>}
                    </Text>
                  </Space>
                </Col>
              </Row>
            </div>
          </Card>
        );
      })}
    </>
  );
}

// ---------------------------------------------------- recipient, address, SLA
export function RecipientBlocks({ data, lateness }: { data: any; lateness: { late: boolean; label: string } | null }) {
  const snap = data.addressSnapshot;
  const phone = customerPhone(data);
  const lat = snap?.latitude;
  const lng = snap?.longitude;
  const promised = data.etaMax ?? data.requiredByDate;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* Recipient Contact Details */}
      <Card
        size="small"
        title={
          <Space>
            <UserOutlined style={{ color: '#1677ff' }} />
            <span style={{ fontWeight: 600 }}>Recipient Contact Details</span>
          </Space>
        }
        style={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
      >
        <Row gutter={[20, 16]}>
          <Col xs={24} sm={12}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, color: '#64748b' }}>
              Customer Full Name
            </Text>
            <Text strong style={{ fontSize: 14, color: '#1e293b', whiteSpace: 'nowrap' }}>
              {data.customer?.name ?? DASH}
            </Text>
          </Col>

          <Col xs={24} sm={12}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, color: '#64748b' }}>
              Primary Mobile Number
            </Text>
            <Space align="center" style={{ marginTop: 2, flexWrap: 'nowrap' }}>
              <PhoneOutlined style={{ color: '#1677ff' }} />
              <Text strong style={{ fontSize: 14, color: '#1e293b', whiteSpace: 'nowrap' }}>
                {phone ?? DASH}
              </Text>
              {phone ? (
                <Button
                  type="primary"
                  size="small"
                  style={{ backgroundColor: '#25D366', borderColor: '#25D366', borderRadius: 6, height: 26, fontSize: 11, padding: '0 10px', marginLeft: 4 }}
                  icon={<WhatsAppOutlined />}
                  onClick={() => openWhatsApp(phone)}
                >
                  WhatsApp
                </Button>
              ) : null}
            </Space>
          </Col>

          <Col xs={24} sm={12}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, color: '#64748b' }}>
              Delivery Contact
            </Text>
            <Text style={{ fontSize: 13, color: '#334155' }}>
              {snap ? `${snap.fullName} · ${snap.phone}` : DASH}
            </Text>
          </Col>

          <Col xs={24} sm={12}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, color: '#64748b', marginBottom: 2 }}>
              Account Type
            </Text>
            <Tag color="purple" style={{ borderRadius: 6, padding: '2px 8px', fontSize: 12, margin: 0 }}>
              {data.channel} · {data.source === 'STOREFRONT' ? 'Customer app order' : 'Staff-placed order'} · {data.customer?.customerCode ?? DASH}
            </Tag>
          </Col>
        </Row>
      </Card>

      {/* Shipping Address & Location */}
      <Card
        size="small"
        title={
          <Space>
            <EnvironmentOutlined style={{ color: '#ef4444' }} />
            <span style={{ fontWeight: 600 }}>Shipping Address & Location</span>
          </Space>
        }
        style={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
      >
        <Row gutter={[20, 14]}>
          <Col xs={24}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, color: '#64748b', marginBottom: 2 }}>
              Full Delivery Address
            </Text>
            <Space align="start" size={8}>
              <EnvironmentOutlined style={{ color: '#1677ff', marginTop: 3, fontSize: 15 }} />
              <Text strong style={{ fontSize: 13, color: '#1e293b', lineHeight: '1.5' }}>
                {formatAddress(data)}
              </Text>
            </Space>
          </Col>

          <Col xs={24}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>
              PIN Code & GPS Pin
            </Text>
            <Space align="center" wrap size={8}>
              <Tag color="blue" style={{ fontWeight: 600, borderRadius: 6, padding: '2px 8px' }}>
                PIN: {snap?.pincode ?? DASH}
              </Tag>
              {lat != null && lng != null ? (
                <>
                  <Tag color="cyan" style={{ fontWeight: 600, borderRadius: 6, padding: '2px 8px' }}>
                    GPS: {Number(lat).toFixed(4)}°, {Number(lng).toFixed(4)}°
                  </Tag>
                  <Button
                    type="link"
                    size="small"
                    icon={<LinkOutlined />}
                    style={{ padding: 0, fontWeight: 500 }}
                    onClick={() => window.open(`https://maps.google.com/?q=${lat},${lng}`, '_blank')}
                  >
                    View on Google Maps
                  </Button>
                </>
              ) : (
                <Tag style={{ borderRadius: 6, padding: '2px 8px' }}>Location not pinned by the customer</Tag>
              )}
              {data.distanceKm ? (
                <Tag color="green" style={{ fontWeight: 600, borderRadius: 6, padding: '2px 8px' }}>
                  {Number(data.distanceKm).toFixed(1)} km from {data.warehouse?.name}
                </Tag>
              ) : null}
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Delivery SLA & Timestamps */}
      <Card
        size="small"
        title={
          <Space>
            <CalendarOutlined style={{ color: '#10b981' }} />
            <span style={{ fontWeight: 600 }}>Delivery SLA & Timestamps</span>
          </Space>
        }
        style={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, color: '#64748b' }}>
              {data.etaMax ? 'Promised Delivery Window' : 'Promised Delivery Date'}
            </Text>
            <Text strong style={{ fontSize: 13, color: '#0f172a' }}>
              {promised ? (data.etaMax ? formatDateTime(promised) : formatDate(promised)) : DASH}
            </Text>
          </Col>
          <Col xs={24} sm={8}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, color: '#64748b' }}>
              Actual Dispatch Timestamp
            </Text>
            <Text style={{ fontSize: 13, color: '#334155' }}>
              {data.dispatchedAt ? formatDateTime(data.dispatchedAt) : 'Not dispatched yet'}
            </Text>
          </Col>
          <Col xs={24} sm={8}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, color: '#64748b' }}>
              Actual Delivery Timestamp
            </Text>
            <Space direction="vertical" size={2}>
              <Text style={{ fontSize: 13, color: '#334155' }}>
                {data.deliveredAt ? formatDateTime(data.deliveredAt) : 'Not delivered yet'}
              </Text>
              {lateness ? (
                <Tag color={lateness.late ? 'error' : 'success'} style={{ borderRadius: 4, fontSize: 11, margin: 0 }}>
                  {lateness.label}
                </Tag>
              ) : null}
            </Space>
          </Col>
        </Row>
      </Card>
    </Space>
  );
}

// ------------------------------------------- packaging, checkpoints, carrier
const eventAt = (d: any, type: string) => (d?.events ?? []).find((e: any) => e.type === type);

export function LogisticsBlocks({ data }: { data: any }) {
  // Net weight is real: packs x the pack weight of the batch each was allocated from.
  const live = (data.allocations ?? []).filter((a: any) => !a.releasedAt);
  const netKg = live.reduce((n: number, a: any) => {
    const w = Number(a.fgBatch?.netWeight ?? 0);
    const unit = String(a.fgBatch?.weightUnit ?? 'KG').toUpperCase();
    return n + a.quantity * (unit === 'G' || unit === 'GM' ? w / 1000 : w);
  }, 0);

  const packedEvent = eventAt(data, 'PACKED');
  const qa = live.map((a: any) => a.fgBatch?.qualityInspections?.[0]).filter(Boolean)[0];
  const rider = data.riderName ? `${data.riderName}${data.riderPhone ? ` (+91 ${data.riderPhone})` : ''}` : null;
  const ship = data.shipment;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card
        size="small"
        title={
          <Space>
            <InboxOutlined style={{ color: '#fa8c16' }} />
            <span style={{ fontWeight: 600 }}>Packaging & Weight Breakdown</span>
          </Space>
        }
        style={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
      >
        <Row gutter={[20, 16]}>
          <Col xs={24}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, color: '#64748b' }}>
              Secondary Packaging
            </Text>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Not recorded — cartons and crates are not tracked yet
            </Text>
          </Col>
          <Col xs={24}>
            <Row gutter={16} align="middle">
              <Col span={8}>
                <Statistic
                  title={<Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Net Weight (packs × weight)</Text>}
                  value={live.length ? `${netKg.toFixed(2)} KG` : DASH}
                  valueStyle={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title={<Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Gross Weight</Text>}
                  value="Not recorded"
                  valueStyle={{ fontSize: 13, color: '#94a3b8' }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title={<Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Tare Weight</Text>}
                  value="Not recorded"
                  valueStyle={{ fontSize: 13, color: '#94a3b8' }}
                />
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      <Card
        size="small"
        title={
          <Space>
            <CheckCircleOutlined style={{ color: '#10b981' }} />
            <span style={{ fontWeight: 600 }}>Dispatch Checkpoints & QA Sign-off</span>
          </Space>
        }
        style={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
      >
        <Row gutter={[20, 16]}>
          <Col xs={24} sm={12}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, color: '#64748b', marginBottom: 2 }}>
              Packed Date & Time
            </Text>
            {packedEvent ? (
              <Space size={6}>
                <CheckCircleOutlined style={{ color: '#10b981' }} />
                <Text strong style={{ fontSize: 13, color: '#0f172a' }}>
                  {formatDateTime(packedEvent.createdAt)}
                </Text>
              </Space>
            ) : (
              <Text type="secondary" style={{ fontSize: 13 }}>
                Not packed yet
              </Text>
            )}
          </Col>
          <Col xs={24} sm={12}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, color: '#64748b', marginBottom: 2 }}>
              QA Sign-off (finished batch)
            </Text>
            {qa ? (
              <Space size={8} wrap>
                <Tag color={qa.result === 'PASS' ? 'green' : 'red'} icon={<CheckCircleFilled />} style={{ borderRadius: 4 }}>
                  {qa.result}
                </Tag>
                <Text strong style={{ fontSize: 13, color: '#0f172a' }}>
                  {qa.inspectedBy?.fullName ?? DASH} · {formatDate(qa.createdAt)}
                </Text>
              </Space>
            ) : (
              <Text type="secondary" style={{ fontSize: 13 }}>
                No inspection on the allocated batch
              </Text>
            )}
          </Col>
        </Row>
      </Card>

      <Card
        size="small"
        title={
          <Space>
            <CarOutlined style={{ color: '#8b5cf6' }} />
            <span style={{ fontWeight: 600 }}>Carrier Information & Delivery Fleet</span>
          </Space>
        }
        style={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
      >
        <Row gutter={[20, 16]}>
          <Col xs={24}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>
              Delivery Partner Name
            </Text>
            {ship ? (
              <Tag color="blue" style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6 }}>
                {ship.courier ?? ship.provider} (courier)
              </Tag>
            ) : rider ? (
              <Tag color="green" style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6 }}>
                In-house rider
              </Tag>
            ) : (
              <Text type="secondary" style={{ fontSize: 13 }}>
                Not assigned yet
              </Text>
            )}
          </Col>
          {rider ? (
            <Col xs={24}>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, color: '#64748b', marginBottom: 2 }}>
                Driver / Carrier Contact
              </Text>
              <Space align="center" wrap>
                <PhoneOutlined style={{ color: '#1677ff' }} />
                <Text strong style={{ fontSize: 14, color: '#0f172a' }}>
                  {rider}
                </Text>
                <Button
                  type="primary"
                  size="small"
                  style={{ backgroundColor: '#25D366', borderColor: '#25D366', borderRadius: 6, height: 26, fontSize: 11, padding: '0 10px' }}
                  icon={<WhatsAppOutlined />}
                  onClick={() => openWhatsApp(data.riderPhone)}
                >
                  WhatsApp Driver
                </Button>
              </Space>
            </Col>
          ) : null}
          {ship?.awb ? (
            <Col xs={24}>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, color: '#64748b', marginBottom: 2 }}>
                Courier AWB Tracking Number
              </Text>
              <Space align="center">
                <Text code copyable={{ text: ship.awb }} style={{ fontSize: 13, fontWeight: 700 }}>
                  {ship.awb}
                </Text>
                {ship.trackingUrl ? (
                  <Button type="link" size="small" icon={<LinkOutlined />} style={{ padding: 0 }} onClick={() => window.open(ship.trackingUrl, '_blank')}>
                    Track Package
                  </Button>
                ) : null}
              </Space>
            </Col>
          ) : null}
        </Row>
      </Card>
    </Space>
  );
}

// ------------------------------------------------------------------- timeline
const EVENT_TITLE: Record<string, string> = {
  PLACED: 'Order Created & Placed',
  CONFIRMED: 'Order Confirmed',
  ALLOCATED: 'Batches Allocated (oldest-first)',
  SCANNED: 'Batch Label Scanned',
  PACKED: 'Packed',
  RIDER_ASSIGNED: 'Rider Assigned',
  SHIPMENT_CREATED: 'Shipment Created',
  SHIPMENT_UPDATE: 'Courier Update',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered to Recipient',
  CANCELLED: 'Order Cancelled',
  OTP_FAILED: 'Wrong delivery OTP entered',
};

/** The order's own event log, oldest first - not a template. */
export function AuditTimeline({ data }: { data: any }) {
  const events: any[] = data.events ?? [];
  if (events.length === 0) {
    return (
      <Timeline
        mode="left"
        style={{ marginTop: 12 }}
        items={[{ color: 'green', children: <Space direction="vertical" size={0}><Text strong style={{ fontSize: 13 }}>Order Created & Placed</Text><Text type="secondary" style={{ fontSize: 11 }}>{formatDateTime(data.createdAt)}</Text></Space> }]}
      />
    );
  }
  return (
    <Timeline
      mode="left"
      style={{ marginTop: 12 }}
      items={events.map((e) => ({
        color: e.type === 'CANCELLED' || e.type === 'OTP_FAILED' ? 'red' : 'green',
        children: (
          <Space direction="vertical" size={0}>
            <Text strong style={{ fontSize: 13 }}>{EVENT_TITLE[e.type] ?? e.type.replace(/_/g, ' ').toLowerCase()}</Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {formatDateTime(e.createdAt)}{e.actor?.fullName ? ` · by ${e.actor.fullName}` : ''}{e.note ? ` · ${e.note}` : ''}
            </Text>
          </Space>
        ),
      }))}
    />
  );
}

/** Gateway reference block used in the billing summary. */
export function PaymentReference({ data }: { data: any }) {
  const ref = data.gatewayPaymentId;
  return (
    <>
      <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
        {data.paymentMode === 'ONLINE' ? 'Payment Gateway Transaction ID:' : 'Payment:'}
      </Text>
      <Space align="center">
        {ref ? <Text code copyable={{ text: ref }} style={{ fontSize: 12, fontWeight: 700 }}>{ref}</Text> : <Text type="secondary" style={{ fontSize: 12 }}>{data.paymentMode === 'ONLINE' ? 'Awaiting payment' : DASH}</Text>}
        <Tag color={data.paymentStatus === 'PAID' ? 'green' : 'orange'} style={{ margin: 0 }}>{paymentLabel(data)}</Tag>
      </Space>
    </>
  );
}
