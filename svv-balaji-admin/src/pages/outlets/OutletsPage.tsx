import {
  BarChartOutlined,
  DeleteOutlined,
  DollarOutlined,
  EditOutlined,
  EyeOutlined,
  PhoneOutlined,
  PlusOutlined,
  QrcodeOutlined,
  RocketOutlined,
  SearchOutlined,
  ShopOutlined,
  StopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '@shared/api/client';
import type { PosOutlet, PosOutletInput, PosOutletInventoryRow } from '@shared/api/pos';
import { useAuth } from '@shared/auth/useAuth';
import { useCan } from '@shared/auth/useCan';
import { BranchSelect } from '@shared/components/pickers';
import { useDeletePosOutlet, usePosOutlet, usePosOutlets, useSavePosOutlet, useSetPosOutletActive } from '@shared/hooks/usePos';
import { Can } from '../../components/Can';
import { PageHeader } from '../../components/PageHeader';
import { formatCurrency, formatDateTime } from '../../utils/format';

const { Text, Title } = Typography;

/**
 * Company-owned stores and their POS counters, from the database - so a store
 * registered on one device is there on every other. Each store has its own
 * stock location; everything under "today" is computed from recorded sales,
 * shifts and stock, never typed in. (Franchise outlets are a future module.)
 */
export function OutletsPage() {
  const { message } = AntApp.useApp();
  const canManage = useCan('POS_OUTLETS_MANAGE');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const outlets = usePosOutlets({ search: search || undefined, includeInactive: showInactive });
  const [inspectId, setInspectId] = useState<string | undefined>();
  const [editing, setEditing] = useState<PosOutlet | null | undefined>(undefined); // undefined = closed, null = new
  const setActive = useSetPosOutletActive();
  const remove = useDeletePosOutlet();

  const list = outlets.data ?? [];
  const metrics = useMemo(
    () => ({
      count: list.filter((o) => o.isActive).length,
      cash: list.reduce((a, o) => a + o.today.cash, 0),
      digital: list.reduce((a, o) => a + o.today.upi + o.today.card, 0),
      valuation: list.reduce((a, o) => a + o.stock.valuation, 0),
    }),
    [list],
  );

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      message.success(ok);
    } catch (e) {
      message.error(apiErrorMessage(e, 'That did not work'), 8);
    }
  };

  const columns: ColumnsType<PosOutlet> = [
    {
      title: 'Store',
      key: 'outlet',
      width: 280,
      render: (_, o) => (
        <Space align="start" size={12}>
          <Avatar shape="square" size={44} icon={<ShopOutlined />} style={{ backgroundColor: o.isActive ? '#1677ff' : '#bfbfbf', color: '#fff', flexShrink: 0 }} />
          <Space direction="vertical" size={2}>
            <Text strong style={{ fontSize: 13, color: '#0f172a' }}>{o.name}</Text>
            <Space size={6} wrap>
              <Tag color="cyan" style={{ fontSize: 10 }}>{o.code}</Tag>
              {!o.isActive ? <Tag>Inactive</Tag> : null}
              <Text type="secondary" style={{ fontSize: 11 }}>📍 {o.city}, {o.state}</Text>
            </Space>
          </Space>
        </Space>
      ),
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: 'Manager & POS',
      key: 'manager',
      width: 190,
      render: (_, o) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ fontSize: 12 }}>{o.managerName ?? '—'}</Text>
          {o.managerPhone ? <Text type="secondary" style={{ fontSize: 11 }}>📞 {o.managerPhone}</Text> : null}
          <Tag color="purple" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>{o.posTerminalsCount} POS terminal{o.posTerminalsCount === 1 ? '' : 's'}</Tag>
        </Space>
      ),
    },
    {
      title: "Today's counter sales",
      key: 'sales',
      width: 180,
      render: (_, o) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ fontSize: 13, color: '#15803d' }}>{formatCurrency(o.today.total)}</Text>
          <Text type="secondary" style={{ fontSize: 10 }}>Cash {formatCurrency(o.today.cash)} · Digital {formatCurrency(o.today.upi + o.today.card)}</Text>
        </Space>
      ),
      sorter: (a, b) => a.today.total - b.today.total,
    },
    {
      title: 'Counter',
      key: 'status',
      width: 150,
      render: (_, o) =>
        o.counterStatus === 'OPEN' ? (
          <Tooltip title={o.openShifts.map((s) => `${s.shiftNumber} · ${s.cashierName}`).join('\n')}>
            <Tag color="green">OPEN · {o.openShifts.length} shift{o.openShifts.length === 1 ? '' : 's'}</Tag>
          </Tooltip>
        ) : (
          <Tag color="gold">CLOSED</Tag>
        ),
    },
    {
      title: 'Last reconciliation',
      key: 'rec',
      width: 170,
      render: (_, o) =>
        !o.lastReconciliation ? (
          <Text type="secondary">No shift closed yet</Text>
        ) : o.lastReconciliation.status === 'BALANCED' ? (
          <Tag color="success">✔ BALANCED</Tag>
        ) : (
          <Tag color="warning">{formatCurrency(o.lastReconciliation.discrepancy)}</Tag>
        ),
    },
    {
      title: 'Store stock',
      key: 'stock',
      width: 150,
      render: (_, o) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ fontSize: 12 }}>{o.stock.packs} packs</Text>
          <Text type="secondary" style={{ fontSize: 10 }}>Value {formatCurrency(o.stock.valuation)}</Text>
          {o.stock.lowStockCount > 0 ? <Tag color="error" style={{ fontSize: 10, margin: 0 }}>{o.stock.lowStockCount} low</Tag> : null}
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_, o) => (
        <Space size={6}>
          <Button type="primary" size="small" icon={<EyeOutlined />} onClick={() => setInspectId(o.id)} style={{ borderRadius: 6 }}>Inspect</Button>
          {canManage ? (
            <>
              <Tooltip title="Edit"><Button size="small" icon={<EditOutlined />} onClick={() => setEditing(o)} /></Tooltip>
              <Tooltip title={o.isActive ? 'Deactivate' : 'Reactivate'}>
                <Button
                  size="small"
                  icon={<StopOutlined />}
                  onClick={() => void act(() => setActive.mutateAsync({ id: o.id, isActive: !o.isActive }), o.isActive ? `${o.name} deactivated` : `${o.name} reactivated`)}
                />
              </Tooltip>
              <Popconfirm
                title="Delete store"
                description="Only a store that never traded and holds no stock can be deleted."
                onConfirm={() => void act(() => remove.mutateAsync(o.id), `${o.name} deleted`)}
                okText="Delete"
                okButtonProps={{ danger: true }}
              >
                <Tooltip title="Delete"><Button size="small" danger icon={<DeleteOutlined />} /></Tooltip>
              </Popconfirm>
            </>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <Can do="POS_OUTLETS_VIEW" fallback={<div style={{ padding: 24 }}>Access Denied</div>}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <PageHeader
          title="Stores & POS Terminals"
          subtitle="Company-owned stores, their POS counters, live counter sales, shifts and store stock. Stores are saved centrally and appear on every device."
          actions={canManage ? [<Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditing(null)}>Register New Store</Button>] : undefined}
        />

        <Row gutter={[12, 12]}>
          <Col xs={24} sm={6}>
            <Card size="small" style={{ borderRadius: 8 }} loading={outlets.isLoading}>
              <Statistic title="Active stores" value={metrics.count} prefix={<ShopOutlined style={{ color: '#1677ff', fontSize: 18 }} />} valueStyle={{ fontSize: 22, fontWeight: 700 }} />
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card size="small" style={{ borderRadius: 8 }} loading={outlets.isLoading}>
              <Statistic title="Cash taken today" value={metrics.cash} prefix={<DollarOutlined style={{ color: '#16a34a', fontSize: 18 }} />} precision={0} valueStyle={{ color: '#16a34a', fontSize: 22, fontWeight: 700 }} />
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card size="small" style={{ borderRadius: 8 }} loading={outlets.isLoading}>
              <Statistic title="UPI & card today" value={metrics.digital} prefix={<QrcodeOutlined style={{ color: '#0284c7', fontSize: 18 }} />} precision={0} valueStyle={{ color: '#0284c7', fontSize: 22, fontWeight: 700 }} />
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card size="small" style={{ borderRadius: 8 }} loading={outlets.isLoading}>
              <Statistic title="Store stock value (ex-GST)" value={metrics.valuation} prefix={<BarChartOutlined style={{ color: '#7c3aed', fontSize: 18 }} />} precision={0} valueStyle={{ color: '#7c3aed', fontSize: 22, fontWeight: 700 }} />
            </Card>
          </Col>
        </Row>

        <Card bodyStyle={{ padding: 16 }} style={{ borderRadius: 8 }}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Row justify="space-between" align="middle" gutter={[12, 12]}>
              <Col><Text strong style={{ fontSize: 14 }}>Stores ({list.length})</Text></Col>
              <Col>
                <Space wrap>
                  <Space size={6}><Switch size="small" checked={showInactive} onChange={setShowInactive} /><Text>Show inactive</Text></Space>
                  <Input.Search placeholder="Name, code, city or manager" prefix={<SearchOutlined />} allowClear onSearch={(v) => setSearch(v.trim())} style={{ width: 300 }} />
                </Space>
              </Col>
            </Row>
            {outlets.error ? <Alert type="error" showIcon message={apiErrorMessage(outlets.error, 'Could not load stores')} /> : null}
            <Table<PosOutlet>
              columns={columns}
              dataSource={list}
              rowKey="id"
              loading={outlets.isLoading}
              pagination={{ pageSize: 10, showSizeChanger: true }}
              size="middle"
              scroll={{ x: 1300 }}
              locale={{ emptyText: canManage ? 'No stores yet - register the first one' : 'No stores yet' }}
            />
          </Space>
        </Card>

        <OutletDetailDrawer id={inspectId} onClose={() => setInspectId(undefined)} />
        {editing !== undefined ? <OutletFormModal outlet={editing} onClose={() => setEditing(undefined)} /> : null}
      </Space>
    </Can>
  );
}

function OutletDetailDrawer({ id, onClose }: { id?: string; onClose: () => void }) {
  const q = usePosOutlet(id);
  const o = q.data;
  return (
    <Drawer
      title={o ? (
        <Space align="center" size={12}>
          <ShopOutlined style={{ color: '#1677ff', fontSize: 20 }} />
          <div>
            <Title level={5} style={{ margin: 0 }}>{o.name}</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>{o.code} · {o.branch?.name}</Text>
          </div>
        </Space>
      ) : 'Store'}
      width={Math.min(780, window.innerWidth)}
      open={Boolean(id)}
      onClose={onClose}
    >
      {q.error ? <Alert type="error" showIcon message={apiErrorMessage(q.error, 'Could not load the store')} /> : null}
      {o ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card size="small" style={{ borderRadius: 12, background: o.counterStatus === 'OPEN' ? '#f6ffed' : '#fffbe6', borderColor: o.counterStatus === 'OPEN' ? '#b7eb8f' : '#ffe58f' }}>
            <Space direction="vertical" size={4}>
              <Space size={8} wrap>
                <Tag color={o.counterStatus === 'OPEN' ? 'green' : 'gold'} style={{ fontWeight: 700 }}>COUNTER {o.counterStatus}</Tag>
                {o.openShifts.map((s) => <Tag key={s.id}>{s.shiftNumber} · {s.cashierName} since {formatDateTime(s.openedAt)}</Tag>)}
              </Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {o.lastReconciliation
                  ? `Last reconciled ${formatDateTime(o.lastReconciliation.closedAt)} (${o.lastReconciliation.shiftNumber}): ${o.lastReconciliation.status === 'BALANCED' ? 'balanced' : `difference ${formatCurrency(o.lastReconciliation.discrepancy)}`}`
                  : 'No shift has been closed here yet'}
              </Text>
            </Space>
          </Card>

          <Card size="small" title="1. Location & manager" style={{ borderRadius: 8 }}>
            <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered>
              <Descriptions.Item label="Store code"><Text code>{o.code}</Text></Descriptions.Item>
              <Descriptions.Item label="Manager">{o.managerName ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Manager phone">{o.managerPhone ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Default cashier">{o.defaultCashierName ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Address" span={2}>{o.address}, {o.city}{o.district ? `, ${o.district}` : ''}, {o.state}{o.pincode ? ` - ${o.pincode}` : ''}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card size="small" title={<Space><DollarOutlined style={{ color: '#52c41a' }} /><span>2. Today's counter takings</span></Space>} style={{ borderRadius: 8, background: '#f8fafc' }}>
            <Row gutter={[12, 12]}>
              <Col xs={12} sm={6}><Statistic title="Bills" value={o.today.salesCount} valueStyle={{ fontSize: 16 }} /></Col>
              <Col xs={12} sm={6}><Statistic title="Cash" value={o.today.cash} prefix="₹" valueStyle={{ fontSize: 16, color: '#16a34a' }} /></Col>
              <Col xs={12} sm={6}><Statistic title="UPI" value={o.today.upi} prefix="₹" valueStyle={{ fontSize: 16, color: '#0284c7' }} /></Col>
              <Col xs={12} sm={6}><Statistic title="Card" value={o.today.card} prefix="₹" valueStyle={{ fontSize: 16, color: '#7c3aed' }} /></Col>
            </Row>
            <Divider style={{ margin: '12px 0' }} />
            <Text type="secondary">Total today: </Text><Text strong>{formatCurrency(o.today.total)}</Text>
            <Text type="secondary"> · Shift-by-shift reconciliation is on <Link to="/pos-reports">POS Reports</Link>.</Text>
          </Card>

          <Card
            size="small"
            title="3. Store stock & reorder levels"
            extra={<Link to="/finished-goods"><Button size="small" type="dashed" icon={<RocketOutlined />}>Transfer stock in</Button></Link>}
            style={{ borderRadius: 8 }}
          >
            <Table<PosOutletInventoryRow>
              dataSource={o.inventory ?? []}
              rowKey="productId"
              pagination={false}
              size="small"
              scroll={{ x: 560 }}
              locale={{ emptyText: 'No stock here yet. Transfer finished goods to this store from the Finished Goods screen.' }}
              columns={[
                {
                  title: 'Product',
                  key: 'p',
                  render: (_, r) => (
                    <Space direction="vertical" size={0}>
                      <Text strong style={{ fontSize: 12 }}>{r.productName}</Text>
                      <Text type="secondary" style={{ fontSize: 10 }}>SKU {r.sku} · {r.unit}</Text>
                    </Space>
                  ),
                },
                {
                  title: 'Stock',
                  key: 's',
                  width: 170,
                  render: (_, r) => (
                    <Space direction="vertical" size={0}>
                      <Text strong style={{ color: r.lowStock ? '#cf1322' : '#15803d', fontSize: 13 }}>{r.sellable} sellable</Text>
                      {r.packs !== r.sellable ? <Text type="secondary" style={{ fontSize: 10 }}>{r.packs} on hand (rest held, expired or reserved)</Text> : null}
                      {r.lowStock ? <Tag color="error" style={{ fontSize: 9, margin: 0 }}>LOW (≤{r.reorderLevel})</Tag> : null}
                    </Space>
                  ),
                },
                { title: 'Counter price (ex-GST)', key: 'price', width: 150, render: (_, r) => (r.unitPrice === null ? <Tag color="red">No B2C price</Tag> : formatCurrency(r.unitPrice)) },
              ]}
            />
          </Card>
        </Space>
      ) : null}
    </Drawer>
  );
}

function OutletFormModal({ outlet, onClose }: { outlet: PosOutlet | null; onClose: () => void }) {
  const { message } = AntApp.useApp();
  const { user } = useAuth();
  const save = useSavePosOutlet();
  const [form] = Form.useForm<PosOutletInput>();
  const isEdit = Boolean(outlet);

  useEffect(() => {
    form.setFieldsValue(outlet ?? { posTerminalsCount: 1, defaultOpeningCash: 0, branchId: user?.branchId ?? undefined });
  }, [outlet, form, user]);

  return (
    <Modal
      title={isEdit ? `Edit store — ${outlet?.code}` : 'Register a new store'}
      open
      onCancel={onClose}
      okText={isEdit ? 'Save changes' : 'Register store'}
      okButtonProps={{ loading: save.isPending }}
      width={660}
      onOk={async () => {
        const v = await form.validateFields();
        const input = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'string' && x.trim() === '' ? null : x])) as PosOutletInput;
        if (isEdit) delete input.branchId;
        try {
          await save.mutateAsync({ id: outlet?.id, input });
          message.success(isEdit ? 'Store updated' : 'Store registered - transfer stock to it to start selling');
          onClose();
        } catch (e) {
          message.error(apiErrorMessage(e, 'Could not save the store'), 8);
        }
      }}
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col xs={24} sm={14}><Form.Item name="name" label="Store name" rules={[{ required: true, min: 2, max: 120 }]}><Input placeholder="e.g. Ranchi Retail Store" /></Form.Item></Col>
          <Col xs={24} sm={10}>
            <Form.Item name="code" label="Store code" normalize={(v: string) => v?.toUpperCase()} rules={[{ required: true, pattern: /^[A-Za-z0-9-]{2,30}$/, message: '2-30 letters, digits or dashes' }]}>
              <Input placeholder="e.g. OUT-RNC-05" />
            </Form.Item>
          </Col>
        </Row>
        {!isEdit && user?.role === 'SUPER_ADMIN' ? (
          <Form.Item name="branchId" label="Branch" rules={[{ required: true, message: 'Choose the branch' }]}><BranchSelect /></Form.Item>
        ) : null}
        <Row gutter={16}>
          <Col xs={24} sm={8}><Form.Item name="city" label="City" rules={[{ required: true, min: 2 }]}><Input /></Form.Item></Col>
          <Col xs={24} sm={8}><Form.Item name="district" label="District"><Input /></Form.Item></Col>
          <Col xs={24} sm={8}>
            <Form.Item name="state" label="State" rules={[{ required: true, min: 2 }]} extra="Decides CGST+SGST vs IGST on this store's invoices">
              <Input placeholder="e.g. Maharashtra" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={16}><Form.Item name="address" label="Address" rules={[{ required: true, min: 3 }]}><Input.TextArea rows={2} /></Form.Item></Col>
          <Col xs={24} sm={8}><Form.Item name="pincode" label="Pincode" rules={[{ pattern: /^\d{6}$/, message: '6 digits' }]}><Input maxLength={6} /></Form.Item></Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={12}><Form.Item name="managerName" label="Store manager"><Input prefix={<UserOutlined />} /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="managerPhone" label="Manager phone"><Input prefix={<PhoneOutlined />} /></Form.Item></Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={8}><Form.Item name="defaultCashierName" label="Default cashier"><Input /></Form.Item></Col>
          <Col xs={12} sm={8}><Form.Item name="posTerminalsCount" label="POS terminals"><InputNumber min={1} max={50} style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={12} sm={8}>
            <Form.Item name="defaultOpeningCash" label="Default opening cash" extra="Suggested when a shift opens">
              <InputNumber min={0} prefix="₹" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        {!isEdit ? (
          <Alert type="info" showIcon message="A stock location is created for this store automatically. Transfer finished goods to it before the first sale." />
        ) : null}
      </Form>
    </Modal>
  );
}
