import { CheckOutlined, CloseOutlined, IdcardOutlined } from '@ant-design/icons';
import { Avatar, Button, Card, Col, Empty, Image, Input, Row, Space, Spin, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RiderRow } from '@shared/api/delivery';
import { useCan } from '@shared/auth/useCan';
import { PageHeader } from '@shared/components/PageHeader';
import { useRiders } from '@shared/hooks/useDelivery';
import { ApproveModal, useRiderActions, vehicleText } from './riderParts';

dayjs.extend(relativeTime);

/**
 * Rider sign-ups waiting for review. A rider lands here once their phone is
 * verified; approving assigns the home outlet and lets them go online.
 */
export function PendingRidersPage() {
  const [q, setQ] = useState('');
  const pending = useRiders({ status: 'PENDING_APPROVAL', q: q || undefined });
  const unverified = useRiders({ status: 'PENDING_VERIFICATION' });
  const canManage = useCan('RIDERS_MANAGE');
  const actions = useRiderActions();
  const navigate = useNavigate();
  const [approve, setApprove] = useState<RiderRow | null>(null);
  const rows = pending.data ?? [];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="Pending Approval"
        subtitle="Riders who signed up in the rider app and verified their phone. Check the licence, then approve with a home outlet or reject with a reason."
        extra={<Input.Search allowClear placeholder="Name, phone" onSearch={setQ} style={{ width: 240 }} />}
      />
      {unverified.data?.length ? (
        <Typography.Text type="secondary">
          {unverified.data.length} more {unverified.data.length === 1 ? 'sign-up has' : 'sign-ups have'} not verified a phone yet and cannot be approved -{' '}
          <a onClick={() => navigate('/riders?status=PENDING_VERIFICATION')}>see them</a>.
        </Typography.Text>
      ) : null}

      {pending.isLoading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
      ) : rows.length === 0 ? (
        <Card className="page-card"><Empty description={q ? 'No application matches' : 'No riders are waiting for approval'} /></Card>
      ) : (
        <Row gutter={[16, 16]}>
          {rows.map((r) => (
            <Col key={r.id} xs={24} md={12} xl={8}>
              <Card className="page-card" style={{ height: '100%' }} styles={{ body: { display: 'flex', flexDirection: 'column', gap: 14, height: '100%' } }}>
                <Space align="start" style={{ justifyContent: 'space-between', width: '100%' }}>
                  <Space>
                    <Avatar size={48} src={r.photoUrl ?? undefined} style={{ background: '#ff8a00', fontSize: 20 }}>{r.fullName.charAt(0)}</Avatar>
                    <div>
                      <a onClick={() => navigate(`/riders/${r.id}`)} style={{ fontWeight: 600, fontSize: 15 }}>{r.fullName}</a>
                      <div><Typography.Text type="secondary">{r.phone}</Typography.Text></div>
                    </div>
                  </Space>
                  <Tag color="gold">Signed up {dayjs(r.createdAt).fromNow()}</Tag>
                </Space>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                  <Detail label="City" value={r.city ?? '—'} />
                  <Detail label="Vehicle" value={vehicleText(r.vehicleType, r.vehicleNumber)} />
                  <Detail label="Email" value={r.email ?? '—'} />
                  <Detail label="Licence no." value={r.licenceNumber ?? '—'} />
                </div>

                <div style={{ background: '#fafafa', borderRadius: 10, padding: 10, display: 'flex', alignItems: 'center', gap: 12, minHeight: 92 }}>
                  {r.documentUrl ? (
                    <Image src={r.documentUrl} width={110} height={72} style={{ objectFit: 'cover', borderRadius: 8 }} />
                  ) : (
                    <div style={{ width: 110, height: 72, borderRadius: 8, border: '1px dashed #d9d9d9', display: 'grid', placeItems: 'center', color: '#bfbfbf' }}><IdcardOutlined style={{ fontSize: 26 }} /></div>
                  )}
                  <Typography.Text type={r.documentUrl ? 'secondary' : 'warning'} style={{ fontSize: 12 }}>
                    {r.documentUrl ? 'Driving licence / ID. Click to enlarge.' : 'No licence photo uploaded yet. Approve only if you have checked it another way.'}
                  </Typography.Text>
                </div>

                {canManage ? (
                  <Space style={{ marginTop: 'auto' }}>
                    <Button type="primary" icon={<CheckOutlined />} onClick={() => setApprove(r)}>Approve</Button>
                    <Button danger icon={<CloseOutlined />} onClick={() => actions.reject(r)}>Reject</Button>
                    <Button type="link" onClick={() => navigate(`/riders/${r.id}`)}>View</Button>
                  </Space>
                ) : null}
              </Card>
            </Col>
          ))}
        </Row>
      )}
      <ApproveModal rider={approve} onClose={() => setApprove(null)} />
    </Space>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="page-field-label">{label}</div>
      <Typography.Text ellipsis={{ tooltip: value }} style={{ display: 'block' }}>{value}</Typography.Text>
    </div>
  );
}
