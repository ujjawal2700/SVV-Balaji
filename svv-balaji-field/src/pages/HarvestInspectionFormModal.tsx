import {
  CheckCircleOutlined,
  CompassOutlined,
  ExperimentOutlined,
  SafetyCertificateOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Button,
  Col,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Select,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { CreateHarvestInspectionInput, HarvestInspection } from '@shared/api/types';
import { FarmerSelect } from '@shared/components/pickers';
import { useAgreements } from '@shared/hooks/useAgreements';
import { useFarmPlots } from '@shared/hooks/useFarmPlots';
import { useIsMobile } from '@shared/hooks/useIsMobile';
import {
  useCreateHarvestInspection,
  useUpdateHarvestInspection,
} from '@shared/hooks/useProcurement';
import { toIsoDate } from '@shared/utils/format';
import { positiveNumber, required } from '@shared/validation/rules';

interface HarvestInspectionFormModalProps {
  open: boolean;
  /** Present means edit; absent means create. */
  inspection?: HarvestInspection | null;
  onClose: () => void;
}

interface InspectionForm extends Omit<CreateHarvestInspectionInput, 'inspectionDate'> {
  inspectionDate: Dayjs;
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

export function HarvestInspectionFormModal({
  open,
  inspection,
  onClose,
}: HarvestInspectionFormModalProps) {
  const isMobile = useIsMobile();
  const [form] = Form.useForm<InspectionForm>();
  const { message } = AntApp.useApp();
  const createInspection = useCreateHarvestInspection();
  const updateInspection = useUpdateHarvestInspection();

  const isEdit = Boolean(inspection);

  const farmerId = Form.useWatch('farmerId', form);
  const result = Form.useWatch('result', form);

  const agreements = useAgreements(farmerId);
  const plots = useFarmPlots(farmerId);

  const plotsAvailable = (plots.data?.data?.length ?? 0) > 0;

  const initialValues = useMemo(() => {
    if (!inspection) return undefined;
    return {
      farmerId: inspection.farmerId,
      agreementId: inspection.agreementId ?? undefined,
      plotId: inspection.plotId ?? undefined,
      procurementPlanId: inspection.procurementPlanId ?? undefined,
      cropName: inspection.cropName,
      inspectionDate: dayjs(inspection.inspectionDate),
      moistureLevel:
        inspection.moistureLevel === null ? undefined : Number(inspection.moistureLevel),
      foreignMatter:
        inspection.foreignMatter === null ? undefined : Number(inspection.foreignMatter),
      grainSize: inspection.grainSize ?? undefined,
      grainColor: inspection.grainColor ?? undefined,
      smell: inspection.smell ?? undefined,
      physicalDamage: inspection.physicalDamage ?? undefined,
      result: inspection.result,
      remarks: inspection.remarks ?? undefined,
    } as Partial<InspectionForm>;
  }, [inspection]);

  useEffect(() => {
    if (open) {
      if (initialValues) {
        form.setFieldsValue(initialValues);
      } else {
        form.resetFields();
        form.setFieldValue('result', 'APPROVED');
      }
    }
  }, [open, initialValues, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const payload: CreateHarvestInspectionInput = {
      ...values,
      inspectionDate: toIsoDate(values.inspectionDate) as string,
    };

    try {
      if (inspection) {
        await updateInspection.mutateAsync({ id: inspection.id, input: payload });
        message.success('Harvest inspection updated successfully');
      } else {
        await createInspection.mutateAsync(payload);
        message.success('Harvest inspection recorded successfully');
      }
      onClose();
    } catch (error) {
      message.error(
        apiErrorMessage(error, `Could not ${isEdit ? 'update' : 'record'} the inspection`),
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
      initialValues={initialValues}
      style={{ padding: isMobile ? 0 : '4px 0' }}
      onValuesChange={(changedValues) => {
        if ('farmerId' in changedValues) {
          form.setFieldValue('agreementId', undefined);
          form.setFieldValue('plotId', undefined);
        }
      }}
    >
      {/* Section 1: Farmer & Agreement Context */}
      <FormSectionCard
        icon={<SafetyCertificateOutlined />}
        iconBg="#ecfdf5"
        iconColor="#059669"
        title="Harvest & Producer Details"
        subtitle="Select approved farmer and link agreement/plot"
      >
        <Row gutter={[14, 0]}>
          <Col xs={24} md={12}>
            <Form.Item
              name="farmerId"
              label="Approved Farmer"
              rules={[required('Farmer')]}
              extra={
                isEdit
                  ? 'Fixed. An APPROVED result must not become transferable.'
                  : 'Approved farmers only with active traceability code.'
              }
            >
              <FarmerSelect approvedOnly disabled={isEdit} />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item name="cropName" label="Crop Name" rules={[required('Crop')]}>
              <Input placeholder="e.g. Wheat" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item
              name="inspectionDate"
              label="Inspection Date"
              rules={[required('Inspection date')]}
            >
              <DatePicker style={{ width: '100%', borderRadius: 8 }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item
              name="agreementId"
              label="Against Agreement"
              extra="Links fallback purchase rate at collection"
            >
              <Select
                allowClear
                disabled={!farmerId}
                loading={agreements.isFetching}
                placeholder={farmerId ? 'Optional agreement linkage' : 'Select farmer first'}
                style={{ borderRadius: 8 }}
                options={(agreements.data?.data ?? []).map((agreement: any) => ({
                  value: agreement.id,
                  label: `${agreement.cropName}${agreement.variety ? ` (${agreement.variety})` : ''} — ₹${agreement.purchaseRate}/KG`,
                }))}
              />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item
              name="plotId"
              label="Originating Field / Plot"
              extra={plotsAvailable ? 'Carried into downstream batch trace' : 'No plots mapped yet for farmer'}
            >
              <Select
                allowClear
                disabled={!farmerId || !plotsAvailable}
                loading={plots.isFetching}
                placeholder={!farmerId ? 'Select farmer first' : plotsAvailable ? 'Optional plot' : 'No plots mapped'}
                style={{ borderRadius: 8 }}
                options={(plots.data?.data ?? []).map((plot: any) => ({
                  value: plot.id,
                  label: `${plot.name} (${plot.areaAcres} ac) · ${plot.currentCrop || 'Plot'}`,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>
      </FormSectionCard>

      {/* Section 2: Quality Inspection Checklist */}
      <FormSectionCard
        icon={<ExperimentOutlined />}
        iconBg="#eff6ff"
        iconColor="#2563eb"
        title="Quality Checklist (FRD 13.2)"
        subtitle="Physical parameters, grain structure, and moisture evaluation"
      >
        <Row gutter={[14, 0]}>
          <Col xs={12} md={6}>
            <Form.Item
              name="moistureLevel"
              label="Moisture (%)"
              rules={[positiveNumber('Moisture', true)]}
            >
              <InputNumber style={{ width: '100%', borderRadius: 8 }} min={0} max={100} step={0.1} placeholder="e.g. 11.5" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              name="foreignMatter"
              label="Foreign Matter (%)"
              rules={[positiveNumber('Foreign matter', true)]}
            >
              <InputNumber style={{ width: '100%', borderRadius: 8 }} min={0} max={100} step={0.1} placeholder="e.g. 0.8" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="grainSize" label="Grain Size">
              <Input placeholder="e.g. Bold, Medium" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="grainColor" label="Grain Colour">
              <Input placeholder="e.g. Golden, Lustrous" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="smell" label="Odor / Smell">
              <Input placeholder="e.g. Natural, Normal" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={18}>
            <Form.Item name="physicalDamage" label="Physical / Insect Damage">
              <Input placeholder="e.g. None observed, minimal shriveled" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
        </Row>
      </FormSectionCard>

      {/* Section 3: Gate Decision */}
      <FormSectionCard
        icon={<CompassOutlined />}
        iconBg="#fffbeb"
        iconColor="#d97706"
        title="Gate Decision & Clearance (FRD 13.4)"
        subtitle="Authorise or hold procurement collection"
      >
        <Form.Item name="result" label="Inspection Verdict" rules={[required('Result')]}>
          <Radio.Group style={{ width: '100%' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 10 }}>
              <Radio.Button
                value="APPROVED"
                style={{
                  height: 'auto',
                  padding: '10px 14px',
                  borderRadius: 10,
                  textAlign: 'center',
                  fontWeight: 600,
                  color: result === 'APPROVED' ? '#047857' : undefined,
                }}
              >
                <CheckCircleOutlined style={{ marginRight: 6 }} /> Approved for Collection
              </Radio.Button>
              <Radio.Button
                value="HOLD_FOR_REINSPECTION"
                style={{
                  height: 'auto',
                  padding: '10px 14px',
                  borderRadius: 10,
                  textAlign: 'center',
                  fontWeight: 600,
                  color: result === 'HOLD_FOR_REINSPECTION' ? '#b45309' : undefined,
                }}
              >
                <WarningOutlined style={{ marginRight: 6 }} /> Hold for Re-inspection
              </Radio.Button>
              <Radio.Button
                value="REJECTED"
                style={{
                  height: 'auto',
                  padding: '10px 14px',
                  borderRadius: 10,
                  textAlign: 'center',
                  fontWeight: 600,
                  color: result === 'REJECTED' ? '#b91c1c' : undefined,
                }}
              >
                Rejected (Blocked)
              </Radio.Button>
            </div>
          </Radio.Group>
        </Form.Item>

        {result && result !== 'APPROVED' ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16, borderRadius: 10 }}
            message="This blocks warehouse collection"
            description="Only an APPROVED inspection permits procurement. A rejected or held harvest cannot be received until a re-inspection passes."
          />
        ) : null}

        <Form.Item
          name="remarks"
          label="Inspector Remarks & Feedback"
          rules={result === 'REJECTED' ? [{ required: true, message: 'Reason required for rejection' }] : undefined}
        >
          <Input.TextArea rows={2} placeholder="Optional for approval, mandatory when rejecting" style={{ borderRadius: 8 }} />
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
          <SafetyCertificateOutlined />
        </div>
        <div>
          <Typography.Title level={4} style={{ margin: 0, color: '#0f172a', fontWeight: 700, letterSpacing: '-0.01em' }}>
            {isEdit ? 'Edit Harvest Inspection' : 'Record Harvest Inspection'}
          </Typography.Title>
          <Typography.Text style={{ color: '#475569', fontSize: 13, display: 'block', marginTop: 2 }}>
            Pre-procurement quality gate for traceability and batch intake
          </Typography.Text>
        </div>
      </div>
    </div>
  );

  const isPending = createInspection.isPending || updateInspection.isPending;

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
              {isEdit ? 'Save Changes' : 'Submit Inspection'}
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
            {isEdit ? 'Save Changes' : 'Submit Inspection'}
          </Button>
        </div>
      }
      destroyOnClose
    >
      {formContent}
    </Modal>
  );
}
