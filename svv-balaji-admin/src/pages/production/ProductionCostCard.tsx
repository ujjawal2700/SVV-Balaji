import { EditOutlined, MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App as AntApp, Button, Card, Checkbox, Col, Descriptions, Form, Input, InputNumber, Row, Space, Spin, Table, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import { productionCostApi, type OtherCost, type ProductionCostSheet } from '@shared/api/machines';
import { useCan } from '@shared/auth/useCan';
import { EM_DASH, formatQuantity } from '../../utils/format';

const inr = (v: number | null | undefined) =>
  v === null || v === undefined ? EM_DASH : `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface CostForm {
  overrideRaw: boolean;
  rawMaterialCost?: number;
  labourCost?: number;
  machineCost?: number;
  lossCost?: number;
  otherCosts: OtherCost[];
}

/**
 * Production cost of one run (client decision 10 Oct 2026):
 * raw material + labour + machine + loss + other lines.
 *
 * Raw material is worked out by the server from what the run consumed and the
 * rate paid for each batch, so it is shown, not typed - unless a supervisor
 * overrides it (e.g. a batch with no purchase rate recorded).
 */
export function ProductionCostCard({ batchId, status }: { batchId: string; status: string }) {
  const canView = useCan('PRODUCTION_COST_VIEW');
  const canEdit = useCan('PRODUCTION_COST_EDIT');
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm<CostForm>();
  const overrideRaw = Form.useWatch('overrideRaw', form);

  const sheet = useQuery({
    queryKey: ['production-cost', batchId],
    queryFn: () => productionCostApi.get(batchId),
    enabled: canView,
  });
  const save = useMutation({
    mutationFn: (v: CostForm) =>
      productionCostApi.record(batchId, {
        rawMaterialCost: v.overrideRaw ? v.rawMaterialCost ?? 0 : null,
        labourCost: v.labourCost ?? 0,
        machineCost: v.machineCost ?? 0,
        lossCost: v.lossCost ?? 0,
        otherCosts: (v.otherCosts ?? []).filter((o) => o?.label?.trim()).map((o) => ({ label: o.label.trim(), amount: o.amount ?? 0 })),
      }),
    onSuccess: (data) => {
      qc.setQueryData(['production-cost', batchId], data);
      void qc.invalidateQueries({ queryKey: ['production-cost-report'] });
      message.success('Production cost saved');
      setEditing(false);
    },
    onError: (e) => message.error(apiErrorMessage(e)),
  });

  const d = sheet.data;
  useEffect(() => {
    if (!editing || !d) return;
    form.setFieldsValue({
      overrideRaw: d.rawMaterial.overridden,
      rawMaterialCost: d.rawMaterial.amount,
      labourCost: d.labourCost ?? undefined,
      machineCost: d.machineCost ?? undefined,
      lossCost: d.lossCost ?? undefined,
      otherCosts: d.otherCosts,
    });
  }, [editing, d, form]);

  if (!canView) return null;
  const costable = status !== 'PLANNED' && status !== 'CANCELLED';

  return (
    <Card
      size="small"
      title="Production cost"
      extra={
        canEdit && costable && d && !editing ? (
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)}>
            {d.recorded ? 'Edit cost' : 'Record cost'}
          </Button>
        ) : null
      }
    >
      {sheet.isLoading ? (
        <Spin />
      ) : sheet.error ? (
        <Alert type="error" showIcon message={apiErrorMessage(sheet.error)} />
      ) : !d ? null : editing ? (
        <CostEditor form={form} sheet={d} overrideRaw={overrideRaw} saving={save.isPending} onCancel={() => setEditing(false)} onSave={(v) => save.mutate(v)} />
      ) : (
        <CostView sheet={d} costable={costable} />
      )}
    </Card>
  );
}

function CostView({ sheet: d, costable }: { sheet: ProductionCostSheet; costable: boolean }) {
  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {!costable ? (
        <Typography.Text type="secondary">Cost is recorded once the run has started.</Typography.Text>
      ) : !d.recorded ? (
        <Alert type="info" showIcon message="No cost recorded yet" description="Raw material below is calculated automatically; add labour, machine, loss and other costs to complete the cost sheet." />
      ) : null}
      <Descriptions bordered size="small" column={1}>
        <Descriptions.Item label={d.rawMaterial.overridden ? 'Raw material (entered by hand)' : 'Raw material (auto)'}>
          {inr(d.rawMaterial.amount)}
          {d.rawMaterial.overridden ? <Typography.Text type="secondary"> · calculated {inr(d.rawMaterial.automatic)}</Typography.Text> : null}
        </Descriptions.Item>
        <Descriptions.Item label="Labour">{inr(d.labourCost)}</Descriptions.Item>
        <Descriptions.Item label="Machine">{inr(d.machineCost)}</Descriptions.Item>
        <Descriptions.Item label="Loss">{inr(d.lossCost)}</Descriptions.Item>
        {d.otherCosts.map((o, i) => (
          <Descriptions.Item key={i} label={`Other: ${o.label}`}>{inr(o.amount)}</Descriptions.Item>
        ))}
        <Descriptions.Item label={<strong>Total cost</strong>}>
          <strong>{d.recorded ? inr(d.totalCost) : EM_DASH}</strong>
        </Descriptions.Item>
        <Descriptions.Item label="Cost per unit">
          {d.recorded && d.costPerUnit !== null ? `${inr(d.costPerUnit)} / ${d.unit}` : d.outputQuantity === null ? 'After the run is completed' : EM_DASH}
        </Descriptions.Item>
      </Descriptions>
      <RawLines sheet={d} />
    </Space>
  );
}

function RawLines({ sheet: d }: { sheet: ProductionCostSheet }) {
  return (
    <>
      {d.rawMaterial.missingRate.length ? (
        <Alert
          type="warning"
          showIcon
          message={`No purchase rate on ${d.rawMaterial.missingRate.join(', ')}`}
          description="Those batches are not in the automatic raw material figure. Enter the raw material cost by hand if it matters."
        />
      ) : null}
      <Table
        size="small"
        rowKey="batchNumber"
        pagination={false}
        dataSource={d.rawMaterial.lines}
        columns={[
          { title: 'Raw batch', dataIndex: 'batchNumber', render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
          { title: 'Used', dataIndex: 'quantityUsed', align: 'right', render: (v: number) => formatQuantity(String(v), d.unit) },
          { title: 'Rate paid', dataIndex: 'rate', align: 'right', render: (v: number | null) => (v === null ? 'Not recorded' : inr(v)) },
          { title: 'Cost', dataIndex: 'cost', align: 'right', render: (v: number | null) => inr(v) },
        ]}
      />
      {d.processLossQuantity ? (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {formatQuantity(String(d.processLossQuantity), d.unit)} was lost in process. Its value is already inside the raw material cost - use "Loss" only
          for other losses you want charged to this run.
        </Typography.Text>
      ) : null}
    </>
  );
}

function CostEditor({
  form,
  sheet: d,
  overrideRaw,
  saving,
  onCancel,
  onSave,
}: {
  form: ReturnType<typeof Form.useForm<CostForm>>[0];
  sheet: ProductionCostSheet;
  overrideRaw: boolean | undefined;
  saving: boolean;
  onCancel: () => void;
  onSave: (v: CostForm) => void;
}) {
  const money = { min: 0, step: 100, style: { width: '100%' }, prefix: '₹' } as const;
  return (
    <Form form={form} layout="vertical" onFinish={onSave} initialValues={{ otherCosts: [] }}>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item label={`Raw material (calculated ${inr(d.rawMaterial.automatic)})`} style={{ marginBottom: 4 }}>
            <Form.Item name="overrideRaw" valuePropName="checked" noStyle>
              <Checkbox>Enter by hand instead</Checkbox>
            </Form.Item>
          </Form.Item>
          {overrideRaw ? (
            <Form.Item name="rawMaterialCost" rules={[{ required: true, message: 'Enter the raw material cost' }]}>
              <InputNumber {...money} />
            </Form.Item>
          ) : null}
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="labourCost" label="Labour charges">
            <InputNumber {...money} placeholder="0" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="machineCost" label="Machine cost" extra="Power, running and maintenance charged to this run">
            <InputNumber {...money} placeholder="0" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="lossCost" label="Loss" extra="Material lost in process is already in raw material">
            <InputNumber {...money} placeholder="0" />
          </Form.Item>
        </Col>
      </Row>
      <Typography.Text strong>Other costs</Typography.Text>
      <Form.List name="otherCosts">
        {(fields, { add, remove }) => (
          <div style={{ marginTop: 8 }}>
            {fields.map((field) => (
              <Row key={field.key} gutter={8} align="top">
                <Col flex="auto">
                  <Form.Item name={[field.name, 'label']} rules={[{ required: true, message: 'What is it for?' }]}>
                    <Input placeholder="e.g. Packaging material, transport, cleaning" maxLength={80} />
                  </Form.Item>
                </Col>
                <Col style={{ width: 160 }}>
                  <Form.Item name={[field.name, 'amount']} rules={[{ required: true, message: 'Amount' }]}>
                    <InputNumber {...money} />
                  </Form.Item>
                </Col>
                <Col>
                  <Button type="text" danger icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} />
                </Col>
              </Row>
            ))}
            <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ label: '', amount: undefined })} disabled={fields.length >= 20}>
              Add another cost
            </Button>
          </div>
        )}
      </Form.List>
      <Space style={{ marginTop: 16 }}>
        <Button type="primary" htmlType="submit" loading={saving}>
          Save cost
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </Space>
    </Form>
  );
}
