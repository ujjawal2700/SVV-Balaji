import { App as AntApp, Alert, Form, Input, Modal, Radio, Space, Typography } from 'antd';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { Farmer, FarmerVerificationAction } from '../../api/types';
import { useVerifyFarmer } from '../../hooks/useFarmers';

interface VerifyFarmerModalProps {
  farmer: Farmer | null;
  onClose: () => void;
}

interface VerifyForm {
  action: FarmerVerificationAction;
  remarks?: string;
}

/**
 * Farmer verification (FRD 7.2), Super Admin only (FRD 5.1).
 *
 * Approval is the moment the traceability code is minted and it is not
 * reversible - the code is never reissued and never withdrawn - so the outcome
 * is spelled out before the user commits, and the resulting code is shown back
 * to them afterwards.
 */
export function VerifyFarmerModal({ farmer, onClose }: VerifyFarmerModalProps) {
  const [form] = Form.useForm<VerifyForm>();
  const { message, modal } = AntApp.useApp();
  const verifyFarmer = useVerifyFarmer();
  const action = Form.useWatch('action', form);

  useEffect(() => {
    if (farmer) form.setFieldsValue({ action: 'APPROVED', remarks: undefined });
  }, [farmer, form]);

  const handleSubmit = async () => {
    if (!farmer) return;
    const values = await form.validateFields();

    try {
      const updated = await verifyFarmer.mutateAsync({ id: farmer.id, input: values });

      if (values.action === 'APPROVED' && updated.farmerCode) {
        modal.success({
          title: 'Farmer approved',
          content: (
            <Space direction="vertical" size={4}>
              <Typography.Text>
                {updated.fullName} now holds traceability code:
              </Typography.Text>
              <Typography.Text code strong style={{ fontSize: 16 }}>
                {updated.farmerCode}
              </Typography.Text>
              <Typography.Text type="secondary">
                Everything this farmer supplies traces back to this code.
              </Typography.Text>
            </Space>
          ),
        });
      } else {
        message.success('Verification recorded');
      }
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not record the verification'));
    }
  };

  return (
    <Modal
      open={Boolean(farmer)}
      title={farmer ? `Verify ${farmer.fullName}` : 'Verify farmer'}
      okText="Record decision"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={verifyFarmer.isPending}
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item name="action" label="Decision" rules={[{ required: true }]}>
          <Radio.Group>
            <Space direction="vertical">
              <Radio value="APPROVED">Approve — issues the traceability code</Radio>
              <Radio value="REJECTED">Reject — sets the farmer inactive</Radio>
              <Radio value="DOCUMENTS_REQUESTED">Request documents — status unchanged</Radio>
            </Space>
          </Radio.Group>
        </Form.Item>

        {action === 'APPROVED' ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="This issues a permanent traceability code"
            description="The SVV-YYYY-NNNNNN code is minted once and never reissued. Re-approving later will not change it."
          />
        ) : null}

        {action === 'DOCUMENTS_REQUESTED' ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="Status stays as it is"
            description="This records the request in the audit trail. Following up with the farmer happens outside the system."
          />
        ) : null}

        <Form.Item
          name="remarks"
          label="Remarks"
          extra="Written to the verification audit trail against your name."
          rules={
            action === 'REJECTED'
              ? [{ required: true, message: 'Give a reason for the rejection' }]
              : undefined
          }
        >
          <Input.TextArea rows={3} placeholder="Optional for approval, required when rejecting" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
