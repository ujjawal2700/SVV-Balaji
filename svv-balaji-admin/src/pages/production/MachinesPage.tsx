import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { BranchSelect } from '../../components/pickers';
import { machinesApi, type Machine, type MachineInput, type MachineUtilisationRow } from '@shared/api/machines';
import { useCan } from '@shared/auth/useCan';
import { EM_DASH } from '../../utils/format';

const { RangePicker } = DatePicker;
const DAY = 'YYYY-MM-DD';
const hrs = (h: number) => `${h.toLocaleString('en-IN', { maximumFractionDigits: 1 })} h`;

/**
 * Machine list + runs = machine utilisation (client decision 10 Oct 2026).
 * Runs are booked on a machine when a production run is started; the run's
 * start and completion stamps give its hours.
 */
export function MachinesPage() {
  const [tab, setTab] = useState('utilisation');
  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <PageHeader
          title="Machines"
          subtitle="The machine list production runs are booked on, and how much each one ran: runs, run hours, output and utilisation."
        />
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: 'utilisation', label: 'Utilisation', children: <Utilisation /> },
            { key: 'list', label: 'Machine list', children: <MachineList /> },
          ]}
        />
      </Space>
    </div>
  );
}

function Utilisation() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(29, 'day'), dayjs()]);
  const [branchId, setBranchId] = useState<string | undefined>();
  const q = useQuery({
    queryKey: ['machines', 'utilisation', range[0].format(DAY), range[1].format(DAY), branchId],
    queryFn: () => machinesApi.utilisation({ from: range[0].format(DAY), to: range[1].format(DAY), branchId }),
  });
  const rows = q.data?.machines ?? [];

  const columns: ColumnsType<MachineUtilisationRow> = [
    {
      title: 'Machine',
      key: 'machine',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span>
            <Typography.Text code>{r.machine.code}</Typography.Text> {r.machine.name} {r.machine.isActive ? null : <Tag>Inactive</Tag>}
          </span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {[r.machine.machineNumber, r.machine.productionLine, r.machine.branch?.name].filter(Boolean).join(' · ') || EM_DASH}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Runs',
      key: 'runs',
      align: 'right',
      render: (_, r) => (
        <Space direction="vertical" size={0} style={{ alignItems: 'flex-end' }}>
          <span>{r.runs}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {r.completedRuns} done{r.inProgressRuns ? ` · ${r.inProgressRuns} running` : ''}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Run hours',
      key: 'hours',
      align: 'right',
      render: (_, r) => (
        <Space direction="vertical" size={0} style={{ alignItems: 'flex-end' }}>
          <span>{hrs(r.runHours)}</span>
          {r.runsWithoutTimes ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {r.runsWithoutTimes} run{r.runsWithoutTimes > 1 ? 's' : ''} without times
            </Typography.Text>
          ) : null}
        </Space>
      ),
    },
    { title: 'Available', key: 'available', align: 'right', render: (_, r) => <span title={`${r.machine.hoursPerDay} h a day`}>{hrs(r.availableHours)}</span> },
    {
      title: 'Utilisation',
      key: 'util',
      width: 200,
      render: (_, r) =>
        r.utilisationPercent === null ? EM_DASH : <Progress percent={Math.min(100, r.utilisationPercent)} format={() => `${r.utilisationPercent}%`} size="small" />,
    },
    {
      title: 'Output',
      key: 'output',
      align: 'right',
      render: (_, r) => (r.outputQuantity ? `${r.outputQuantity.toLocaleString('en-IN')} ${r.recentRuns[0]?.unit ?? ''}` : EM_DASH),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small" style={{ borderRadius: 12 }}>
        <Space wrap size={12}>
          <RangePicker
            value={range}
            allowClear={false}
            disabledDate={(d) => d.isAfter(dayjs(), 'day')}
            onChange={(v) => v?.[0] && v[1] && setRange([v[0], v[1]])}
          />
          <div style={{ width: 220 }}>
            <BranchSelect value={branchId} onChange={(v) => setBranchId(v as string | undefined)} placeholder="All branches" allowClear />
          </div>
          <Button icon={<ReloadOutlined />} onClick={() => void q.refetch()} loading={q.isFetching} />
        </Space>
      </Card>
      {q.isError ? <Alert type="error" showIcon message={apiErrorMessage(q.error)} /> : null}
      {q.data?.runsWithoutMachine ? (
        <Alert
          type="info"
          showIcon
          message={`${q.data.runsWithoutMachine} production run${q.data.runsWithoutMachine > 1 ? 's' : ''} in this range ${q.data.runsWithoutMachine > 1 ? 'are' : 'is'} not booked on a machine`}
          description="Pick the machine when starting a run so its hours count here."
        />
      ) : null}
      <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 0 }}>
        <Table<MachineUtilisationRow>
          rowKey={(r) => r.machine.id}
          loading={q.isLoading}
          dataSource={rows}
          columns={columns}
          pagination={false}
          scroll={{ x: 900 }}
          locale={{ emptyText: 'No machines yet - add them on the Machine list tab' }}
          expandable={{
            rowExpandable: (r) => r.recentRuns.length > 0,
            expandedRowRender: (r) => (
              <Table
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={r.recentRuns}
                columns={[
                  { title: 'Run', dataIndex: 'productionBatchNumber', render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
                  { title: 'Product', dataIndex: 'product' },
                  { title: 'Status', dataIndex: 'status', render: (v: string) => <Tag>{v.replace('_', ' ')}</Tag> },
                  { title: 'Started', dataIndex: 'startedAt', render: (v: string | null) => (v ? dayjs(v).format('D MMM, HH:mm') : EM_DASH) },
                  { title: 'Completed', dataIndex: 'completedAt', render: (v: string | null) => (v ? dayjs(v).format('D MMM, HH:mm') : EM_DASH) },
                  { title: 'Hours', dataIndex: 'hours', align: 'right', render: (v: number | null) => (v === null ? EM_DASH : hrs(v)) },
                  { title: 'Output', key: 'out', align: 'right', render: (_, x) => (x.actualQuantity === null ? EM_DASH : `${x.actualQuantity} ${x.unit}`) },
                ]}
              />
            ),
          }}
        />
      </Card>
    </Space>
  );
}

function MachineList() {
  const canManage = useCan('MACHINES_MANAGE');
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Machine | 'new' | null>(null);
  const list = useQuery({ queryKey: ['machines', 'all'], queryFn: () => machinesApi.list() });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['machines'] });

  const toggle = useMutation({
    mutationFn: (m: Machine) => machinesApi.update(m.id, { isActive: !m.isActive }),
    onSuccess: refresh,
    onError: (e) => message.error(apiErrorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (m: Machine) => machinesApi.remove(m.id),
    onSuccess: () => {
      message.success('Machine deleted');
      refresh();
    },
    onError: (e) => message.error(apiErrorMessage(e)),
  });

  const columns: ColumnsType<Machine> = [
    { title: 'Code', dataIndex: 'code', render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
    { title: 'Name', dataIndex: 'name' },
    { title: 'Machine no.', dataIndex: 'machineNumber', render: (v: string | null) => v ?? EM_DASH },
    { title: 'Line', dataIndex: 'productionLine', render: (v: string | null) => v ?? EM_DASH },
    { title: 'Branch', key: 'branch', render: (_, m) => m.branch?.name ?? EM_DASH },
    { title: 'Hours / day', dataIndex: 'hoursPerDay', align: 'right' },
    { title: 'Capacity / h', dataIndex: 'capacityPerHour', align: 'right', render: (v: number | null) => v ?? EM_DASH },
    { title: 'Runs', key: 'runs', align: 'right', render: (_, m) => m._count?.productionBatches ?? 0 },
    {
      title: 'Active',
      key: 'active',
      render: (_, m) => <Switch size="small" checked={m.isActive} disabled={!canManage} loading={toggle.isPending && toggle.variables?.id === m.id} onChange={() => toggle.mutate(m)} />,
    },
    ...(canManage
      ? [
          {
            title: '',
            key: 'actions',
            render: (_: unknown, m: Machine) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(m)} />
                {(m._count?.productionBatches ?? 0) === 0 ? (
                  <Popconfirm title={`Delete ${m.code}?`} onConfirm={() => remove.mutate(m)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                ) : null}
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {canManage ? (
        <div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
            Add machine
          </Button>
        </div>
      ) : null}
      {list.isError ? <Alert type="error" showIcon message={apiErrorMessage(list.error)} /> : null}
      <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 0 }}>
        <Table<Machine> rowKey="id" loading={list.isLoading} dataSource={list.data ?? []} columns={columns} pagination={false} scroll={{ x: 900 }} />
      </Card>
      {editing ? <MachineModal machine={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} /> : null}
    </Space>
  );
}

function MachineModal({ machine, onClose, onSaved }: { machine: Machine | null; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm<MachineInput>();
  const { message } = AntApp.useApp();
  const save = useMutation({
    mutationFn: (v: MachineInput) => (machine ? machinesApi.update(machine.id, v) : machinesApi.create(v)),
    onSuccess: () => {
      message.success(machine ? 'Machine updated' : 'Machine added');
      onSaved();
      onClose();
    },
    onError: (e) => message.error(apiErrorMessage(e)),
  });
  return (
    <Modal
      open
      title={machine ? `Edit ${machine.code}` : 'Add machine'}
      onCancel={onClose}
      okText="Save"
      confirmLoading={save.isPending}
      onOk={() => form.submit()}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={
          machine
            ? {
                name: machine.name,
                machineNumber: machine.machineNumber ?? undefined,
                productionLine: machine.productionLine ?? undefined,
                branchId: machine.branchId,
                capacityPerHour: machine.capacityPerHour ?? undefined,
                hoursPerDay: machine.hoursPerDay,
                notes: machine.notes ?? undefined,
              }
            : { hoursPerDay: 8 }
        }
        onFinish={(v) => save.mutate(v)}
      >
        <Form.Item name="name" label="Name" rules={[{ required: true, min: 2, message: 'Name the machine' }]}>
          <Input placeholder="e.g. Flour mill 1" maxLength={80} />
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="machineNumber" label="Machine no." extra="Plate / asset number">
              <Input maxLength={40} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="productionLine" label="Line">
              <Input maxLength={60} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="branchId" label="Branch" rules={[{ required: true, message: 'Choose the branch' }]}>
          <BranchSelect />
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="hoursPerDay" label="Hours a day" extra="Base for utilisation %" rules={[{ required: true }]}>
              <InputNumber min={0.5} max={24} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="capacityPerHour" label="Capacity per hour" extra="Optional, in the product unit">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={2} maxLength={300} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
