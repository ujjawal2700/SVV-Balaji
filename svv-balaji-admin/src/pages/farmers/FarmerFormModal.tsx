import {
  Alert,
  App as AntApp,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
} from 'antd';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { CreateFarmerInput, Farmer } from '../../api/types';
import { useCreateFarmer, useUpdateFarmer } from '../../hooks/useFarmers';
import { useBranches } from '../../hooks/useBranches';
import { fieldRules, maxLength, required } from '../../validation/rules';

interface FarmerFormModalProps {
  open: boolean;
  /** Present means edit; absent means register. */
  farmer?: Farmer | null;
  onClose: () => void;
}

/**
 * Farmer registration and correction (FRD 7.1).
 *
 * Deliberately does NOT offer a status or farmer-code field, in either mode. A
 * new farmer always enters as PENDING_VERIFICATION; the traceability code is
 * minted on approval by the server and never changes afterwards. Status moves
 * through the Verify action and the status column, both of which write the
 * verification log - editing it here would change the status without the record
 * of who changed it or why.
 */
export function FarmerFormModal({ open, farmer, onClose }: FarmerFormModalProps) {
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
        // Decimals arrive as strings from Prisma; the number input needs a
        // number, and Number(null) would silently become 0.
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
        message.success(`${updated.fullName} updated`);
      } else {
        const created = await createFarmer.mutateAsync(values);
        message.success(`${created.fullName} registered — awaiting approval`);
      }
      onClose();
    } catch (error) {
      message.error(
        apiErrorMessage(error, `Could not ${isEdit ? 'update' : 'register'} the farmer`),
        8,
      );
    }
  };

  return (
    <Modal
      open={open}
      title={
        isEdit
          ? `Edit ${farmer?.fullName}${farmer?.farmerCode ? ` — ${farmer.farmerCode}` : ''}`
          : 'Register farmer'
      }
      okText={isEdit ? 'Save changes' : 'Register'}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createFarmer.isPending || updateFarmer.isPending}
      width={760}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark preserve={false} initialValues={initialValues}>
        {isEdit && farmer?.farmerCode ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={`Traceability code ${farmer.farmerCode} is fixed`}
            description="It is printed on agreements and carried into every batch this farmer supplies. Correcting the details below does not change it."
          />
        ) : null}

        <Divider orientation="left" plain>
          Identity
        </Divider>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="fullName" label="Full name" rules={fieldRules.fullName}>
              <Input placeholder="Ramesh Naidu" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="mobile" label="Mobile" rules={fieldRules.mobile}>
              <Input placeholder="9876543210" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="aadhaarNumber" label="Aadhaar" rules={fieldRules.aadhaar}>
              <Input placeholder="Optional — 12 digits" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="panNumber" label="PAN" rules={fieldRules.pan}>
              <Input placeholder="Optional — ABCDE1234F" style={{ textTransform: 'uppercase' }} />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>
          Location
        </Divider>

        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item name="village" label="Village" rules={fieldRules.village}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="district" label="District" rules={fieldRules.district}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="state" label="State" rules={fieldRules.state}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="address" label="Address">
              <Input.TextArea rows={2} placeholder="Optional" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="gpsLocation"
              label="Farm coordinates"
              rules={fieldRules.gps}
              extra="Shown on the consumer traceability page — worth capturing."
            >
              <Input placeholder="17.3850,78.4867" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="branchId"
              label="Branch"
              rules={[required('Branch')]}
              extra="Which branch manages this relationship."
            >
              <Select
                placeholder={branches.isLoading ? 'Loading…' : 'Select a branch'}
                loading={branches.isLoading}
                options={(branches.data?.data ?? []).map((branch) => ({
                  value: branch.id,
                  label: `${branch.name} — ${branch.location}`,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>
          Farm
        </Divider>

        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item name="farmSizeAcres" label="Farm size (acres)" rules={fieldRules.farmSize}>
              <InputNumber style={{ width: '100%' }} min={0} step={0.5} placeholder="Optional" />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="landType" label="Land type">
              <Input placeholder="e.g. Black soil" />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="irrigationType" label="Irrigation">
              <Input placeholder="e.g. Borewell" />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="cropDetails" label="Crops grown">
              <Input.TextArea rows={2} placeholder="e.g. Wheat, Bajra, Jowar" />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>
          Bank details
        </Divider>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              name="bankAccountName"
              label="Account holder"
              rules={[maxLength(120)]}
              extra="Needed before this farmer can be paid for a collection."
            >
              <Input placeholder="Optional" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="bankName" label="Bank">
              <Input placeholder="Optional" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="bankAccountNo" label="Account number">
              <Input placeholder="Optional" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="ifscCode" label="IFSC" rules={fieldRules.ifsc}>
              <Input placeholder="HDFC0001234" style={{ textTransform: 'uppercase' }} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
