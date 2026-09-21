import { AlertOutlined, RollbackOutlined, StopOutlined } from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import { useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { BackwardTrace, BatchHoldStatus, ForwardTrace, RecallBatch, RecallShipment } from '../../api/types';
import { Can } from '../../components/Can';
import { PageHeader } from '../../components/PageHeader';
import { useBackwardTrace, useForwardTrace, useSetBatchHold } from '@shared/hooks/useRecall';
import { useReallocateOrder } from '@shared/hooks/useSales';
import { EM_DASH, formatDate } from '../../utils/format';
import { HoldTag } from './HoldTag';

/**
 * Super Admin & QA audit view.
 *
 * Forward: "this batch is bad - who got it?" Backward: "this pack is bad - what
 * made it?" Freeze/recall acts on FINISHED GOODS batches; a raw lot is handled
 * by freezing every pack batch made from it, which is what the forward view of
 * an RM lot lists.
 */
export function RecallPage() {
  const [tab, setTab] = useState('forward');
  const [backwardCode, setBackwardCode] = useState<string | undefined>();

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <PageHeader
          title="Recall & batch audit"
          subtitle="Trace a batch forward to every customer who received it, or a pack backward to the machine, raw lots and farmers behind it. Freeze or recall a batch when a complaint is confirmed."
        />
      </Card>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'forward',
            label: 'Forward — who received it',
            children: (
              <ForwardView
                onRootCause={(fg) => {
                  setBackwardCode(fg);
                  setTab('backward');
                }}
              />
            ),
          },
          {
            key: 'backward',
            label: 'Backward — root cause',
            children: <BackwardView code={backwardCode} onCode={setBackwardCode} />,
          },
        ]}
      />
    </Space>
  );
}

// -------------------------------------------------------------------- forward

function ForwardView({ onRootCause }: { onRootCause: (fg: string) => void }) {
  const [code, setCode] = useState<string | undefined>();
  const trace = useForwardTrace(code);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small">
        <Input.Search
          size="large"
          allowClear
          placeholder="FG-20260905-001 or RM-20260901-001"
          enterButton="Find"
          style={{ maxWidth: 520 }}
          onSearch={(v) => setCode(v.trim() || undefined)}
        />
      </Card>
      {!code ? null : trace.isLoading ? (
        <Spin />
      ) : trace.error ? (
        <Alert type="warning" showIcon message={apiErrorMessage(trace.error)} />
      ) : trace.data ? (
        <ForwardResult data={trace.data} onRootCause={onRootCause} />
      ) : null}
    </Space>
  );
}

function ForwardResult({ data, onRootCause }: { data: ForwardTrace; onRootCause: (fg: string) => void }) {
  const [action, setAction] = useState<BatchHoldStatus | null>(null);
  const { totals } = data;
  const actionable = data.batches.filter((b) => b.holdStatus !== 'RECALLED');

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small">
        <Row gutter={16}>
          <Col xs={12} md={4}><Statistic title="Pack batches" value={totals.batches} /></Col>
          <Col xs={12} md={4}><Statistic title="Orders" value={totals.orders} /></Col>
          <Col xs={12} md={4}><Statistic title="Customers" value={totals.customers} /></Col>
          <Col xs={12} md={4}><Statistic title="Packs shipped" value={totals.packsShipped} /></Col>
          <Col xs={12} md={4}><Statistic title="Allocated, not shipped" value={totals.packsAllocatedNotShipped} /></Col>
          <Col xs={12} md={4}><Statistic title="Packs in stock" value={totals.packsInStock} /></Col>
        </Row>
        <Can do="RECALL_MANAGE">
          {actionable.length > 0 ? (
            <Space style={{ marginTop: 16 }} wrap>
              <Button icon={<AlertOutlined />} onClick={() => setAction('ON_HOLD')}>
                Freeze {actionable.length > 1 ? `all ${actionable.length} batches` : 'batch'}
              </Button>
              <Button danger icon={<StopOutlined />} onClick={() => setAction('RECALLED')}>
                Recall {actionable.length > 1 ? `all ${actionable.length} batches` : 'batch'}
              </Button>
              <Button icon={<RollbackOutlined />} onClick={() => setAction('ACTIVE')}>
                Release hold
              </Button>
            </Space>
          ) : null}
        </Can>
      </Card>

      {data.batches.length === 0 ? (
        <Empty description={`Raw lot ${data.query} has not been used in any pack batch yet.`} />
      ) : (
        data.batches.map((b) => <BatchCard key={b.fgBatchNumber} batch={b} onRootCause={onRootCause} />)
      )}

      <HoldModal
        status={action}
        batches={actionable.map((b) => b.fgBatchNumber)}
        onClose={() => setAction(null)}
      />
    </Space>
  );
}

function BatchCard({ batch, onRootCause }: { batch: RecallBatch; onRootCause: (fg: string) => void }) {
  const { message, modal } = AntApp.useApp();
  const reallocate = useReallocateOrder();
  const held = batch.holdStatus !== 'ACTIVE';

  const run = (s: RecallShipment) =>
    modal.confirm({
      title: `Re-allocate ${s.orderNumber}?`,
      content: `Gives back the ${s.quantity} pack(s) reserved from ${batch.fgBatchNumber} and re-picks them from healthy stock (first-expiry-first-out).`,
      okText: 'Re-allocate',
      onOk: async () => {
        try {
          const res = await reallocate.mutateAsync(s.orderId);
          if (res.complete) message.success(`${s.orderNumber} re-allocated`);
          else
            message.warning(
              `${s.orderNumber}: only partly re-allocated — ${res.shortfalls.reduce((n, f) => n + f.short, 0)} pack(s) short`,
            );
        } catch (error) {
          message.error(apiErrorMessage(error));
        }
      },
    });

  return (
    <Card
      size="small"
      title={
        <Space>
          <Typography.Text code>{batch.fgBatchNumber}</Typography.Text>
          <span>{batch.product.name}</span>
          <HoldTag status={batch.holdStatus} />
        </Space>
      }
      extra={<Button size="small" onClick={() => onRootCause(batch.fgBatchNumber)}>Root cause</Button>}
    >
      {batch.holdReason ? (
        <Alert
          type={batch.holdStatus === 'RECALLED' ? 'error' : 'warning'}
          showIcon
          style={{ marginBottom: 12 }}
          message={batch.holdReason}
        />
      ) : null}
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
        Made {formatDate(batch.manufacturingDate)} · expires {formatDate(batch.expiryDate)} · {batch.packCount} packs ·
        in stock:{' '}
        {batch.stock.length
          ? batch.stock.map((s) => `${s.warehouse} ${s.quantity} (${s.reserved} reserved)`).join(', ')
          : 'none'}
      </Typography.Paragraph>
      <Table<RecallShipment>
        size="small"
        rowKey={(s) => `${s.orderNumber}-${s.warehouse}`}
        dataSource={batch.shipments}
        pagination={false}
        locale={{ emptyText: <Empty description="Not allocated to any order" /> }}
        columns={[
          { title: 'Order', dataIndex: 'orderNumber', render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
          {
            title: 'Customer',
            key: 'customer',
            render: (_: unknown, s) => (
              <Space direction="vertical" size={0}>
                <span>{s.customer.name}</span>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {s.customer.customerCode} · {s.customer.phone}
                </Typography.Text>
              </Space>
            ),
          },
          { title: 'Channel', dataIndex: 'channel', render: (v: string) => <Tag>{v}</Tag> },
          { title: 'Packs', dataIndex: 'quantity', align: 'right' as const },
          {
            title: 'Status',
            key: 'status',
            render: (_: unknown, s) => (
              <Tag color={s.shipped ? 'red' : 'gold'}>
                {s.shipped ? `Shipped ${formatDate(s.dispatchedAt)}` : s.orderStatus}
              </Tag>
            ),
          },
          {
            title: '',
            key: 'action',
            render: (_: unknown, s) =>
              held && !s.shipped && (s.orderStatus === 'ALLOCATED' || s.orderStatus === 'PACKED') ? (
                <Can do="ORDER_ALLOCATE">
                  <Button size="small" type="primary" onClick={() => run(s)}>
                    Re-allocate
                  </Button>
                </Can>
              ) : null,
          },
        ]}
      />
    </Card>
  );
}

function HoldModal({
  status,
  batches,
  onClose,
}: {
  status: BatchHoldStatus | null;
  batches: string[];
  onClose: () => void;
}) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<{ reason: string }>();
  const mutation = useSetBatchHold();

  const copy = {
    ON_HOLD: { title: 'Freeze', body: 'Frozen batches cannot be allocated or dispatched and show as unavailable on the storefront. Reversible.' },
    RECALLED: { title: 'Recall', body: 'Recall is FINAL. The batch can never be sold again, and anyone scanning its QR is told not to consume it.' },
    ACTIVE: { title: 'Release hold on', body: 'Returns the batch to sale.' },
  } as const;

  return (
    <Modal
      open={status !== null}
      title={status ? `${copy[status].title} ${batches.length} batch${batches.length === 1 ? '' : 'es'}` : ''}
      okText={status ? copy[status].title.replace(' on', '') : ''}
      okButtonProps={{ danger: status === 'RECALLED', loading: mutation.isPending }}
      onCancel={onClose}
      destroyOnClose
      onOk={async () => {
        const { reason } = await form.validateFields();
        try {
          const res = await mutation.mutateAsync({ fgBatchNumbers: batches, status: status as BatchHoldStatus, reason });
          message.success(`${res.changed.length} batch(es) updated`);
          form.resetFields();
          onClose();
        } catch (error) {
          message.error(apiErrorMessage(error));
        }
      }}
    >
      {status ? <Alert type={status === 'RECALLED' ? 'error' : 'info'} showIcon message={copy[status].body} style={{ marginBottom: 12 }} /> : null}
      <Typography.Paragraph type="secondary">{batches.join(', ')}</Typography.Paragraph>
      <Form form={form} layout="vertical">
        <Form.Item
          name="reason"
          label="Reason (kept on the audit trail)"
          rules={[{ required: true, min: 5, message: 'Give a reason of at least 5 characters' }]}
        >
          <Input.TextArea rows={3} maxLength={500} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ------------------------------------------------------------------- backward

function BackwardView({ code, onCode }: { code: string | undefined; onCode: (c: string | undefined) => void }) {
  const trace = useBackwardTrace(code);
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small">
        <Input.Search
          key={code ?? ''}
          size="large"
          allowClear
          defaultValue={code}
          placeholder="FG-20260905-001"
          enterButton="Trace back"
          style={{ maxWidth: 520 }}
          onSearch={(v) => onCode(v.trim() || undefined)}
        />
      </Card>
      {!code ? null : trace.isLoading ? (
        <Spin />
      ) : trace.error ? (
        <Alert type="warning" showIcon message={apiErrorMessage(trace.error)} />
      ) : trace.data ? (
        <BackwardResult data={trace.data} />
      ) : null}
    </Space>
  );
}

function BackwardResult({ data }: { data: BackwardTrace }) {
  const p = data.production;
  const money = (n: number | null) => (n === null ? EM_DASH : `₹${n.toLocaleString('en-IN')}`);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {data.holdStatus !== 'ACTIVE' ? (
        <Alert
          type={data.holdStatus === 'RECALLED' ? 'error' : 'warning'}
          showIcon
          message={`${data.fgBatchNumber} is ${data.holdStatus === 'RECALLED' ? 'recalled' : 'on hold'}`}
          description={data.holdReason}
        />
      ) : null}

      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card size="small" title="Production run">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Run">
                <Typography.Text code>{p.productionBatchNumber}</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="Milled">{formatDate(p.productionDate)}</Descriptions.Item>
              <Descriptions.Item label="Plant">{p.branch}</Descriptions.Item>
              <Descriptions.Item label="Machine">{p.machine ?? EM_DASH}</Descriptions.Item>
              <Descriptions.Item label="Line">{p.productionLine ?? EM_DASH}</Descriptions.Item>
              <Descriptions.Item label="Operator">{p.operator ?? EM_DASH}</Descriptions.Item>
              <Descriptions.Item label="Supervisor">{p.supervisor}</Descriptions.Item>
              <Descriptions.Item label="Yield">
                {p.actualQuantity ?? EM_DASH} of {p.plannedQuantity} planned
              </Descriptions.Item>
              <Descriptions.Item label="Loss">
                {p.lossQuantity === null ? EM_DASH : `${p.lossQuantity} (${p.lossPercent}%)`}
              </Descriptions.Item>
              <Descriptions.Item label="Packed">
                {formatDate(data.packing.packedOn)} by {data.packing.packedBy} ({data.packing.packagingType})
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="FIFO verification">
            {!data.fifo.checked ? (
              <Typography.Text type="secondary">Nothing from this batch has shipped yet, so there is nothing to verify.</Typography.Text>
            ) : data.fifo.compliant ? (
              <Alert type="success" showIcon message="FIFO respected — no older sellable batch was left on the shelf." />
            ) : (
              <>
                <Alert
                  type="error"
                  showIcon
                  message="Older stock was skipped"
                  description="These older batches are still sellable and on the shelf in a warehouse that shipped this batch."
                  style={{ marginBottom: 8 }}
                />
                <Table
                  size="small"
                  pagination={false}
                  rowKey="olderBatch"
                  dataSource={data.fifo.violations}
                  columns={[
                    { title: 'Older batch', dataIndex: 'olderBatch' },
                    { title: 'Warehouse', dataIndex: 'warehouse' },
                    { title: 'Expires', dataIndex: 'expiryDate', render: formatDate },
                    { title: 'Left', dataIndex: 'quantityRemaining', align: 'right' as const },
                  ]}
                />
              </>
            )}
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
              Compared against stock on the shelf now, not a replay of the dispatch day.
            </Typography.Paragraph>
          </Card>
        </Col>
      </Row>

      <Card size="small" title={`Raw lots, weighing slips & payouts (${data.rawLots.length})`}>
        <Table
          size="small"
          rowKey="batchNumber"
          pagination={false}
          dataSource={data.rawLots}
          scroll={{ x: true }}
          columns={[
            { title: 'Raw lot', dataIndex: 'batchNumber', render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
            { title: 'Crop', dataIndex: 'crop' },
            { title: 'Used (kg)', dataIndex: 'quantityUsed', align: 'right' as const },
            {
              title: 'Source',
              dataIndex: 'source',
              render: (s: BackwardTrace['rawLots'][number]['source']) =>
                s ? (
                  <Space direction="vertical" size={0}>
                    <span>{s.name} <Tag>{s.type}</Tag></span>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>{s.code} · {s.place}</Typography.Text>
                  </Space>
                ) : EM_DASH,
            },
            {
              title: 'Weighing slip',
              dataIndex: 'weighingSlip',
              render: (w: BackwardTrace['rawLots'][number]['weighingSlip']) =>
                w ? `${w.receiptNumber} · ${w.netWeight} kg net (${w.grossWeight} gross) · ${formatDate(w.date)}` : EM_DASH,
            },
            {
              title: 'Payout',
              dataIndex: 'payout',
              render: (x: BackwardTrace['rawLots'][number]['payout']) =>
                x ? `${money(x.totalAmount)} · ${x.paymentStatus}` : EM_DASH,
            },
          ]}
        />
      </Card>

      {data.holdHistory.length > 0 ? (
        <Card size="small" title="Freeze / recall history">
          <Timeline
            items={data.holdHistory.map((h) => ({
              children: `${formatDate(h.createdAt)} — ${h.fromStatus} → ${h.toStatus} by ${h.performedBy.fullName}: ${h.reason}`,
            }))}
          />
        </Card>
      ) : null}
    </Space>
  );
}
