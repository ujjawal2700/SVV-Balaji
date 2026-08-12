import { App as AntApp, Col, Divider, Form, Input, InputNumber, Modal, Row, Select } from 'antd';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { CreateFarmerInput } from '../../api/types';
import { useCreateFarmer } from '../../hooks/useFarmers';
import { useBranches } from '../../hooks/useBranches';
import { fieldRules, maxLength, required } from '../../validation/rules';

interface FarmerFormModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Farmer registration (FRD 7.1).
 *
 * Deliberately does NOT offer a status or farmer-code field. A new farmer
 * always enters as PENDING_VERIFICATION and the traceability code is minted on
 * approval, by the server. Exposing either here would invite someone to try to
 * set them.
 */
export function FarmerFormModal({ open, onClose }: FarmerFormModalProps) {
  const [form] = Form.useForm<CreateFarmerInput>();
  const { message } = AntApp.useApp();
  const branches = useBranches();
  const createFarmer = useCreateFarmer();

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      const farmer = await createFarmer.mutateAsync(values);
      message.success(`${farmer.fullName} registered — awaiting approval`);
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not register the farmer'));
    }
  };

  return (
    <Modal
      open={open}
      title="Register farmer"
      okText="Register"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createFarmer.isPending}
      width={760}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark preserve={false}>
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
