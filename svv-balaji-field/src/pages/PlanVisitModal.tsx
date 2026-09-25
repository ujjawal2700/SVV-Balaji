import { App as AntApp, AutoComplete, Col, DatePicker, Form, Input, Row, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { FieldVisitPlan } from '@shared/api/types';
import { FarmerSelect } from '@shared/components/pickers';
import { Sheet } from '@shared/components/Sheet';
import { useFarmer } from '@shared/hooks/useFarmers';
import { useCreateFieldVisitPlan, useUpdateFieldVisitPlan } from '@shared/hooks/useFieldVisitPlans';
import { required } from '@shared/validation/rules';

const PURPOSE_OPTIONS = [
  { value: 'Crop monitoring' },
  { value: 'Pest / disease follow-up' },
  { value: 'Fertiliser & irrigation advice' },
  { value: 'Pre-harvest check' },
  { value: 'Yield estimation' },
  { value: 'Land mapping' },
  { value: 'Farmer onboarding / documents' },
];

interface PlanForm {
  farmerId: string;
  plannedDate: Dayjs;
  purpose?: string;
  cropName?: string;
  notes?: string;
}

/**
 * FRD 12.1 - plan a field visit, or reschedule one.
 *
 * The plan is assigned to whoever creates it; the server defaults the branch to
 * the farmer's. Carrying the visit out is "Start visit" on the plan, which opens
 * the ordinary visit form with the plan attached.
 */
export function PlanVisitModal({
  open,
  onClose,
  plan,
  farmerId: fixedFarmerId,
}: {
  open: boolean;
  onClose: () => void;
  /** Present means reschedule/edit. */
  plan?: FieldVisitPlan | null;
  /** Plan for this farmer only (from their profile). */
  farmerId?: string;
}) {
  const [form] = Form.useForm<PlanForm>();
  const { message } = AntApp.useApp();
  const create = useCreateFieldVisitPlan();
  const update = useUpdateFieldVisitPlan();
  const isEdit = Boolean(plan);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (plan) {
      form.setFieldsValue({
        farmerId: plan.farmerId,
        plannedDate: dayjs(plan.plannedDate),
        purpose: plan.purpose ?? undefined,
        cropName: plan.cropName ?? undefined,
        notes: plan.notes ?? undefined,
      });
    } else {
      form.setFieldsValue({ farmerId: fixedFarmerId, plannedDate: dayjs().add(1, 'day') });
    }
  }, [open, plan, fixedFarmerId, form]);

  const selectedFarmerId = Form.useWatch('farmerId', form);
  const { data: farmer } = useFarmer(selectedFarmerId);
  const cropOptions = Array.from(
    new Set(
      [
        ...(farmer?.cropDetails ?? '').split(','),
        ...(farmer?.agreements ?? []).map((a) => a.cropName),
        ...(farmer?.fieldVisits ?? []).map((v) => v.cropName ?? ''),
      ]
        .map((c) => c.trim())
        .filter(Boolean),
    ),
  ).map((value) => ({ value }));

  const submit = async () => {
    const values = await form.validateFields();
    // A calendar day, not an instant: sent as YYYY-MM-DD so it cannot shift a day across timezones.
    const input = {
      plannedDate: values.plannedDate.format('YYYY-MM-DD'),
      purpose: values.purpose?.trim() || undefined,
      cropName: values.cropName?.trim() || undefined,
      notes: values.notes?.trim() || undefined,
    };
    try {
      if (plan) {
        await update.mutateAsync({ id: plan.id, input });
        message.success('Planned visit updated');
      } else {
        await create.mutateAsync({ farmerId: values.farmerId, ...input });
        message.success(`Visit planned for ${values.plannedDate.format('D MMM YYYY')}`);
      }
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not save the planned visit'));
    }
  };

  return (
    <Sheet
      open={open}
      title={isEdit ? 'Reschedule planned visit' : 'Plan a field visit'}
      onOk={submit}
      onCancel={onClose}
      okText={isEdit ? 'Save' : 'Plan visit'}
      confirmLoading={create.isPending || update.isPending}
      width={620}
    >
      <Form form={form} layout="vertical" requiredMark preserve={false}>
        <Form.Item name="farmerId" label="Farmer / Supplier" rules={[required('Farmer / Supplier')]}>
          <FarmerSelect disabled={isEdit || Boolean(fixedFarmerId)} />
        </Form.Item>
        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item name="plannedDate" label="Planned date" rules={[required('Planned date')]}>
              <DatePicker
                style={{ width: '100%' }}
                format="DD MMM YYYY"
                disabledDate={(d) => d.isBefore(dayjs().startOf('day'))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="cropName" label="Crop">
              <AutoComplete options={cropOptions} placeholder="e.g. Wheat" filterOption />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="purpose" label="Purpose of visit">
          <AutoComplete options={PURPOSE_OPTIONS} placeholder="e.g. Pre-harvest check" filterOption />
        </Form.Item>
        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={3} maxLength={2000} placeholder="What to check or bring — moisture meter, sample bags…" />
        </Form.Item>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          The visit is assigned to you. When you are at the farm, open it and tap <strong>Start visit</strong> —
          recording the visit completes the plan.
        </Typography.Text>
      </Form>
    </Sheet>
  );
}
