import {
  Alert,
  App as AntApp,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { Agreement } from '../../api/types';
import { FarmerSelect } from '../../components/pickers';
import { useCreateAgreement, useUpdateAgreement } from '../../hooks/useAgreements';
import { toIsoDate } from '../../utils/format';
import { dateAfter, positiveNumber, required } from '../../validation/rules';

interface AgreementFormModalProps {
  open: boolean;
  /** Present means edit; absent means create. */
  agreement?: Agreement | null;
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
export function AgreementFormModal({ open, agreement, onClose }: AgreementFormModalProps) {
  const [form] = Form.useForm<AgreementForm>();
  const { message } = AntApp.useApp();
  const createAgreement = useCreateAgreement();
  const updateAgreement = useUpdateAgreement();

  const isEdit = Boolean(agreement);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (agreement) {
      form.setFieldsValue({
        farmerId: agreement.farmerId,
        cropName: agreement.cropName,
        variety: agreement.variety ?? undefined,
        // Decimals arrive as strings from Prisma.
        expectedQuantity: Number(agreement.expectedQuantity),
        purchaseRate: Number(agreement.purchaseRate),
        agreementDate: dayjs(agreement.agreementDate),
        harvestDate: agreement.harvestDate ? dayjs(agreement.harvestDate) : undefined,
        qualityStandards: agreement.qualityStandards ?? undefined,
      });
    }
  }, [open, agreement, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const payload = {
      cropName: values.cropName,
      variety: values.variety,
      expectedQuantity: values.expectedQuantity,
      purchaseRate: values.purchaseRate,
      agreementDate: toIsoDate(values.agreementDate) as string,
      harvestDate: toIsoDate(values.harvestDate),
      qualityStandards: values.qualityStandards,
    };

    try {
      if (agreement) {
        await updateAgreement.mutateAsync({ id: agreement.id, input: payload });
        message.success('Agreement updated');
      } else {
        await createAgreement.mutateAsync({ farmerId: values.farmerId, ...payload });
        message.success('Agreement recorded');
      }
      onClose();
    } catch (error) {
      message.error(
        apiErrorMessage(error, `Could not ${isEdit ? 'update' : 'record'} the agreement`),
        8,
      );
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? `Edit agreement — ${agreement?.cropName}` : 'New agreement'}
      okText={isEdit ? 'Save changes' : 'Record agreement'}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createAgreement.isPending || updateAgreement.isPending}
      width={680}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark preserve={false}>
        {isEdit ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="The farmer cannot be changed"
            description="An agreement records a commitment made to one farmer. If it was raised against the wrong person, delete it and record a new one — the server refuses a reassignment."
          />
        ) : null}

        <Form.Item name="farmerId" label="Farmer" rules={[required('Farmer')]}>
          <FarmerSelect disabled={isEdit} />
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
