import {
  CarOutlined,
  CheckCircleFilled,
  GlobalOutlined,
  IdcardOutlined,
  SendOutlined,
  ShopOutlined,
  TeamOutlined,
  UserOutlined,
  UsergroupAddOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Form,
  Input,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import {
  PUSH_KEYS,
  pushNotificationsApi,
  type Broadcast,
  type BroadcastAudience,
  type BroadcastAudienceType,
  type RecipientSearchResult,
} from '@shared/api/pushNotifications';
import { FileUploadField } from '@shared/components/FileUploadField';
import { Can } from '../../components/Can';
import { PageHeader } from '../../components/PageHeader';

const AUDIENCES: Array<{ value: BroadcastAudienceType; label: string; hint: string; icon: React.ReactNode }> = [
  { value: 'EVERYONE', label: 'Everyone', hint: 'Customers, retailers, riders and staff', icon: <GlobalOutlined /> },
  { value: 'CUSTOMERS', label: 'Customers', hint: 'B2C shoppers', icon: <UserOutlined /> },
  { value: 'RETAILERS', label: 'Retailers', hint: 'Approved B2B accounts', icon: <ShopOutlined /> },
  { value: 'RIDERS', label: 'Riders', hint: 'Active delivery partners', icon: <CarOutlined /> },
  { value: 'STAFF', label: 'Staff roles', hint: 'Sales executives, managers…', icon: <TeamOutlined /> },
  { value: 'SPECIFIC', label: 'Specific people', hint: 'Search and pick', icon: <IdcardOutlined /> },
];

const GROUP_COLORS: Record<string, string> = { Customer: 'green', Retailer: 'orange', Rider: 'purple' };

interface ComposeValues {
  title: string;
  body: string;
  imageUrl?: string;
  link?: string;
}

/** Wait until typing stops before asking the API how many people a filter matches. */
function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function PushNotificationsPage() {
  const { message, modal } = AntApp.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<ComposeValues>();
  const title = Form.useWatch('title', form);
  const body = Form.useWatch('body', form);
  const imageUrl = Form.useWatch('imageUrl', form);

  const [type, setType] = useState<BroadcastAudienceType>('CUSTOMERS');
  const [roles, setRoles] = useState<string[]>(['SALES_TEAM']);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [pincodes, setPincodes] = useState<string[]>([]);
  const [salesExecutiveIds, setSalesExecutiveIds] = useState<string[]>([]);
  const [warehouseIds, setWarehouseIds] = useState<string[]>([]);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [picked, setPicked] = useState<RecipientSearchResult[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const options = useQuery({ queryKey: PUSH_KEYS.options, queryFn: pushNotificationsApi.options });
  const history = useQuery({ queryKey: PUSH_KEYS.history(page), queryFn: () => pushNotificationsApi.history(page, 10) });

  const audience = useMemo<BroadcastAudience>(() => {
    switch (type) {
      case 'STAFF':
        return { type, roles, branchIds };
      case 'CUSTOMERS':
        return { type, cities, states, pincodes };
      case 'RETAILERS':
        return { type, cities, states, pincodes, salesExecutiveIds };
      case 'RIDERS':
        return { type, cities, warehouseIds, onlineOnly };
      case 'SPECIFIC':
        return { type, recipients: picked.map((p) => ({ kind: p.kind, id: p.id })) };
      default:
        return { type };
    }
  }, [type, roles, branchIds, cities, states, pincodes, salesExecutiveIds, warehouseIds, onlineOnly, picked]);

  const debouncedAudience = useDebounced(audience);
  const canPreview = !(debouncedAudience.type === 'SPECIFIC' && !debouncedAudience.recipients?.length);
  const preview = useQuery({
    queryKey: ['push-broadcasts', 'preview', debouncedAudience],
    queryFn: () => pushNotificationsApi.preview(debouncedAudience),
    enabled: canPreview,
  });

  const debouncedSearch = useDebounced(search, 300);
  const people = useQuery({
    queryKey: ['push-broadcasts', 'recipients', debouncedSearch],
    queryFn: () => pushNotificationsApi.search(debouncedSearch),
    enabled: type === 'SPECIFIC' && debouncedSearch.trim().length >= 2,
  });

  const send = useMutation({
    mutationFn: pushNotificationsApi.send,
    onSuccess: (b) => {
      message.success(
        b.pushEnabled
          ? `Sent to ${b.recipientCount} ${b.recipientCount === 1 ? 'person' : 'people'} - ${b.sentCount} pop-up${b.sentCount === 1 ? '' : 's'} delivered`
          : `Saved to ${b.recipientCount} inboxes (push is not configured on the server)`,
      );
      form.resetFields();
      setPage(1);
      void qc.invalidateQueries({ queryKey: ['push-broadcasts'] });
    },
    onError: (e) => message.error(apiErrorMessage(e, 'Could not send the notification')),
  });

  const onSend = async () => {
    const values = await form.validateFields();
    const p = preview.data;
    if (!p || p.total === 0) {
      message.warning('Nobody matches this audience yet - adjust the filters');
      return;
    }
    modal.confirm({
      title: `Send to ${p.total} ${p.total === 1 ? 'person' : 'people'}?`,
      icon: <SendOutlined style={{ color: '#16a34a' }} />,
      content: (
        <div>
          <p style={{ marginBottom: 6 }}>
            <b>{p.reachable}</b> {p.reachable === 1 ? 'is' : 'are'} signed in on a device and will get a pop-up now. Everyone gets it in
            their in-app notifications.
          </p>
          <Typography.Text type="secondary">This cannot be recalled once sent.</Typography.Text>
        </div>
      ),
      okText: 'Send now',
      onOk: () => send.mutateAsync({ ...values, audience }),
    });
  };

  const opts = options.data;
  const storefrontBrand = type === 'CUSTOMERS' || type === 'RETAILERS';
  const brand = storefrontBrand
    ? { name: 'Desi Tokri', logo: `${import.meta.env.BASE_URL}images/desi-tokri-emblem.png` }
    : { name: 'SVV Balaji', logo: `${import.meta.env.BASE_URL}svv-balaji.png` };
  const cityOptions = (opts?.cities ?? []).map((c) => ({ value: c, label: c }));
  const locationFilters = (
    <>
      <Form.Item label="City" style={{ marginBottom: 12 }}>
        <Select mode="tags" value={cities} onChange={setCities} options={cityOptions} placeholder="Any city" allowClear />
      </Form.Item>
      {type !== 'RIDERS' ? (
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item label="State" style={{ marginBottom: 12 }}>
              <Select mode="tags" value={states} onChange={setStates} placeholder="Any state" allowClear open={false} suffixIcon={null} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Pincode" style={{ marginBottom: 12 }}>
              <Select mode="tags" value={pincodes} onChange={setPincodes} placeholder="Any pincode" allowClear open={false} suffixIcon={null} />
            </Form.Item>
          </Col>
        </Row>
      ) : null}
    </>
  );

  const columns = [
    {
      title: 'Message',
      key: 'msg',
      render: (_: unknown, b: Broadcast) => (
        <div style={{ maxWidth: 360 }}>
          <Typography.Text strong>{b.title}</Typography.Text>
          <div style={{ fontSize: 12, color: '#64748b' }}>{b.body}</div>
          {b.link ? <Tag style={{ marginTop: 4 }}>opens {b.link}</Tag> : null}
        </div>
      ),
    },
    { title: 'Audience', dataIndex: 'audienceSummary', key: 'aud', render: (s: string) => <span style={{ fontSize: 12 }}>{s}</span> },
    { title: 'People', dataIndex: 'recipientCount', key: 'people', align: 'right' as const },
    {
      title: (
        <Tooltip title="System notifications delivered to signed-in devices / devices tried">
          Pop-ups
        </Tooltip>
      ),
      key: 'push',
      align: 'right' as const,
      render: (_: unknown, b: Broadcast) => (
        <span>
          {b.sentCount}/{b.deviceCount}
          {b.failedCount ? (
            <Tooltip title={`${b.failedCount} failed - usually a device that uninstalled or blocked notifications; it has been removed`}>
              <WarningOutlined style={{ color: '#f59e0b', marginLeft: 6 }} />
            </Tooltip>
          ) : null}
        </span>
      ),
    },
    {
      title: <Tooltip title="Opened in the app inbox (staff and storefront; riders not counted)">Read</Tooltip>,
      dataIndex: 'readCount',
      key: 'read',
      align: 'right' as const,
    },
    { title: 'Sent by', key: 'by', render: (_: unknown, b: Broadcast) => b.createdBy?.fullName ?? '-' },
    { title: 'When', dataIndex: 'createdAt', key: 'when', render: (d: string) => dayjs(d).format('DD MMM YYYY, h:mm A') },
  ];

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <PageHeader
        title="Push Notifications"
        subtitle="Send an instant message to customers, retailers, riders, staff roles or specific people. Signed-in devices get a pop-up with the app logo even when the app is closed; everyone gets it in their in-app notifications."
      />

      {opts && !opts.pushEnabled ? (
        <Alert
          type="warning"
          showIcon
          message="Push delivery is not configured on the server"
          description="Messages will still reach every in-app inbox, but no pop-ups will be shown. Add the Firebase service account to the backend (see src/notifications/fcm.service.ts)."
        />
      ) : null}

      <Row gutter={16} align="top">
        <Col xs={24} xl={15}>
          <Card title="1. Who should receive it?" style={{ borderRadius: 10 }} styles={{ body: { paddingBottom: 8 } }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10, marginBottom: 16 }}>
              {AUDIENCES.map((a) => {
                const active = a.value === type;
                return (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => setType(a.value)}
                    style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      border: `1.5px solid ${active ? '#16a34a' : '#e2e8f0'}`,
                      background: active ? '#f0fdf4' : '#fff',
                      position: 'relative',
                    }}
                  >
                    <div style={{ fontSize: 18, color: active ? '#16a34a' : '#64748b' }}>{a.icon}</div>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{a.label}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{a.hint}</div>
                    {active ? <CheckCircleFilled style={{ position: 'absolute', top: 10, right: 10, color: '#16a34a' }} /> : null}
                  </button>
                );
              })}
            </div>

            <Form layout="vertical">
              {type === 'STAFF' ? (
                <>
                  <Form.Item label="Roles" style={{ marginBottom: 12 }} extra="Leave empty to message all staff.">
                    <Select
                      mode="multiple"
                      value={roles}
                      onChange={setRoles}
                      placeholder="All roles"
                      options={(opts?.roles ?? []).map((r) => ({ value: r.value, label: r.label }))}
                      allowClear
                    />
                  </Form.Item>
                  <Form.Item label="Branch" style={{ marginBottom: 12 }}>
                    <Select
                      mode="multiple"
                      value={branchIds}
                      onChange={setBranchIds}
                      placeholder="Any branch"
                      options={(opts?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))}
                      allowClear
                    />
                  </Form.Item>
                </>
              ) : null}

              {type === 'CUSTOMERS' ? locationFilters : null}

              {type === 'RETAILERS' ? (
                <>
                  {locationFilters}
                  <Form.Item label="Handled by sales executive" style={{ marginBottom: 12 }}>
                    <Select
                      mode="multiple"
                      value={salesExecutiveIds}
                      onChange={setSalesExecutiveIds}
                      placeholder="Any sales executive"
                      options={(opts?.salesExecutives ?? []).map((u) => ({ value: u.id, label: u.fullName }))}
                      allowClear
                    />
                  </Form.Item>
                </>
              ) : null}

              {type === 'RIDERS' ? (
                <>
                  <Form.Item label="Home outlet" style={{ marginBottom: 12 }}>
                    <Select
                      mode="multiple"
                      value={warehouseIds}
                      onChange={setWarehouseIds}
                      placeholder="Any outlet"
                      options={(opts?.outlets ?? []).map((w) => ({ value: w.id, label: w.name }))}
                      allowClear
                    />
                  </Form.Item>
                  {locationFilters}
                  <Form.Item style={{ marginBottom: 12 }}>
                    <Space>
                      <Switch checked={onlineOnly} onChange={setOnlineOnly} />
                      <span>Only riders who are online right now</span>
                    </Space>
                  </Form.Item>
                </>
              ) : null}

              {type === 'SPECIFIC' ? (
                <Form.Item label="People" style={{ marginBottom: 12 }} extra="Search by name, phone, email, business name or rider code.">
                  <Select
                    mode="multiple"
                    showSearch
                    filterOption={false}
                    onSearch={setSearch}
                    searchValue={search}
                    placeholder="Type at least 2 letters…"
                    notFoundContent={people.isFetching ? <Spin size="small" /> : search.trim().length < 2 ? null : 'No one found'}
                    value={picked.map((p) => `${p.kind}:${p.id}`)}
                    onChange={(keys: string[]) => {
                      const pool = new Map([...picked, ...(people.data ?? [])].map((p) => [`${p.kind}:${p.id}`, p]));
                      setPicked(keys.map((k) => pool.get(k)).filter((p): p is RecipientSearchResult => Boolean(p)));
                      setSearch('');
                    }}
                    optionLabelProp="label"
                    options={(people.data ?? []).map((p) => ({
                      value: `${p.kind}:${p.id}`,
                      label: p.name,
                      title: p.name,
                      data: p,
                    }))}
                    optionRender={(o) => {
                      const p = (o.data as { data: RecipientSearchResult }).data;
                      return (
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ minWidth: 0 }}>
                            <div>{p.name}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{p.subtitle}</div>
                          </div>
                          <Space size={4}>
                            <Tag color={GROUP_COLORS[p.group] ?? 'blue'}>{p.group}</Tag>
                            <Tooltip title={p.devices ? `${p.devices} device(s) registered for pop-ups` : 'No device registered - inbox only'}>
                              <span style={{ color: p.devices ? '#16a34a' : '#cbd5e1' }}>●</span>
                            </Tooltip>
                          </Space>
                        </div>
                      );
                    }}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              ) : null}

              {type === 'EVERYONE' ? (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="Goes to every active customer, retailer, rider and staff member."
                />
              ) : null}
            </Form>

            <div
              style={{
                display: 'flex',
                gap: 24,
                flexWrap: 'wrap',
                padding: '12px 14px',
                background: '#f8fafc',
                borderRadius: 10,
                marginBottom: 12,
              }}
            >
              {preview.isFetching && !preview.data ? (
                <Spin size="small" />
              ) : (
                <>
                  <Statistic title="Will receive" value={canPreview ? preview.data?.total ?? 0 : 0} prefix={<UsergroupAddOutlined />} />
                  <Statistic
                    title={<Tooltip title="Signed in on at least one device right now - they get the pop-up. Others see it in the app after signing in.">Pop-up now</Tooltip>}
                    value={canPreview ? preview.data?.reachable ?? 0 : 0}
                    valueStyle={{ color: '#16a34a' }}
                  />
                  {preview.data && type === 'EVERYONE' ? (
                    <Typography.Text type="secondary" style={{ alignSelf: 'center', fontSize: 12 }}>
                      {preview.data.customers} customers & retailers · {preview.data.riders} riders · {preview.data.staff} staff
                    </Typography.Text>
                  ) : null}
                </>
              )}
            </div>
          </Card>

          <Card title="2. Message" style={{ borderRadius: 10, marginTop: 16 }}>
            <Form form={form} layout="vertical" requiredMark="optional">
              <Form.Item name="title" label="Title" rules={[{ required: true, min: 2, message: 'Give it a title' }]}>
                <Input maxLength={80} showCount placeholder="e.g. Diwali offer - 20% off all namkeen" />
              </Form.Item>
              <Form.Item name="body" label="Message" rules={[{ required: true, min: 2, message: 'Write the message' }]}>
                <Input.TextArea maxLength={400} showCount rows={3} placeholder="What should they know?" />
              </Form.Item>
              <Row gutter={12}>
                <Col xs={24} md={12}>
                  <Form.Item name="imageUrl" label="Picture (optional)" extra="Shown large in the notification on Android and desktop.">
                    <FileUploadField folder="banners" hint="Landscape image works best." />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="link"
                    label="Open this page on tap (optional)"
                    extra="A path inside the app, e.g. /products or /orders. Empty = app home."
                    rules={[{ pattern: /^\/\S*$/, message: 'Start with / (a page inside the app)' }]}
                  >
                    <Input placeholder="/products" />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
            <Can do="PUSH_NOTIFICATIONS_SEND">
              <Button type="primary" size="large" icon={<SendOutlined />} loading={send.isPending} onClick={() => void onSend()}>
                Send now
              </Button>
            </Can>
          </Card>
        </Col>

        <Col xs={24} xl={9}>
          <Card title="Preview" style={{ borderRadius: 10, position: 'sticky', top: 0 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              How it appears on a phone{type === 'EVERYONE' || type === 'SPECIFIC' ? ' (customers and retailers see the Desi Tokri logo; riders and staff see SVV Balaji)' : ''}
            </Typography.Text>
            <div style={{ background: 'linear-gradient(160deg,#1e293b,#334155)', borderRadius: 22, padding: '28px 14px 40px', marginTop: 8 }}>
              <div style={{ textAlign: 'center', color: '#e2e8f0', fontSize: 34, fontWeight: 300, marginBottom: 18 }}>
                {dayjs().format('h:mm')}
              </div>
              <div style={{ background: 'rgba(255,255,255,0.95)', borderRadius: 16, padding: 12, boxShadow: '0 6px 20px rgba(0,0,0,.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b', marginBottom: 6 }}>
                  <img src={brand.logo} alt="" style={{ width: 16, height: 16, borderRadius: 8 }} />
                  <span>{brand.name} · now</span>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#0f172a', wordBreak: 'break-word' }}>{title || 'Notification title'}</div>
                    <div style={{ fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {body || 'Your message appears here.'}
                    </div>
                  </div>
                  <img src={brand.logo} alt="" style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 20 }} />
                </div>
                {imageUrl ? <img src={imageUrl} alt="" style={{ width: '100%', borderRadius: 10, marginTop: 8 }} /> : null}
              </div>
            </div>
            <ul style={{ fontSize: 12, color: '#475569', paddingLeft: 18, marginTop: 12, marginBottom: 0 }}>
              <li>Signed-in devices get it instantly, even with the app closed.</li>
              <li>Signed-out devices never show a pop-up; the message waits in the app's notifications until they sign in.</li>
            </ul>
          </Card>
        </Col>
      </Row>

      <Card title="Sent notifications" style={{ borderRadius: 10 }}>
        <Table<Broadcast>
          rowKey="id"
          size="middle"
          loading={history.isLoading}
          dataSource={history.data?.items ?? []}
          columns={columns}
          scroll={{ x: 900 }}
          pagination={{
            current: page,
            pageSize: 10,
            total: history.data?.total ?? 0,
            onChange: setPage,
            showSizeChanger: false,
          }}
        />
      </Card>
    </Space>
  );
}
