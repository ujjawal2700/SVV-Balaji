import {
  CameraOutlined,
  CompassOutlined,
  EnvironmentOutlined,
  ExperimentOutlined,
  MedicineBoxOutlined,
} from '@ant-design/icons';
import {
  App as AntApp,
  Button,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { FieldVisit } from '../../api/types';
import { BranchSelect, FarmerSelect } from '../../components/pickers';
import {
  useAddFieldVisitDocument,
  useCreateFieldVisit,
  useUpdateFieldVisit,
} from '../../hooks/useFieldVisits';
import { FileUploadField } from '../../components/FileUploadField';
import { toIsoDate } from '../../utils/format';
import { positiveNumber, required } from '../../validation/rules';

/** Label the attachment by what it plainly is, from the stored URL. */
function fileTypeFor(url: string): string {
  return /\.(mp4|mov)(\?|$)/i.test(url) ? 'video' : 'photo';
}

interface FieldVisitFormModalProps {
  open: boolean;
  /** Present means edit; absent means create. */
  visit?: FieldVisit | null;
  onClose: () => void;
}

interface FieldVisitForm {
  /** Set by FileUploadField once the file is stored. A URL, not a File. */
  attachmentUrl?: string;
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
          {subtitle ? (
            <Typography.Text style={{ fontSize: 12, color: '#64748b', display: 'block', marginTop: 2 }}>
              {subtitle}
            </Typography.Text>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

export function FieldVisitFormModal({ open, visit, onClose }: FieldVisitFormModalProps) {
  const [form] = Form.useForm<FieldVisitForm>();
  const { message } = AntApp.useApp();
  const createVisit = useCreateFieldVisit();
  const updateVisit = useUpdateFieldVisit();
  const addDocument = useAddFieldVisitDocument();

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

    const { attachmentUrl, ...rest } = values;
    const payload = {
      ...rest,
      visitDate: toIsoDate(values.visitDate) as string,
    };

    try {
      const saved = visit
        ? await updateVisit.mutateAsync({ id: visit.id, input: payload })
        : await createVisit.mutateAsync(payload);

      if (attachmentUrl) {
        try {
          await addDocument.mutateAsync({
            id: visit?.id ?? saved.id,
            input: { fileUrl: attachmentUrl, fileType: fileTypeFor(attachmentUrl) },
          });
        } catch (error) {
          message.warning(
            apiErrorMessage(
              error,
              'The visit was saved but the attachment could not be linked. Add it again from the visit.',
            ),
            10,
          );
          onClose();
          return;
        }
      }

      message.success(visit ? 'Field visit updated' : 'Field visit recorded');
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not record the visit'));
    }
  };

  const formContent = (
    <Form form={form} layout="vertical" requiredMark preserve={false}>
      {/* Section 1: Visit & Farmer Info */}
      <FormSectionCard
        icon={<CompassOutlined />}
        iconBg="#ecfdf5"
        iconColor="#059669"
        title="Visit & Farmer Details"
        subtitle="Specify farmer, operational branch, and visit date"
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
        icon={<ExperimentOutlined />}
        iconBg="#eff6ff"
        iconColor="#2563eb"
        title="Field & Crop Observations"
        subtitle="Document current crop growth stage, health status, and symptoms"
      >
        <Row gutter={[14, 0]}>
          <Col xs={24} md={12}>
            <Form.Item name="cropName" label="Crop Name">
              <Input placeholder="e.g. Wheat, Mustard" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="cropGrowthStage" label="Growth Stage">
              <Input placeholder="e.g. Vegetative, Tillering, Flowering" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="cropHealth" label="Crop Health Condition">
              <Input placeholder="e.g. Good, Healthy, Stressed" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="pestStatus" label="Pest Status">
              <Input placeholder="e.g. None detected, Mild Aphids" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="diseaseObservation" label="Disease & Weed Observations">
              <Input.TextArea rows={2} placeholder="Note any visible fungal, bacterial, or weed symptoms..." style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
        </Row>
      </FormSectionCard>

      {/* Section 3: Expert Agronomy Advice */}
      <FormSectionCard
        icon={<MedicineBoxOutlined />}
        iconBg="#fef3c7"
        iconColor="#d97706"
        title="Expert Advice & Yield Forecast"
        subtitle="Input actionable agronomy recommendations and expected harvest quantity"
      >
        <Row gutter={[14, 0]}>
          <Col xs={24} md={12}>
            <Form.Item name="fertilizerAdvice" label="Fertiliser Recommendation">
              <Input.TextArea rows={2} placeholder="e.g. Apply NPK 20-20-20 @ 5kg/acre..." style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="irrigationAdvice" label="Irrigation Guidance">
              <Input.TextArea rows={2} placeholder="e.g. Schedule light irrigation in 2 days..." style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="pestControlSuggestions" label="Pest & Disease Control Advice">
              <Input.TextArea rows={2} placeholder="e.g. Neem oil spray 5ml/Litre..." style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="harvestPreparation" label="Harvest Preparation">
              <Input.TextArea rows={2} placeholder="e.g. Stop watering 7 days before harvest..." style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item
              name="yieldPredictionQty"
              label="Predicted Yield (KG)"
              rules={[positiveNumber('Predicted yield')]}
              extra="Estimated production volume for procurement planning"
            >
              <InputNumber style={{ width: '100%', borderRadius: 8 }} min={0} step={100} placeholder="e.g. 2500" />
            </Form.Item>
          </Col>
        </Row>
      </FormSectionCard>

      {/* Section 4: Visual Evidence */}
      <FormSectionCard
        icon={<CameraOutlined />}
        iconBg="#fdf4ff"
        iconColor="#a855f7"
        title="Field Evidence & Media"
        subtitle="Capture photos or video footage of crops and field conditions"
      >
        <Form.Item
          name="attachmentUrl"
          extra="Upload photos or videos while visiting the field. Additional documents can also be attached later."
        >
          <FileUploadField
            folder="field-visits"
            allowVideo
            hint="Photos are optimized before uploading; videos up to 20 MB are preserved in original quality."
          />
        </Form.Item>
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
        borderRadius: '14px 14px 0 0',
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
          <EnvironmentOutlined />
        </div>
        <div>
          <Typography.Title level={4} style={{ margin: 0, color: '#0f172a', fontWeight: 700, letterSpacing: '-0.01em' }}>
            {isEdit ? `Edit Field Visit — ${visit?.farmer?.fullName ?? ''}` : 'Record Field Visit'}
          </Typography.Title>
          <Typography.Text style={{ color: '#475569', fontSize: 13, display: 'block', marginTop: 2 }}>
            Capture crop health, pest diagnosis, actionable agronomy advice and yield estimates
          </Typography.Text>
        </div>
      </div>
    </div>
  );

  const isPending = createVisit.isPending || updateVisit.isPending;

  return (
    <Modal
      open={open}
      title={headerContent}
      onCancel={onClose}
      width={760}
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
            {isEdit ? 'Save Changes' : 'Record Visit'}
          </Button>
        </div>
      }
      destroyOnClose
    >
      {formContent}
    </Modal>
  );
}
