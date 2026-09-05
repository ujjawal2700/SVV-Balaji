import {
  CameraOutlined,
  CompassOutlined,
  EnvironmentOutlined,
  ExperimentOutlined,
  MedicineBoxOutlined,
} from '@ant-design/icons';
import {
  App as AntApp,
  AutoComplete,
  Button,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Tag,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { FieldVisit } from '../../api/types';
import { BranchSelect, FarmerSelect } from '../../components/pickers';
import {
  useAddFieldVisitDocument,
  useCreateFieldVisit,
  useUpdateFieldVisit,
} from '../../hooks/useFieldVisits';
import { useFarmer } from '../../hooks/useFarmers';
import { FileUploadField } from '../../components/FileUploadField';
import { toIsoDate } from '../../utils/format';
import { positiveNumber, required } from '../../validation/rules';

const GROWTH_STAGE_OPTIONS = [
  { value: 'Germination' },
  { value: 'Vegetative' },
  { value: 'Tillering' },
  { value: 'Flowering / Pollination' },
  { value: 'Pod / Grain Formation' },
  { value: 'Ripening / Maturation' },
  { value: 'Harvest Ready' },
];

const HEALTH_OPTIONS = [
  { value: 'Good / Healthy' },
  { value: 'Excellent' },
  { value: 'Normal Growth' },
  { value: 'Moisture Stressed' },
  { value: 'Nutrient Deficient' },
  { value: 'Diseased / Pest Damaged' },
];

const PEST_STATUS_OPTIONS = [
  { value: 'No pests detected' },
  { value: 'Mild Aphids / Insects' },
  { value: 'Moderate Infestation' },
  { value: 'Severe Infestation' },
  { value: 'Treated & Under Control' },
];

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

  const selectedFarmerId = Form.useWatch('farmerId', form);
  const { data: farmer } = useFarmer(selectedFarmerId);

  // Extract all unique crops associated with this farmer
  const farmerCropOptions = useMemo(() => {
    if (!farmer) return [];
    const crops = new Set<string>();

    if (farmer.cropDetails) {
      farmer.cropDetails
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
        .forEach((c) => crops.add(c));
    }
    (farmer.agreements ?? []).forEach((a) => {
      if (a.cropName?.trim()) crops.add(a.cropName.trim());
    });
    (farmer.seedDistributions ?? []).forEach((s) => {
      if (s.seedName?.trim()) crops.add(s.seedName.trim());
    });
    (farmer.fieldVisits ?? []).forEach((v) => {
      if (v.cropName?.trim()) crops.add(v.cropName.trim());
    });

    return Array.from(crops).map((crop) => ({ value: crop, label: crop }));
  }, [farmer]);

  useEffect(() => {
    if (isEdit || !farmer) return;

    // 1. Auto-fill branchId
    if (!form.isFieldTouched('branchId') || !form.getFieldValue('branchId')) {
      if (farmer.branchId) {
        form.setFieldValue('branchId', farmer.branchId);
      }
    }

    // 2. Auto-fill cropName
    if (!form.isFieldTouched('cropName') || !form.getFieldValue('cropName')) {
      const pastAgreements = farmer.agreements;
      const pastSeedDists = farmer.seedDistributions;
      const pastVisits = farmer.fieldVisits;

      if (pastAgreements && pastAgreements.length > 0 && pastAgreements[0].cropName) {
        form.setFieldValue('cropName', pastAgreements[0].cropName);
      } else if (pastSeedDists && pastSeedDists.length > 0 && pastSeedDists[0].seedName) {
        form.setFieldValue('cropName', pastSeedDists[0].seedName);
      } else if (pastVisits && pastVisits.length > 0 && pastVisits[0].cropName) {
        form.setFieldValue('cropName', pastVisits[0].cropName);
      } else if (farmer.cropDetails) {
        const crops = farmer.cropDetails
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean);
        if (crops.length > 0) {
          form.setFieldValue('cropName', crops[0]);
        }
      }
    }

    // 3. Auto-fill yield prediction from latest agreement expectedQuantity
    if (!form.isFieldTouched('yieldPredictionQty') || !form.getFieldValue('yieldPredictionQty')) {
      if (farmer.agreements && farmer.agreements.length > 0) {
        const qty = Number(farmer.agreements[0].expectedQuantity);
        if (qty > 0) {
          form.setFieldValue('yieldPredictionQty', qty);
        }
      }
    }
  }, [farmer, form, isEdit]);

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
        title="Visit & Farmer / Supplier Details"
        subtitle="Specify farmer / supplier, operational branch, and visit date"
      >
        <Row gutter={[14, 0]}>
          <Col xs={24} md={12}>
            <Form.Item name="farmerId" label="Farmer / Supplier" rules={[required('Farmer / Supplier')]}>
              <FarmerSelect />
            </Form.Item>
            {farmer ? (
              <div style={{ marginTop: -8, marginBottom: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {farmer.farmSizeAcres ? <Tag color="blue">Holding: {farmer.farmSizeAcres} Acres</Tag> : null}
                {farmer.irrigationType ? <Tag color="cyan">Irrigation: {farmer.irrigationType}</Tag> : null}
                {farmer.landType ? <Tag color="gold">Soil: {farmer.landType}</Tag> : null}
                {farmer.village ? <Tag color="green">Village: {farmer.village}</Tag> : null}
              </div>
            ) : null}
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
            <Form.Item
              name="cropName"
              label="Crop Name"
              extra={farmerCropOptions.length > 0 ? 'Select from registered crops or type a new one' : undefined}
            >
              <AutoComplete
                options={farmerCropOptions.length > 0 ? farmerCropOptions : undefined}
                placeholder="e.g. Wheat, Mustard"
                style={{ width: '100%', borderRadius: 8 }}
                filterOption={(inputValue, option) =>
                  (option?.value?.toUpperCase() ?? '').includes(inputValue.toUpperCase())
                }
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="cropGrowthStage" label="Growth Stage">
              <AutoComplete
                options={GROWTH_STAGE_OPTIONS}
                placeholder="e.g. Vegetative, Tillering, Flowering"
                style={{ width: '100%', borderRadius: 8 }}
                filterOption={(inputValue, option) =>
                  (option?.value?.toUpperCase() ?? '').includes(inputValue.toUpperCase())
                }
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="cropHealth" label="Crop Health Condition">
              <AutoComplete
                options={HEALTH_OPTIONS}
                placeholder="e.g. Good / Healthy, Stressed"
                style={{ width: '100%', borderRadius: 8 }}
                filterOption={(inputValue, option) =>
                  (option?.value?.toUpperCase() ?? '').includes(inputValue.toUpperCase())
                }
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="pestStatus" label="Pest Status">
              <AutoComplete
                options={PEST_STATUS_OPTIONS}
                placeholder="e.g. No pests detected, Mild Aphids"
                style={{ width: '100%', borderRadius: 8 }}
                filterOption={(inputValue, option) =>
                  (option?.value?.toUpperCase() ?? '').includes(inputValue.toUpperCase())
                }
              />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="diseaseObservation" label="Disease, Weed & Crop Remarks">
              <Input.TextArea rows={2} placeholder="Note any visible fungal, bacterial, pest symptoms, weed pressure or crop health remarks..." style={{ borderRadius: 8 }} />
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
            <Form.Item name="harvestPreparation" label="Harvest Preparation & General Remarks">
              <Input.TextArea rows={2} placeholder="e.g. Stop watering 7 days before harvest, field readiness remarks..." style={{ borderRadius: 8 }} />
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
