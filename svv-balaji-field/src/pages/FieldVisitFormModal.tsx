import { App as AntApp, Col, DatePicker, Divider, Form, Input, InputNumber, Row } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import { Sheet } from '@shared/components/Sheet';
import type { FieldVisit } from '@shared/api/types';
import { BranchSelect, FarmerSelect } from '@shared/components/pickers';
import { useCreateFieldVisit, useUpdateFieldVisit } from '@shared/hooks/useFieldVisits';
import { toIsoDate } from '@shared/utils/format';
import { positiveNumber, required } from '@shared/validation/rules';

interface FieldVisitFormModalProps {
  open: boolean;
  /** Present means edit; absent means create. */
  visit?: FieldVisit | null;
  onClose: () => void;
}

interface FieldVisitForm {
  farmerId: string;
  branchId: string;
  visitDate: Dayjs;
  cropName?: string;
  cropGrowthStage?: string;
  cropHealth?: string;
  pestStatus?: string;
  diseaseObservation?: string;
  fertilizerAdvice?: string;
  irrigationAdvice?: string;
  pestControlSuggestions?: string;
  harvestPreparation?: string;
  yieldPredictionQty?: number;
}

/**
 * Crop monitoring visit (FRD Section 12).
 *
 * Split into what was observed and what was advised, because those are two
 * different things and conflating them makes the record useless later — when a
 * batch fails inspection, the question is always which of the two was wrong.
 *
 * The expert is taken from the token server-side, so there is no "visited by"
 * field. The same records are captured offline by the Agriculture Expert app
 * (WS3.1) and sync here.
 */
export function FieldVisitFormModal({ open, visit, onClose }: FieldVisitFormModalProps) {
  const [form] = Form.useForm<FieldVisitForm>();
  const { message } = AntApp.useApp();
  const createVisit = useCreateFieldVisit();
  const updateVisit = useUpdateFieldVisit();

  const isEdit = Boolean(visit);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (visit) {
      form.setFieldsValue({
        farmerId: visit.farmerId,
        branchId: visit.branchId,
        visitDate: dayjs(visit.visitDate),
        cropName: visit.cropName ?? undefined,
        cropGrowthStage: visit.cropGrowthStage ?? undefined,
        cropHealth: visit.cropHealth ?? undefined,
        pestStatus: visit.pestStatus ?? undefined,
        diseaseObservation: visit.diseaseObservation ?? undefined,
        fertilizerAdvice: visit.fertilizerAdvice ?? undefined,
        irrigationAdvice: visit.irrigationAdvice ?? undefined,
        pestControlSuggestions: visit.pestControlSuggestions ?? undefined,
        harvestPreparation: visit.harvestPreparation ?? undefined,
        yieldPredictionQty:
          visit.yieldPredictionQty === null ? undefined : Number(visit.yieldPredictionQty),
      });
    }
  }, [open, visit, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      visitDate: toIsoDate(values.visitDate) as string,
    };

    try {
      if (visit) {
        await updateVisit.mutateAsync({ id: visit.id, input: payload });
        message.success('Field visit updated');
      } else {
        await createVisit.mutateAsync(payload);
        message.success('Field visit recorded');
      }
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not record the visit'));
    }
  };

  return (
    <Sheet
      open={open}
      title={isEdit ? `Edit visit — ${visit?.farmer?.fullName ?? ''}` : 'Record field visit'}
      okText={isEdit ? 'Save changes' : 'Record visit'}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createVisit.isPending || updateVisit.isPending}
      width={760}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark preserve={false}>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="farmerId" label="Farmer" rules={[required('Farmer')]}>
              <FarmerSelect />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item name="branchId" label="Branch" rules={[required('Branch')]}>
              <BranchSelect />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item name="visitDate" label="Visit date" rules={[required('Visit date')]}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>
          Observed
        </Divider>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="cropName" label="Crop">
              <Input placeholder="Wheat" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="cropGrowthStage" label="Growth stage">
              <Input placeholder="e.g. Tillering, Flowering" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="cropHealth" label="Crop health">
              <Input placeholder="e.g. Good, Stressed" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="pestStatus" label="Pest status">
              <Input placeholder="e.g. None seen, Aphids present" />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="diseaseObservation" label="Disease observations">
              <Input.TextArea rows={2} placeholder="Optional" />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>
          Advised
        </Divider>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="fertilizerAdvice" label="Fertiliser">
              <Input.TextArea rows={2} placeholder="Optional" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="irrigationAdvice" label="Irrigation">
              <Input.TextArea rows={2} placeholder="Optional" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="pestControlSuggestions" label="Pest control">
              <Input.TextArea rows={2} placeholder="Optional" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="harvestPreparation" label="Harvest preparation">
              <Input.TextArea rows={2} placeholder="Optional" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="yieldPredictionQty"
              label="Predicted yield (KG)"
              rules={[positiveNumber('Predicted yield')]}
              extra="Feeds procurement planning — worth an estimate even if rough."
            >
              <InputNumber style={{ width: '100%' }} min={0} step={100} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Sheet>
  );
}
