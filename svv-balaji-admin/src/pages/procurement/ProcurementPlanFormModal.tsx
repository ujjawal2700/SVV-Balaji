import { App as AntApp, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import { BranchSelect } from '../../components/pickers';
import { useCreateProcurementPlan, useUpdateProcurementPlan } from '../../hooks/useProcurement';
import { toIsoDate } from '../../utils/format';
import { dateAfter, positiveNumber, required } from '../../validation/rules';
import type { ProcurementPlan } from '../../api/types';
import dayjs from 'dayjs';

interface ProcurementPlanFormModalProps {
  open: boolean;
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

  const initialValues = plan ? {
    cropName: plan.cropName,
    plannedQuantity: plan.plannedQuantity,
    unit: plan.unit,
    scheduledFrom: dayjs(plan.scheduledFrom),
    scheduledTo: dayjs(plan.scheduledTo),
    branchId: plan.branchId,
    notes: plan.notes ?? undefined,
  } : { unit: 'KG' };

  useEffect(() => {
    if (open && !plan) form.resetFields();
  }, [open, plan, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      const payload = {
        cropName: values.cropName,
        plannedQuantity: values.plannedQuantity,
        unit: values.unit,
        scheduledFrom: toIsoDate(values.scheduledFrom) as string,
        scheduledTo: toIsoDate(values.scheduledTo) as string,
        branchId: values.branchId,
        notes: values.notes,
      };

      if (isEdit && plan) {
        await updatePlan.mutateAsync({ id: plan.id, input: payload });
        message.success('Procurement plan updated');
      } else {
        await createPlan.mutateAsync(payload);
        message.success('Procurement plan created');
      }
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, `Could not ${isEdit ? 'update' : 'create'} the plan`));
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit procurement plan' : 'New procurement plan'}
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
        initialValues={initialValues}
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
