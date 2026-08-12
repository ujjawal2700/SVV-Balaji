import { App as AntApp, Col, DatePicker, Divider, Form, Input, InputNumber, Modal, Row } from 'antd';
import type { Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import { BranchSelect, FarmerSelect } from '../../components/pickers';
import { useCreateFieldVisit } from '../../hooks/useFieldVisits';
import { toIsoDate } from '../../utils/format';
import { positiveNumber, required } from '../../validation/rules';

interface FieldVisitFormModalProps {
  open: boolean;
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
export function FieldVisitFormModal({ open, onClose }: FieldVisitFormModalProps) {
  const [form] = Form.useForm<FieldVisitForm>();
  const { message } = AntApp.useApp();
  const createVisit = useCreateFieldVisit();

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      await createVisit.mutateAsync({
        ...values,
        visitDate: toIsoDate(values.visitDate) as string,
      });
      message.success('Field visit recorded');
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not record the visit'));
    }
  };

  return (
    <Modal
      open={open}
      title="Record field visit"
      okText="Record visit"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createVisit.isPending}
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
    </Modal>
  );
}
