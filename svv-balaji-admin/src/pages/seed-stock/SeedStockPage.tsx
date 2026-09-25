import { HistoryOutlined, MinusCircleOutlined, PlusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import {
  App as AntApp,
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { SeedStockLot, SeedStockMovement, SeedStockMovementType } from '@shared/api/types';
import { useAuth } from '@shared/auth/useAuth';
import { useCan } from '@shared/auth/useCan';
import { DataTable } from '@shared/components/DataTable';
import { PageHeader } from '@shared/components/PageHeader';
import { BranchSelect } from '@shared/components/pickers';
import { Sheet } from '@shared/components/Sheet';
import {
  useAdjustSeedStock,
  useDeleteSeedStock,
  useReceiveSeedStock,
  useSeedStock,
  useSeedStockLot,
  useTopUpSeedStock,
  useUpdateSeedStock,
} from '@shared/hooks/useSeedStock';
import { EM_DASH, formatDate, formatDateTime } from '@shared/utils/format';
import { positiveNumber, required } from '@shared/validation/rules';

const UNITS = ['KG', 'GRAM', 'QUINTAL', 'PACKET', 'LITRE'];

const MOVEMENT: Record<SeedStockMovementType, { label: string; color: string }> = {
  RECEIPT: { label: 'Received', color: 'green' },
  DISTRIBUTION: { label: 'Issued to farmer', color: 'blue' },
  DISTRIBUTION_REVERSAL: { label: 'Returned from handout', color: 'cyan' },
  ADJUSTMENT: { label: 'Adjustment', color: 'orange' },
};

const qty = (value: string | number, unit: string) => `${Number(value).toLocaleString('en-IN')} ${unit}`;
const isExpired = (lot: SeedStockLot) => Boolean(lot.expiryDate) && dayjs(lot.expiryDate).isBefore(dayjs(), 'day');

/**
 * FRD 10.2 - seed & input stock.
 *
 * Lots are received here. Handouts logged in Seed Distribution (admin or field
 * app) deduct from them automatically, and every change is in the lot's ledger.
 */
export function SeedStockPage() {
  const { message, modal } = AntApp.useApp();
  const { user } = useAuth();
  const canManage = useCan('SEED_STOCK_MANAGE');
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [branchId, setBranchId] = useState<string | undefined>();
  const [showWithdrawn, setShowWithdrawn] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [change, setChange] = useState<{ lot: SeedStockLot; mode: 'receive' | 'adjust' } | null>(null);
  const [ledgerFor, setLedgerFor] = useState<string | null>(null);

  const stock = useSeedStock({ branchId, includeInactive: showWithdrawn });
  const update = useUpdateSeedStock();
  const remove = useDeleteSeedStock();
  const rows = stock.data?.data ?? [];

  // On-hand totals per seed across lots, for the summary strip.
  const totals = useMemo(() => {
    const map = new Map<string, { name: string; unit: string; qty: number; lots: number }>();
    for (const lot of rows) {
      if (!lot.isActive) continue;
      const key = `${lot.seedName}|${lot.seedVariety ?? ''}|${lot.unit}`;
      const t = map.get(key) ?? { name: `${lot.seedName}${lot.seedVariety ? ` · ${lot.seedVariety}` : ''}`, unit: lot.unit, qty: 0, lots: 0 };
      t.qty += Number(lot.quantityOnHand);
      t.lots += 1;
      map.set(key, t);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const setActive = async (lot: SeedStockLot, isActive: boolean) => {
    try {
      await update.mutateAsync({ id: lot.id, input: { isActive } });
      message.success(isActive ? 'Lot restored' : 'Lot withdrawn — it can no longer be issued');
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not update the lot'));
    }
  };

  const columns: ColumnsType<SeedStockLot> = [
    {
      title: 'Seed / input',
      key: 'seed',
      render: (_, lot) => (
        <div>
          <div style={{ fontWeight: 600 }}>{lot.seedName}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {[lot.seedVariety, lot.batchNumber].filter(Boolean).join(' · ') || EM_DASH}
          </Typography.Text>
        </div>
      ),
      sorter: (a, b) => a.seedName.localeCompare(b.seedName),
    },
    {
      title: 'On hand',
      key: 'onHand',
      align: 'right',
      sorter: (a, b) => Number(a.quantityOnHand) - Number(b.quantityOnHand),
      render: (_, lot) => (
        <Typography.Text strong type={Number(lot.quantityOnHand) === 0 ? 'danger' : undefined}>
          {qty(lot.quantityOnHand, lot.unit)}
        </Typography.Text>
      ),
    },
    { title: 'Branch', key: 'branch', render: (_, lot) => lot.branch?.name ?? EM_DASH },
    { title: 'Supplier', dataIndex: 'supplier', key: 'supplier', render: (v: string | null) => v ?? EM_DASH },
    { title: 'Received', dataIndex: 'receivedAt', key: 'receivedAt', render: (v: string) => formatDate(v) },
    {
      title: 'Expiry',
      key: 'expiry',
      render: (_, lot) =>
        lot.expiryDate ? (
          <Typography.Text type={isExpired(lot) ? 'danger' : undefined}>
            {formatDate(lot.expiryDate)}
            {isExpired(lot) ? ' (expired)' : ''}
          </Typography.Text>
        ) : (
          EM_DASH
        ),
    },
    { title: 'Handouts', key: 'issued', align: 'right', render: (_, lot) => lot._count?.distributions ?? 0 },
    {
      title: 'Status',
      key: 'status',
      render: (_, lot) => (lot.isActive ? <Tag color="green">Active</Tag> : <Tag>Withdrawn</Tag>),
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 190,
      render: (_, lot) => (
        <Space size={4}>
          <Button size="small" icon={<HistoryOutlined />} onClick={() => setLedgerFor(lot.id)}>
            Ledger
          </Button>
          {canManage ? (
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'receive', icon: <PlusCircleOutlined />, label: 'Receive more', disabled: !lot.isActive },
                  { key: 'adjust', icon: <MinusCircleOutlined />, label: 'Adjust / write off' },
                  { type: 'divider' },
                  lot.isActive ? { key: 'withdraw', label: 'Withdraw lot' } : { key: 'restore', label: 'Restore lot' },
                  { key: 'delete', danger: true, label: 'Delete (received in error)', disabled: (lot._count?.distributions ?? 0) > 0 },
                ],
                onClick: ({ key }) => {
                  if (key === 'receive' || key === 'adjust') setChange({ lot, mode: key });
                  if (key === 'withdraw') void setActive(lot, false);
                  if (key === 'restore') void setActive(lot, true);
                  if (key === 'delete') {
                    modal.confirm({
                      title: `Delete this lot of ${lot.seedName}?`,
                      content: 'Only for a lot received in error. Its ledger is deleted with it.',
                      okText: 'Delete',
                      okButtonProps: { danger: true },
                      onOk: () =>
                        remove.mutateAsync(lot.id).then(
                          () => void message.success('Lot deleted'),
                          (e) => void message.error(apiErrorMessage(e, 'Could not delete the lot')),
                        ),
                    });
                  }
                },
              }}
            >
              <Button size="small">More</Button>
            </Dropdown>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="Seed Stock"
        subtitle="Certified seed and agri-inputs held at each branch (FRD 10.2). Handouts logged in Seed Distribution — from here or the field app — are deducted automatically."
        actions={
          canManage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setReceiveOpen(true)}>
              Receive stock
            </Button>
          ) : null
        }
      />

      {totals.length ? (
        <Row gutter={[12, 12]}>
          {totals.map((t) => (
            <Col key={`${t.name}${t.unit}`} xs={12} md={8} lg={6}>
              <Card size="small" style={{ borderRadius: 10 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t.name}</Typography.Text>
                <div style={{ fontSize: 20, fontWeight: 700, color: t.qty === 0 ? '#dc2626' : '#0f172a' }}>{qty(t.qty, t.unit)}</div>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>{t.lots} lot{t.lots === 1 ? '' : 's'}</Typography.Text>
              </Card>
            </Col>
          ))}
        </Row>
      ) : null}

      <Card size="small" style={{ borderRadius: 10 }}>
        <Space wrap size={16}>
          {isSuperAdmin ? (
            <BranchSelect allowClear placeholder="All branches" value={branchId} onChange={setBranchId} style={{ width: 220 }} />
          ) : null}
          <Space>
            <Switch checked={showWithdrawn} onChange={setShowWithdrawn} size="small" />
            <Typography.Text>Show withdrawn lots</Typography.Text>
          </Space>
        </Space>
      </Card>

      <DataTable<SeedStockLot>
        rows={rows}
        columns={columns}
        rowKey="id"
        isLoading={stock.isLoading}
        isFetching={stock.isFetching}
        error={stock.error}
        onRetry={() => void stock.refetch()}
        emptyText={canManage ? 'No seed stock yet — use "Receive stock" to add the first lot' : 'No seed stock recorded'}
      />

      <ReceiveLotSheet open={receiveOpen} onClose={() => setReceiveOpen(false)} askBranch={isSuperAdmin} />
      <ChangeQuantitySheet change={change} onClose={() => setChange(null)} />
      <LedgerDrawer lotId={ledgerFor} onClose={() => setLedgerFor(null)} />
    </Space>
  );
}

// --- Receive a new lot -------------------------------------------------------

interface ReceiveForm {
  branchId?: string;
  seedName: string;
  seedVariety?: string;
  batchNumber?: string;
  unit: string;
  quantity: number;
  supplier?: string;
  receivedAt: Dayjs;
  expiryDate?: Dayjs;
  notes?: string;
}

function ReceiveLotSheet({ open, onClose, askBranch }: { open: boolean; onClose: () => void; askBranch: boolean }) {
  const [form] = Form.useForm<ReceiveForm>();
  const { message } = AntApp.useApp();
  const receive = useReceiveSeedStock();

  const submit = async () => {
    const v = await form.validateFields();
    try {
      await receive.mutateAsync({
        branchId: v.branchId,
        seedName: v.seedName,
        seedVariety: v.seedVariety,
        batchNumber: v.batchNumber,
        unit: v.unit,
        quantity: v.quantity,
        supplier: v.supplier,
        // Calendar days, sent as dates so they cannot shift across timezones.
        receivedAt: v.receivedAt.format('YYYY-MM-DD'),
        expiryDate: v.expiryDate?.format('YYYY-MM-DD'),
        notes: v.notes,
      });
      message.success(`${v.quantity} ${v.unit} of ${v.seedName} received`);
      form.resetFields();
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not receive the stock'));
    }
  };

  return (
    <Sheet open={open} title="Receive seed / input stock" okText="Receive" onOk={submit} onCancel={onClose} confirmLoading={receive.isPending} width={640}>
      <Form form={form} layout="vertical" requiredMark preserve={false} initialValues={{ unit: 'KG', receivedAt: dayjs() }}>
        {askBranch ? (
          <Form.Item name="branchId" label="Branch" rules={[required('Branch')]}>
            <BranchSelect />
          </Form.Item>
        ) : null}
        <Row gutter={12}>
          <Col xs={24} md={12}>
            <Form.Item name="seedName" label="Seed / input" rules={[required('Seed or input')]}>
              <Input placeholder="e.g. Certified Wheat" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="seedVariety" label="Variety">
              <Input placeholder="e.g. HD-2967" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="batchNumber" label="Supplier lot / certification no.">
              <Input placeholder="As printed on the packaging" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="supplier" label="Supplier">
              <Input placeholder="Optional" />
            </Form.Item>
          </Col>
          <Col xs={16} md={8}>
            <Form.Item name="quantity" label="Quantity received" rules={[required('Quantity'), positiveNumber('Quantity')]}>
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
          </Col>
          <Col xs={8} md={4}>
            <Form.Item name="unit" label="Unit">
              <Select options={UNITS.map((u) => ({ value: u, label: u }))} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="receivedAt" label="Received on" rules={[required('Date')]}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="expiryDate" label="Expiry">
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </Form>
    </Sheet>
  );
}

// --- Receive more / adjust ------------------------------------------------------

function ChangeQuantitySheet({ change, onClose }: { change: { lot: SeedStockLot; mode: 'receive' | 'adjust' } | null; onClose: () => void }) {
  const [form] = Form.useForm<{ direction: 'add' | 'remove'; quantity: number; reason?: string }>();
  const { message } = AntApp.useApp();
  const topUp = useTopUpSeedStock();
  const adjust = useAdjustSeedStock();
  const lot = change?.lot;
  const isAdjust = change?.mode === 'adjust';

  const submit = async () => {
    if (!lot || !change) return;
    const v = await form.validateFields();
    try {
      if (isAdjust) {
        const signed = v.direction === 'remove' ? -v.quantity : v.quantity;
        await adjust.mutateAsync({ id: lot.id, quantity: signed, reason: v.reason as string });
        message.success('Stock adjusted');
      } else {
        await topUp.mutateAsync({ id: lot.id, quantity: v.quantity, reason: v.reason });
        message.success(`${v.quantity} ${lot.unit} added`);
      }
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not change the stock'));
    }
  };

  return (
    <Sheet
      open={Boolean(change)}
      title={lot ? `${isAdjust ? 'Adjust' : 'Receive more'} — ${lot.seedName}${lot.batchNumber ? ` (${lot.batchNumber})` : ''}` : ''}
      okText={isAdjust ? 'Adjust' : 'Receive'}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={topUp.isPending || adjust.isPending}
      width={480}
    >
      {lot ? (
        <Form form={form} layout="vertical" preserve={false} initialValues={{ direction: 'remove' }}>
          <Typography.Paragraph type="secondary">On hand now: {qty(lot.quantityOnHand, lot.unit)}</Typography.Paragraph>
          {isAdjust ? (
            <Form.Item name="direction" label="Change">
              <Radio.Group
                optionType="button"
                options={[
                  { value: 'remove', label: 'Remove (damage, expiry, recount short)' },
                  { value: 'add', label: 'Add (recount over)' },
                ]}
              />
            </Form.Item>
          ) : null}
          <Form.Item name="quantity" label={`Quantity (${lot.unit})`} rules={[required('Quantity'), positiveNumber('Quantity')]}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item
            name="reason"
            label="Reason"
            rules={isAdjust ? [required('Reason')] : []}
            extra={isAdjust ? 'Required — an adjustment is the one change nobody else can explain later.' : undefined}
          >
            <Input.TextArea rows={2} maxLength={500} placeholder={isAdjust ? 'e.g. 3 packets damaged by rain' : 'e.g. Second delivery, invoice 1142'} />
          </Form.Item>
        </Form>
      ) : null}
    </Sheet>
  );
}

// --- Ledger -----------------------------------------------------------------

function LedgerDrawer({ lotId, onClose }: { lotId: string | null; onClose: () => void }) {
  const lot = useSeedStockLot(lotId ?? undefined);
  const d = lot.data;
  return (
    <Drawer open={Boolean(lotId)} onClose={onClose} width={760} title={d ? `${d.seedName} — stock ledger` : 'Stock ledger'} destroyOnClose>
      {d ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text>
            {[d.seedVariety, d.batchNumber, d.branch?.name].filter(Boolean).join(' · ')} · on hand{' '}
            <strong>{qty(d.quantityOnHand, d.unit)}</strong>
          </Typography.Text>
          <Table<SeedStockMovement>
            size="small"
            rowKey="id"
            pagination={{ pageSize: 20 }}
            dataSource={d.movements}
            scroll={{ x: 640 }}
            columns={[
              { title: 'When', dataIndex: 'createdAt', render: (v: string) => formatDateTime(v) },
              { title: 'Movement', dataIndex: 'type', render: (t: SeedStockMovementType) => <Tag color={MOVEMENT[t].color}>{MOVEMENT[t].label}</Tag> },
              {
                title: 'Change',
                dataIndex: 'quantity',
                align: 'right',
                render: (v: string) => (
                  <Typography.Text type={Number(v) < 0 ? 'danger' : 'success'}>
                    {Number(v) > 0 ? '+' : ''}
                    {Number(v).toLocaleString('en-IN')}
                  </Typography.Text>
                ),
              },
              { title: 'Balance', dataIndex: 'balanceAfter', align: 'right', render: (v: string) => Number(v).toLocaleString('en-IN') },
              { title: 'Farmer / reason', key: 'why', render: (_, m) => m.farmer ? `${m.farmer.fullName}${m.reason ? ` — ${m.reason}` : ''}` : m.reason ?? EM_DASH },
              { title: 'By', key: 'by', render: (_, m) => m.performedBy?.fullName ?? EM_DASH },
            ]}
          />
        </Space>
      ) : (
        <Typography.Text type="secondary">Loading…</Typography.Text>
      )}
    </Drawer>
  );
}
