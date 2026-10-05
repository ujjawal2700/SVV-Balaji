import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Segmented, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VerificationQueueRow } from '@shared/api/delivery';
import { useCan } from '@shared/auth/useCan';
import { PageHeader } from '@shared/components/PageHeader';
import { useDocumentTypes, useVerificationQueue } from '@shared/hooks/useDelivery';
import { OutletSelect, RIDER_STATUS, RiderCell } from './riderParts';
import { DocFiles, useDocumentReview } from './verificationParts';

dayjs.extend(relativeTime);

/**
 * Every rider document waiting for a check - driving licence, ID, the Police
 * Clearance Certificate and whatever else Super Admin requires - oldest first.
 * A rider gets no orders until all their mandatory ones are approved.
 */
export function RiderVerificationQueuePage() {
  const [type, setType] = useState<string>('');
  const [warehouseId, setWarehouseId] = useState<string | undefined>();
  const q = useVerificationQueue({ type: type || undefined, warehouseId });
  const types = useDocumentTypes();
  const canVerify = useCan('RIDERS_VERIFY');
  const review = useDocumentReview();
  const navigate = useNavigate();

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="Document Verification"
        subtitle="Documents and Police Clearance Certificates riders have uploaded, waiting for a check. Approve each one, or reject it with a reason - the rider sees the reason and uploads again."
        extra={<OutletSelect allowClear placeholder="All outlets" style={{ width: 220 }} value={warehouseId} onChange={setWarehouseId} />}
      />
      <Segmented
        value={type}
        onChange={(v) => setType(String(v))}
        options={[{ value: '', label: 'All' }, ...(types.data ?? []).filter((t) => t.isActive || t.isSystem).map((t) => ({ value: t.code, label: t.code === 'PCC' ? 'PCC' : t.name }))]}
      />
      <Card className="page-card" styles={{ body: { padding: 0 } }}>
        <Table<VerificationQueueRow>
          rowKey="id" loading={q.isLoading} dataSource={q.data ?? []} scroll={{ x: 1000 }} pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty description="Nothing waiting for review" /> }}
          columns={[
            {
              title: 'Rider', key: 'r', width: 240,
              render: (_, d) => <RiderCell rider={d.rider} onOpen={() => navigate(`/riders/${d.rider.id}?tab=verification`)} sub={`${d.rider.phone}${d.rider.warehouse ? ` · ${d.rider.warehouse.name}` : ''}`} />,
            },
            {
              title: 'Document', key: 't',
              render: (_, d) => (
                <div>
                  <Space size={4}><b>{d.type.name}</b>{d.type.isSystem ? <Tag color="purple">PCC</Tag> : null}</Space>
                  <div><Tag color={RIDER_STATUS[d.rider.status].color} style={{ marginTop: 4 }}>{RIDER_STATUS[d.rider.status].label}</Tag></div>
                </div>
              ),
            },
            {
              title: 'Details', key: 'd',
              render: (_, d) => (
                <Typography.Text style={{ fontSize: 13 }}>
                  {[d.documentNumber && `No. ${d.documentNumber}`, d.issuedBy && `By ${d.issuedBy}`, d.issuedOn && `Issued ${dayjs(d.issuedOn).format('D MMM YYYY')}`, d.expiresOn && `Valid till ${dayjs(d.expiresOn).format('D MMM YYYY')}`]
                    .filter(Boolean).map((x) => <div key={x as string}>{x}</div>)}
                </Typography.Text>
              ),
            },
            { title: 'Files', key: 'f', render: (_, d) => <DocFiles urls={d.fileUrls} size={56} /> },
            { title: 'Waiting', key: 'w', render: (_, d) => <Typography.Text type={dayjs().diff(d.uploadedAt, 'hour') > 24 ? 'danger' : 'secondary'}>{dayjs(d.uploadedAt).fromNow()}</Typography.Text> },
            ...(canVerify ? [{
              title: '', key: 'a', fixed: 'right' as const, width: 200,
              render: (_: unknown, d: VerificationQueueRow) => (
                <Space>
                  <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => review.approve(d, d.type.name, d.rider.fullName)}>Approve</Button>
                  <Button danger size="small" icon={<CloseOutlined />} onClick={() => review.reject(d, d.type.name, d.rider.fullName)}>Reject</Button>
                </Space>
              ),
            }] : []),
          ]}
        />
      </Card>
    </Space>
  );
}
