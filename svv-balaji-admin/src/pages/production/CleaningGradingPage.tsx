import { PlusOutlined } from '@ant-design/icons';
import {
  App as AntApp,
  Button,
  Card,
  Checkbox,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { CleaningGradingRecord, CreateCleaningGradingInput } from '../../api/types';
import { Can } from '../../components/Can';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useBatches } from '../../hooks/useCollections';
import { useCleaningRecords, useCreateCleaningRecord } from '../../hooks/useProduction';
import { EM_DASH, formatDate, formatQuantity } from '../../utils/format';
import { positiveNumber, required } from '../../validation/rules';

const ACTIVITIES = [
  ['dustRemoved', 'Dust removed'],
  ['stonesRemoved', 'Stones removed'],
  ['foreignMaterialRemoved', 'Foreign material removed'],
  ['impuritiesSeparated', 'Impurities separated'],
] as const;

function CleaningFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<CreateCleaningGradingInput>();
  const { message } = AntApp.useApp();
  const batches = useBatches({});
  const createRecord = useCreateCleaningRecord();

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      await createRecord.mutateAsync(values);
      message.success('Cleaning and grading recorded');
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not record it'));
    }
  };

  return (
    <Modal
      open={open}
      title="Record cleaning & grading"
      okText="Record"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createRecord.isPending}
      width={680}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark preserve={false}>
        <Form.Item
          name="rawMaterialBatchId"
          label="Raw material batch"
          rules={[required('Batch')]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            loading={batches.isLoading}
            placeholder="Select a batch"
            options={(batches.data?.data ?? []).map((batch) => ({
              value: batch.id,
              label: `${batch.batchNumber} — ${batch.cropName} · ${batch.status}`,
            }))}
          />
        </Form.Item>

        <Typography.Text strong>Cleaning activities (FRD 18.1)</Typography.Text>
        <Row gutter={8} style={{ marginTop: 8, marginBottom: 16 }}>
          {ACTIVITIES.map(([name, label]) => (
            <Col xs={12} key={name}>
              <Form.Item name={name} valuePropName="checked" initialValue={false} noStyle>
                <Checkbox>{label}</Checkbox>
              </Form.Item>
            </Col>
          ))}
        </Row>

        <Typography.Text strong>Grading parameters (FRD 18.2)</Typography.Text>
        <Row gutter={16} style={{ marginTop: 8 }}>
          <Col xs={12} md={8}>
            <Form.Item name="grainSize" label="Grain size">
              <Input placeholder="e.g. Bold" />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="color" label="Colour">
              <Input placeholder="e.g. Golden" />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="texture" label="Texture">
              <Input placeholder="Optional" />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item
              name="moistureLevel"
              label="Moisture %"
              rules={[positiveNumber('Moisture', true)]}
            >
              <InputNumber style={{ width: '100%' }} min={0} max={100} step={0.1} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="purity" label="Purity %" rules={[positiveNumber('Purity', true)]}>
              <InputNumber style={{ width: '100%' }} min={0} max={100} step={0.1} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item
              name="wastageQuantity"
              label="Wastage (KG)"
              rules={[positiveNumber('Wastage', true)]}
              extra="Weight lost to cleaning — matters for yield reconciliation."
            >
              <InputNumber style={{ width: '100%' }} min={0} step={1} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="qaVerified" valuePropName="checked" initialValue={false}>
          <Checkbox>QA verified — cleared for production (FRD 18.3)</Checkbox>
        </Form.Item>

        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} placeholder="Optional" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function CleaningGradingPage() {
  const [formOpen, setFormOpen] = useState(false);
  const records = useCleaningRecords();

  const columns: ColumnsType<CleaningGradingRecord> = [
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 130,
      render: (value: string) => formatDate(value),
      sorter: (a, b) => a.createdAt.localeCompare(b.createdAt),
    },
    {
      title: 'Batch',
      key: 'batch',
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text code>{row.rawMaterialBatch?.batchNumber ?? EM_DASH}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.rawMaterialBatch?.cropName ?? EM_DASH}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Activities',
      key: 'activities',
      render: (_, row) => {
        const done = ACTIVITIES.filter(([name]) => row[name]);
        return done.length === 0 ? (
          <Typography.Text type="secondary">None recorded</Typography.Text>
        ) : (
          <Space size={[4, 4]} wrap>
            {done.map(([name, label]) => (
              <Tag key={name} color="blue">
                {label}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: 'Moisture',
      dataIndex: 'moistureLevel',
      key: 'moistureLevel',
      align: 'right',
      render: (value: string | null) => (value === null ? EM_DASH : `${value}%`),
    },
    {
      title: 'Purity',
      dataIndex: 'purity',
      key: 'purity',
      align: 'right',
      render: (value: string | null) => (value === null ? EM_DASH : `${value}%`),
    },
    {
      title: 'Wastage',
      dataIndex: 'wastageQuantity',
      key: 'wastageQuantity',
      align: 'right',
      render: (value: string | null) => formatQuantity(value, 'KG'),
    },
    {
      title: 'QA',
      dataIndex: 'qaVerified',
      key: 'qaVerified',
      width: 120,
      render: (verified: boolean) =>
        verified ? <Tag color="green">Verified</Tag> : <Tag color="gold">Not verified</Tag>,
    },
    {
      title: 'Operator',
      key: 'operator',
      render: (_, row) => row.operator?.fullName ?? EM_DASH,
    },
  ];

  return (
    <Card>
      <PageHeader
        title="Cleaning & grading"
        subtitle="What was removed and how the material graded, before it enters production (FRD Section 18). Wastage recorded here is what makes a yield reconciliation possible later."
        actions={
          <Can do="CLEANING_GRADING_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              Record cleaning
            </Button>
          </Can>
        }
      />

      <DataTable<CleaningGradingRecord>
        rows={records.data?.data}
        columns={columns}
        rowKey="id"
        isLoading={records.isLoading}
        isFetching={records.isFetching}
        error={records.error}
        onRetry={() => void records.refetch()}
        emptyText="Nothing recorded yet"
      />

      <CleaningFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </Card>
  );
}
