import {
  EnvironmentOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import {
  App as AntApp,
  Button,
  Col,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { SeedDistribution } from '@shared/api/types';
import { FarmerSelect } from '@shared/components/pickers';
import {
  useCreateSeedDistribution,
  useUpdateSeedDistribution,
} from '@shared/hooks/useSeedDistribution';
import { useIsMobile } from '@shared/hooks/useIsMobile';
import { toIsoDate } from '@shared/utils/format';
import { positiveNumber, required } from '@shared/validation/rules';

interface SeedDistributionFormModalProps {
  open: boolean;
  /** Present means edit; absent means create. */
  record?: SeedDistribution | null;
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

interface SectionCardProps {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

function FormSectionCard({ icon, iconBg, iconColor, title, subtitle, children }: SectionCardProps) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: '16px 18px',
        marginBottom: 16,
        boxShadow: '0 1px 2px 0 rgba(15, 23, 42, 0.03)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: iconBg,
            color: iconColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div>
          <Typography.Text strong style={{ fontSize: 14, color: '#0f172a', display: 'block', lineHeight: 1.2 }}>
            {title}
          </Typography.Text>
          {subtitle && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {subtitle}
            </Typography.Text>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

export function SeedDistributionFormModal({
  open,
  record,
  onClose,
}: SeedDistributionFormModalProps) {
  const isMobile = useIsMobile();
  const [form] = Form.useForm<SeedForm>();
  const { message } = AntApp.useApp();
  const createDistribution = useCreateSeedDistribution();
  const updateDistribution = useUpdateSeedDistribution();

  const isEdit = Boolean(record);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (record) {
      form.setFieldsValue({
        farmerId: record.farmerId,
        seedName: record.seedName,
        seedVariety: record.seedVariety ?? undefined,
        quantity: Number(record.quantity),
        unit: record.unit,
        batchNumber: record.batchNumber ?? undefined,
        distributionDate: dayjs(record.distributionDate),
      });
    }
  }, [open, record, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const payload = {
      farmerId: values.farmerId,
      seedName: values.seedName,
      seedVariety: values.seedVariety,
      quantity: values.quantity,
      unit: values.unit,
      batchNumber: values.batchNumber,
      distributionDate: toIsoDate(values.distributionDate) as string,
    };

    try {
      if (record) {
        await updateDistribution.mutateAsync({ id: record.id, input: payload });
        message.success('Seed distribution updated successfully');
      } else {
        await createDistribution.mutateAsync(payload);
        message.success('Seed distribution logged successfully');
      }
      onClose();
    } catch (error) {
      message.error(
        apiErrorMessage(error, `Could not ${isEdit ? 'update' : 'log'} the distribution`),
        8,
      );
    }
  };

  const formContent = (
    <Form
      form={form}
      layout="vertical"
      requiredMark
      preserve={false}
      initialValues={{ unit: 'KG' }}
      style={{ padding: isMobile ? 0 : '4px 0' }}
    >
      <FormSectionCard
        icon={<EnvironmentOutlined />}
        iconBg="#ecfdf5"
        iconColor="#059669"
        title="Beneficiary Farmer"
        subtitle="Select the registered farmer receiving the seed batch"
      >
        <Form.Item name="farmerId" label="Farmer" rules={[required('Farmer')]}>
          <FarmerSelect />
        </Form.Item>
      </FormSectionCard>

      <FormSectionCard
        icon={<ExperimentOutlined />}
        iconBg="#eff6ff"
        iconColor="#2563eb"
        title="Seed & Input Particulars"
        subtitle="Input name, variety, distributed quantity, and batch number"
      >
        <Row gutter={[14, 0]}>
          <Col xs={24} md={12}>
            <Form.Item name="seedName" label="Seed / Input Name" rules={[required('Seed or input')]}>
              <Input placeholder="e.g. Certified Wheat HD-2967" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="seedVariety" label="Variety / Strain">
              <Input placeholder="e.g. Hybrid Sharbati" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>

          <Col xs={16} md={8}>
            <Form.Item
              name="quantity"
              label="Quantity Handed Out"
              rules={[required('Quantity'), positiveNumber('Quantity')]}
            >
              <InputNumber style={{ width: '100%', borderRadius: 8 }} min={0} step={1} placeholder="e.g. 50" />
            </Form.Item>
          </Col>
          <Col xs={8} md={4}>
            <Form.Item name="unit" label="Unit">
              <Select
                options={UNITS.map((unit) => ({ value: unit, label: unit }))}
                style={{ borderRadius: 8 }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="distributionDate"
              label="Distribution Date"
              rules={[required('Date issued')]}
            >
              <DatePicker style={{ width: '100%', borderRadius: 8 }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>

          <Col xs={24}>
            <Form.Item
              name="batchNumber"
              label="Supplier / Lot Batch Number"
              extra="Printed on seed packaging — essential for batch traceability"
            >
              <Input placeholder="e.g. LOT-2026-WHT-0482" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
        </Row>
      </FormSectionCard>
    </Form>
  );

  const headerContent = (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 50%, #f7fee7 100%)',
        margin: '-16px -24px -16px -24px',
        padding: '18px 24px',
        borderRadius: isMobile ? 0 : '14px 14px 0 0',
        borderBottom: '1px solid #e2e8f0',
      }}
    >
      <svg
        viewBox="0 0 600 160"
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '100%',
          height: '100%',
          opacity: 0.45,
          pointerEvents: 'none',
        }}
      >
        <path d="M0,0 L600,0 L600,80 C480,140 420,20 320,110 C240,180 140,40 0,90 Z" fill="#d9f99d" />
        <path d="M0,0 L600,0 L600,40 C490,90 390,-10 280,70 C190,130 90,20 0,60 Z" fill="#a7f3d0" />
        <circle cx="50" cy="30" r="14" fill="none" stroke="#65a30d" strokeWidth="2" opacity="0.35" />
      </svg>

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#059669',
            fontSize: 20,
            boxShadow: '0 2px 8px rgba(5, 150, 105, 0.15)',
            border: '1px solid #a7f3d0',
            flexShrink: 0,
          }}
        >
          <ExperimentOutlined />
        </div>
        <div>
          <Typography.Title level={4} style={{ margin: 0, color: '#0f172a', fontWeight: 700, letterSpacing: '-0.01em' }}>
            {isEdit ? `Edit Seed Handout — ${record?.seedName}` : 'Record Seed Handout'}
          </Typography.Title>
          <Typography.Text style={{ color: '#475569', fontSize: 13, display: 'block', marginTop: 2 }}>
            Log certified seed batches, inputs, and quantities distributed to farmers
          </Typography.Text>
        </div>
      </div>
    </div>
  );

  const isPending = createDistribution.isPending || updateDistribution.isPending;

  if (isMobile) {
    return (
      <Drawer
        open={open}
        onClose={onClose}
        title={headerContent}
        placement="bottom"
        height="92%"
        styles={{
          body: { background: '#f8fafc', padding: '16px', overflowY: 'auto' },
          header: { borderBottom: '1px solid #e2e8f0' },
          footer: { borderTop: '1px solid #e2e8f0', padding: '12px 16px', background: '#fff' },
        }}
        footer={
          <div style={{ display: 'flex', gap: 10 }}>
            <Button block style={{ height: 44, borderRadius: 10 }} onClick={onClose}>
              Cancel
            </Button>
            <Button
              block
              type="primary"
              loading={isPending}
              onClick={handleSubmit}
              style={{
                height: 44,
                borderRadius: 10,
                fontWeight: 600,
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                boxShadow: '0 2px 8px 0 rgba(16, 185, 129, 0.3)',
              }}
            >
              {isEdit ? 'Save Changes' : 'Log Handout'}
            </Button>
          </div>
        }
        destroyOnClose
      >
        {formContent}
      </Drawer>
    );
  }

  return (
    <Modal
      open={open}
      title={headerContent}
      onCancel={onClose}
      width={680}
      style={{ top: 40, paddingBottom: 40 }}
      styles={{
        body: {
          background: '#f8fafc',
          padding: '16px 20px',
          maxHeight: 'calc(100vh - 180px)',
          overflowY: 'auto',
          margin: '0 -24px',
          paddingInline: 24,
        },
        header: {
          padding: '16px 24px',
          borderBottom: '1px solid #e2e8f0',
          marginBottom: 0,
        },
        footer: {
          padding: '14px 24px',
          borderTop: '1px solid #e2e8f0',
          margin: 0,
        },
      }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button style={{ height: 42, paddingInline: 20, borderRadius: 10 }} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="primary"
            loading={isPending}
            onClick={handleSubmit}
            style={{
              height: 42,
              paddingInline: 24,
              borderRadius: 10,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none',
              boxShadow: '0 2px 10px 0 rgba(16, 185, 129, 0.35)',
            }}
          >
            {isEdit ? 'Save Changes' : 'Log Handout'}
          </Button>
        </div>
      }
      destroyOnClose
    >
      {formContent}
    </Modal>
  );
}
