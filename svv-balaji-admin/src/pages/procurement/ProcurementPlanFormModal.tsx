import { App as AntApp, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { ProcurementPlan } from '../../api/types';
import { BranchSelect } from '../../components/pickers';
import {
  useCreateProcurementPlan,
  useUpdateProcurementPlan,
} from '../../hooks/useProcurement';
import { toIsoDate } from '../../utils/format';
import { dateAfter, positiveNumber, required } from '../../validation/rules';

interface ProcurementPlanFormModalProps {
  open: boolean;
  /** Present means edit; absent means create. */
  plan?: ProcurementPlan | null;
  onClose: () => void;
}

interface PlanForm {
  cropName: string;
  plannedQuantity: number;
  unit?: string;
  scheduledFrom: Dayjs;
  scheduledTo: Dayjs;
  branchId: string;
  notes?: string;
}

const UNITS = ['KG', 'QUINTAL', 'TONNE'];

export function ProcurementPlanFormModal({ open, plan, onClose }: ProcurementPlanFormModalProps) {
  const [form] = Form.useForm<PlanForm>();
  const { message } = AntApp.useApp();
  const createPlan = useCreateProcurementPlan();
  const updatePlan = useUpdateProcurementPlan();

  const isEdit = Boolean(plan);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (plan) {
      form.setFieldsValue({
        cropName: plan.cropName,
        plannedQuantity: Number(plan.plannedQuantity),
        unit: plan.unit,
        scheduledFrom: dayjs(plan.scheduledFrom),
        scheduledTo: dayjs(plan.scheduledTo),
        branchId: plan.branchId,
        notes: plan.notes ?? undefined,
      });
    }
  }, [open, plan, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const payload = {
      cropName: values.cropName,
      plannedQuantity: values.plannedQuantity,
      unit: values.unit,
      scheduledFrom: toIsoDate(values.scheduledFrom) as string,
      scheduledTo: toIsoDate(values.scheduledTo) as string,
      branchId: values.branchId,
      notes: values.notes,
    };

    try {
      if (plan) {
        await updatePlan.mutateAsync({ id: plan.id, input: payload });
        message.success('Procurement plan updated');
      } else {
        await createPlan.mutateAsync(payload);
        message.success('Procurement plan created');
      }
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, `Could not ${isEdit ? 'update' : 'create'} the plan`), 8);
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? `Edit plan — ${plan?.cropName}` : 'New procurement plan'}
      okText={isEdit ? 'Save changes' : 'Create plan'}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createPlan.isPending || updatePlan.isPending}
      width={620}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark
        preserve={false}
        initialValues={{ unit: 'KG' }}
      >
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="cropName" label="Crop" rules={[required('Crop')]}>
              <Input placeholder="Wheat" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="branchId" label="Branch" rules={[required('Branch')]}>
              <BranchSelect />
            </Form.Item>
          </Col>

          <Col xs={16} md={8}>
            <Form.Item
              name="plannedQuantity"
              label="Planned quantity"
              rules={[required('Planned quantity'), positiveNumber('Planned quantity')]}
            >
              <InputNumber style={{ width: '100%' }} min={0} step={100} />
            </Form.Item>
          </Col>
          <Col xs={8} md={4}>
            <Form.Item name="unit" label="Unit">
              <Select options={UNITS.map((unit) => ({ value: unit, label: unit }))} />
            </Form.Item>
          </Col>

          <Col xs={24} md={6}>
            <Form.Item name="scheduledFrom" label="From" rules={[required('Start date')]}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item
              name="scheduledTo"
              label="To"
              dependencies={['scheduledFrom']}
              rules={[
                required('End date'),
                // Mirrors the server check in procurement.service.ts.
                dateAfter('scheduledFrom', 'the start date', { orEqual: true }),
              ]}
            >
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={3} placeholder="Optional" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
