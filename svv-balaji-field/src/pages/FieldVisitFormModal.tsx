import {
  CalendarOutlined,
  CompassOutlined,
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
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { FieldVisit } from '@shared/api/types';
import { BranchSelect, FarmerSelect } from '@shared/components/pickers';
import { useCreateFieldVisit, useUpdateFieldVisit } from '@shared/hooks/useFieldVisits';
import { useIsMobile } from '@shared/hooks/useIsMobile';
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

export function FieldVisitFormModal({ open, visit, onClose }: FieldVisitFormModalProps) {
  const isMobile = useIsMobile();
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
        message.success('Field visit updated successfully');
      } else {
        await createVisit.mutateAsync(payload);
        message.success('Field visit recorded successfully');
      }
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not record the visit'));
    }
  };

  const formContent = (
    <Form form={form} layout="vertical" requiredMark preserve={false} style={{ padding: isMobile ? 0 : '4px 0' }}>
      {/* Section 1: Farmer & Logistics */}
      <FormSectionCard
        icon={<EnvironmentOutlined />}
        iconBg="#ecfdf5"
        iconColor="#059669"
        title="Visit & Assignment Details"
        subtitle="Specify farmer, SVV branch, and visit date"
      >
        <Row gutter={[14, 0]}>
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
            <Form.Item name="visitDate" label="Visit Date" rules={[required('Visit date')]}>
              <DatePicker style={{ width: '100%', borderRadius: 8 }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
        </Row>
      </FormSectionCard>

      {/* Section 2: Crop Observations */}
      <FormSectionCard
        icon={<CompassOutlined />}
        iconBg="#eff6ff"
        iconColor="#2563eb"
        title="Field Observations"
        subtitle="Crop health, growth milestone, and pest inspection"
      >
        <Row gutter={[14, 0]}>
          <Col xs={24} md={12}>
            <Form.Item name="cropName" label="Crop Name">
              <Input placeholder="e.g. Wheat, Cotton, Chilli" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="cropGrowthStage" label="Growth Stage">
              <Input placeholder="e.g. Vegetative, Flowering, Pod Development" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="cropHealth" label="Crop Health Status">
              <Input placeholder="e.g. Healthy, Mild Stress, Nitrogen Deficiency" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="pestStatus" label="Pest & Insect Status">
              <Input placeholder="e.g. None seen, Aphids, Stem Borer" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="diseaseObservation" label="Disease & Pathology Observations">
              <Input.TextArea rows={2} placeholder="Optional notes on disease symptoms" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
        </Row>
      </FormSectionCard>

      {/* Section 3: Recommendations & Yield Prediction */}
      <FormSectionCard
        icon={<ExperimentOutlined />}
        iconBg="#fffbeb"
        iconColor="#d97706"
        title="Agronomic Advice & Yield Prediction"
        subtitle="Nutrient management, irrigation, and estimated output"
      >
        <Row gutter={[14, 0]}>
          <Col xs={24} md={12}>
            <Form.Item name="fertilizerAdvice" label="Fertiliser & Nutrient Advice">
              <Input.TextArea rows={2} placeholder="e.g. Urea dosage, organic spray" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="irrigationAdvice" label="Irrigation Schedule">
              <Input.TextArea rows={2} placeholder="e.g. Next watering in 4 days" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="pestControlSuggestions" label="Pest Control / Spray Suggestions">
              <Input.TextArea rows={2} placeholder="e.g. Neem oil spray 5ml/L" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="harvestPreparation" label="Harvest Preparation">
              <Input.TextArea rows={2} placeholder="e.g. Stop watering 10 days before cut" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="yieldPredictionQty"
              label="Predicted Yield (KG)"
              rules={[positiveNumber('Predicted yield')]}
              extra="Feeds procurement supply planning"
            >
              <InputNumber style={{ width: '100%', borderRadius: 8 }} min={0} step={100} placeholder="e.g. 5000" />
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
          <CalendarOutlined />
        </div>
        <div>
          <Typography.Title level={4} style={{ margin: 0, color: '#0f172a', fontWeight: 700, letterSpacing: '-0.01em' }}>
            {isEdit ? `Edit Field Visit — ${visit?.farmer?.fullName ?? ''}` : 'Record Field Visit'}
          </Typography.Title>
          <Typography.Text style={{ color: '#475569', fontSize: 13, display: 'block', marginTop: 2 }}>
            {isEdit ? 'Update crop health status and agronomic guidance' : 'Log crop monitoring, pest observations, and farmer guidance'}
          </Typography.Text>
        </div>
      </div>
    </div>
  );

  const isPending = createVisit.isPending || updateVisit.isPending;

  if (isMobile) {
    return (
      <Drawer
        open={open}
        onClose={onClose}
        title={headerContent}
        placement="top"
        height="100vh"
        styles={{
          body: { background: '#f8fafc', padding: '14px 14px 80px 14px' },
          header: { borderBottom: '1px solid #e2e8f0' },
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
              {isEdit ? 'Save Changes' : 'Log Field Visit'}
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
      width={760}
      style={{ top: 24, paddingBottom: 24 }}
      styles={{
        body: {
          background: '#f8fafc',
          padding: '16px 20px',
          maxHeight: 'calc(90vh - 130px)',
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
            {isEdit ? 'Save Changes' : 'Record Field Visit'}
          </Button>
        </div>
      }
      destroyOnClose
    >
      {formContent}
    </Modal>
  );
}
