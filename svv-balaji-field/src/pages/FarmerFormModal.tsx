import {
  BankOutlined,
  CompassOutlined,
  EnvironmentOutlined,
  IdcardOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Button,
  Col,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Typography,
} from 'antd';
import { useEffect } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { Branch, CreateFarmerInput, Farmer } from '@shared/api/types';
import { useCreateFarmer, useUpdateFarmer } from '@shared/hooks/useFarmers';
import { useBranches } from '@shared/hooks/useBranches';
import { useIsMobile } from '@shared/hooks/useIsMobile';
import { fieldRules, maxLength, required } from '@shared/validation/rules';

interface FarmerFormModalProps {
  open: boolean;
  /** Present means edit; absent means register. */
  farmer?: Farmer | null;
  onClose: () => void;
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

export function FarmerFormModal({ open, farmer, onClose }: FarmerFormModalProps) {
  const isMobile = useIsMobile();
  const [form] = Form.useForm<CreateFarmerInput>();
  const { message } = AntApp.useApp();
  const branches = useBranches(true);
  const createFarmer = useCreateFarmer();
  const updateFarmer = useUpdateFarmer();

  const isEdit = Boolean(farmer);

  const initialValues = farmer
    ? {
        fullName: farmer.fullName,
        mobile: farmer.mobile,
        aadhaarNumber: farmer.aadhaarNumber ?? undefined,
        panNumber: farmer.panNumber ?? undefined,
        village: farmer.village,
        district: farmer.district,
        state: farmer.state,
        address: farmer.address ?? undefined,
        gpsLocation: farmer.gpsLocation ?? undefined,
        farmSizeAcres: farmer.farmSizeAcres === null ? undefined : Number(farmer.farmSizeAcres),
        landType: farmer.landType ?? undefined,
        irrigationType: farmer.irrigationType ?? undefined,
        cropDetails: farmer.cropDetails ?? undefined,
        bankAccountName: farmer.bankAccountName ?? undefined,
        bankName: farmer.bankName ?? undefined,
        bankAccountNo: farmer.bankAccountNo ?? undefined,
        ifscCode: farmer.ifscCode ?? undefined,
        branchId: farmer.branchId,
      }
    : undefined;

  useEffect(() => {
    if (open && !farmer) {
      form.resetFields();
    }
  }, [open, farmer, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      if (farmer) {
        const updated = await updateFarmer.mutateAsync({ id: farmer.id, input: values });
        message.success(`${updated.fullName} updated successfully`);
      } else {
        const created = await createFarmer.mutateAsync(values);
        message.success(`${created.fullName} registered — awaiting verification approval`);
      }
      onClose();
    } catch (error) {
      message.error(
        apiErrorMessage(error, `Could not ${isEdit ? 'update' : 'register'} the farmer`),
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
    >
      {isEdit && farmer?.farmerCode ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16, borderRadius: 10 }}
          message={`Traceability code ${farmer.farmerCode} is fixed`}
          description="It is printed on agreements and carried into every batch this farmer supplies. Correcting the details below does not alter the code."
        />
      ) : null}

      {/* --- Section 1: Personal & Identity Details --- */}
      <FormSectionCard
        icon={<IdcardOutlined />}
        iconBg="#eff6ff"
        iconColor="#2563eb"
        title="Identity & Personal Information"
        subtitle="Basic farmer identification for agreements & traceability"
      >
        <Row gutter={[14, 0]}>
          <Col xs={24} md={12}>
            <Form.Item name="fullName" label="Full name" rules={fieldRules.fullName}>
              <Input placeholder="e.g. Ramesh Naidu" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="mobile" label="Mobile number" rules={fieldRules.mobile}>
              <Input placeholder="10-digit mobile number" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="aadhaarNumber" label="Aadhaar number" rules={fieldRules.aadhaar}>
              <Input placeholder="12 digits (Optional)" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="panNumber" label="PAN number" rules={fieldRules.pan}>
              <Input placeholder="ABCDE1234F (Optional)" style={{ textTransform: 'uppercase', borderRadius: 8 }} />
            </Form.Item>
          </Col>
        </Row>
      </FormSectionCard>

      {/* --- Section 2: Location & Branch Mapping --- */}
      <FormSectionCard
        icon={<EnvironmentOutlined />}
        iconBg="#ecfdf5"
        iconColor="#059669"
        title="Location & Branch Assignment"
        subtitle="Geographic territory and managing SVV branch"
      >
        <Row gutter={[14, 0]}>
          <Col xs={24} md={8}>
            <Form.Item name="village" label="Village" rules={fieldRules.village}>
              <Input placeholder="e.g. Rampur" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="district" label="District" rules={fieldRules.district}>
              <Input placeholder="e.g. Nizamabad" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="state" label="State" rules={fieldRules.state}>
              <Input placeholder="e.g. Telangana" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="address" label="Street / Full Address">
              <Input.TextArea rows={2} placeholder="Optional detailed address" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="gpsLocation"
              label="Farm Coordinates (GPS)"
              rules={fieldRules.gps}
              extra="Latitude, Longitude (e.g. 17.3850, 78.4867)"
            >
              <Input placeholder="17.3850, 78.4867" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="branchId"
              label="Assigned SVV Branch"
              rules={[required('Branch')]}
              extra="Branch overseeing this farmer's procurement"
            >
              <Select
                placeholder={branches.isLoading ? 'Loading branches…' : 'Select managing branch'}
                loading={branches.isLoading}
                style={{ borderRadius: 8 }}
                options={(branches.data?.data ?? []).map((branch: Branch) => ({
                  value: branch.id,
                  label: `${branch.name} (${branch.location})`,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>
      </FormSectionCard>

      {/* --- Section 3: Farm & Agricultural Profile --- */}
      <FormSectionCard
        icon={<CompassOutlined />}
        iconBg="#fffbeb"
        iconColor="#d97706"
        title="Farm & Agricultural Profile"
        subtitle="Land dimensions, soil classification, and irrigation"
      >
        <Row gutter={[14, 0]}>
          <Col xs={24} md={8}>
            <Form.Item name="farmSizeAcres" label="Total Farm Size (Acres)" rules={fieldRules.farmSize}>
              <InputNumber style={{ width: '100%', borderRadius: 8 }} min={0} step={0.5} placeholder="e.g. 12.5" />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="landType" label="Land / Soil Type">
              <Input placeholder="e.g. Black Cotton, Red Loam" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="irrigationType" label="Irrigation Source">
              <Input placeholder="e.g. Borewell, Canal, Drip" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="cropDetails" label="Primary Crops Grown">
              <Input.TextArea rows={2} placeholder="e.g. Wheat, Bajra, Mustard, Cotton" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
        </Row>
      </FormSectionCard>

      {/* --- Section 4: Bank & Payout Details --- */}
      <FormSectionCard
        icon={<BankOutlined />}
        iconBg="#f5f3ff"
        iconColor="#7c3aed"
        title="Bank Account & Payout Details"
        subtitle="Required for direct farmer payout settlements"
      >
        <Row gutter={[14, 0]}>
          <Col xs={24} md={12}>
            <Form.Item
              name="bankAccountName"
              label="Account Holder Name"
              rules={[maxLength(120)]}
              extra="As written on bank passbook"
            >
              <Input placeholder="Optional" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="bankName" label="Bank Name">
              <Input placeholder="e.g. State Bank of India, HDFC" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="bankAccountNo" label="Account Number">
              <Input placeholder="Optional" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="ifscCode" label="IFSC Code" rules={fieldRules.ifsc}>
              <Input placeholder="e.g. SBIN0001234" style={{ textTransform: 'uppercase', borderRadius: 8 }} />
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
      {/* Dynamic Fluid Wave Graphic Artwork in soft, light tints */}
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
        <path
          d="M0,0 L600,0 L600,80 C480,140 420,20 320,110 C240,180 140,40 0,90 Z"
          fill="#d9f99d"
        />
        <path
          d="M0,0 L600,0 L600,40 C490,90 390,-10 280,70 C190,130 90,20 0,60 Z"
          fill="#a7f3d0"
        />
        <circle cx="50" cy="30" r="14" fill="none" stroke="#65a30d" strokeWidth="2" opacity="0.35" />
        <circle cx="540" cy="110" r="8" fill="#84cc16" opacity="0.3" />
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
          <UserAddOutlined />
        </div>
        <div>
          <Typography.Title level={4} style={{ margin: 0, color: '#0f172a', fontWeight: 700, letterSpacing: '-0.01em' }}>
            {isEdit ? `Edit Farmer: ${farmer?.fullName}` : 'Register New Farmer'}
          </Typography.Title>
          <Typography.Text style={{ color: '#475569', fontSize: 13, display: 'block', marginTop: 2 }}>
            {isEdit
              ? 'Update personal, agricultural and payout details'
              : 'Capture identification, location coordinates and farm details for onboarding'}
          </Typography.Text>
        </div>
      </div>
    </div>
  );

  const isPending = createFarmer.isPending || updateFarmer.isPending;

  // On Mobile: Render in a smooth sliding side/bottom drawer
  // On Mobile: Render in a smooth sliding bottom sheet with top clearance
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
              {isEdit ? 'Save Changes' : 'Complete Registration'}
            </Button>
          </div>
        }
        destroyOnClose
      >
        {formContent}
      </Drawer>
    );
  }

  // On Desktop/Tablet: Render in an elevated modal with fixed 40px top/bottom spacing
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
            {isEdit ? 'Save Changes' : 'Register Farmer'}
          </Button>
        </div>
      }
      destroyOnClose
    >
      {formContent}
    </Modal>
  );
}
