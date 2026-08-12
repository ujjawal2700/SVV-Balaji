import { App as AntApp, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import { FarmerSelect } from '../../components/pickers';
import { useCreateSeedDistribution } from '../../hooks/useSeedDistribution';
import { toIsoDate } from '../../utils/format';
import { positiveNumber, required } from '../../validation/rules';

interface SeedDistributionFormModalProps {
  open: boolean;
  onClose: () => void;
}

interface SeedForm {
  farmerId: string;
  seedName: string;
  seedVariety?: string;
  quantity: number;
  unit?: string;
  batchNumber?: string;
  distributionDate: Dayjs;
}

const UNITS = ['KG', 'GRAM', 'QUINTAL', 'PACKET', 'LITRE'];

/**
 * Certified seed and input distribution (FRD Section 10).
 *
 * Recorded by the Agriculture Expert after handing stock over at the farm. The
 * distributing user is taken from the token server-side, so there is no "issued
 * by" field here — it is always whoever is signed in.
 */
export function SeedDistributionFormModal({ open, onClose }: SeedDistributionFormModalProps) {
  const [form] = Form.useForm<SeedForm>();
  const { message } = AntApp.useApp();
  const createDistribution = useCreateSeedDistribution();

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      await createDistribution.mutateAsync({
        farmerId: values.farmerId,
        seedName: values.seedName,
        seedVariety: values.seedVariety,
        quantity: values.quantity,
        unit: values.unit,
        batchNumber: values.batchNumber,
        distributionDate: toIsoDate(values.distributionDate) as string,
      });
      message.success('Distribution logged');
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not log the distribution'));
    }
  };

  return (
    <Modal
      open={open}
      title="Log seed distribution"
      okText="Log distribution"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createDistribution.isPending}
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
        <Form.Item name="farmerId" label="Farmer" rules={[required('Farmer')]}>
          <FarmerSelect />
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="seedName" label="Seed or input" rules={[required('Seed or input')]}>
              <Input placeholder="Wheat seed" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="seedVariety" label="Variety">
              <Input placeholder="Optional" />
            </Form.Item>
          </Col>

          <Col xs={16} md={8}>
            <Form.Item
              name="quantity"
              label="Quantity"
              rules={[required('Quantity'), positiveNumber('Quantity')]}
            >
              <InputNumber style={{ width: '100%' }} min={0} step={1} />
            </Form.Item>
          </Col>
          <Col xs={8} md={4}>
            <Form.Item name="unit" label="Unit">
              <Select options={UNITS.map((unit) => ({ value: unit, label: unit }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="distributionDate"
              label="Date issued"
              rules={[required('Date issued')]}
            >
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>

          <Col xs={24}>
            <Form.Item
              name="batchNumber"
              label="Supplier batch number"
              extra="The seed supplier's own lot number, if the packaging carries one. Worth capturing — it is the only link back if a batch of seed turns out to be bad."
            >
              <Input placeholder="Optional" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
