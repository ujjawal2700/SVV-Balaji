import { App as AntApp, Col, DatePicker, Form, Input, InputNumber, Modal, Row } from 'antd';
import type { Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import { FarmerSelect } from '../../components/pickers';
import { useCreateAgreement } from '../../hooks/useAgreements';
import { toIsoDate } from '../../utils/format';
import { dateAfter, positiveNumber, required } from '../../validation/rules';

interface AgreementFormModalProps {
  open: boolean;
  onClose: () => void;
}

interface AgreementForm {
  farmerId: string;
  cropName: string;
  variety?: string;
  expectedQuantity: number;
  purchaseRate: number;
  agreementDate: Dayjs;
  harvestDate?: Dayjs;
  qualityStandards?: string;
}

/**
 * Pre-season rate, quality and quantity agreement (FRD Section 9).
 *
 * The farmer picker is deliberately NOT restricted to approved farmers: an
 * agreement is signed before the season and can legitimately precede approval.
 * The picker shows each farmer's code, or "pending approval", so whoever is
 * entering it can see which they are dealing with.
 *
 * The rate recorded here is what a collection falls back to when no rate is
 * supplied at weighing, so it is not a nice-to-have field.
 */
export function AgreementFormModal({ open, onClose }: AgreementFormModalProps) {
  const [form] = Form.useForm<AgreementForm>();
  const { message } = AntApp.useApp();
  const createAgreement = useCreateAgreement();

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      await createAgreement.mutateAsync({
        farmerId: values.farmerId,
        cropName: values.cropName,
        variety: values.variety,
        expectedQuantity: values.expectedQuantity,
        purchaseRate: values.purchaseRate,
        agreementDate: toIsoDate(values.agreementDate) as string,
        harvestDate: toIsoDate(values.harvestDate),
        qualityStandards: values.qualityStandards,
      });
      message.success('Agreement recorded');
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not record the agreement'));
    }
  };

  return (
    <Modal
      open={open}
      title="New agreement"
      okText="Record agreement"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createAgreement.isPending}
      width={680}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark preserve={false}>
        <Form.Item name="farmerId" label="Farmer" rules={[required('Farmer')]}>
          <FarmerSelect />
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="cropName" label="Crop" rules={[required('Crop')]}>
              <Input placeholder="Wheat" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="variety" label="Variety">
              <Input placeholder="Optional — e.g. Sharbati" />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item
              name="expectedQuantity"
              label="Expected quantity (KG)"
              rules={[required('Expected quantity'), positiveNumber('Expected quantity')]}
            >
              <InputNumber style={{ width: '100%' }} min={0} step={100} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="purchaseRate"
              label="Purchase rate (₹ per KG)"
              rules={[required('Purchase rate'), positiveNumber('Purchase rate')]}
              extra="Collections fall back to this rate when none is entered at weighing."
            >
              <InputNumber style={{ width: '100%' }} min={0} step={1} />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item
              name="agreementDate"
              label="Agreement date"
              rules={[required('Agreement date')]}
            >
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="harvestDate"
              label="Expected harvest"
              dependencies={['agreementDate']}
              rules={[dateAfter('agreementDate', 'the agreement date', { orEqual: true })]}
            >
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="qualityStandards"
          label="Quality standards"
          extra="What the crop has to meet at inspection — moisture ceiling, foreign matter, grain size."
        >
          <Input.TextArea rows={3} placeholder="Optional" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
