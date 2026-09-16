import { App as AntApp, Alert, Form, Input, List, Modal, Progress, Radio, Space, Typography } from 'antd';
import { useEffect } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { Farmer, FarmerVerificationAction } from '@shared/api/types';
import { useFarmerReadiness, useVerifyFarmer } from '@shared/hooks/useFarmers';

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

  /**
   * What FRD 7.1 still wants before this farmer can be approved.
   *
   * Read up front so Approve can be disabled with the reasons on screen. The
   * server applies the same check, so this is a courtesy rather than the
   * control — but a courtesy worth having, because the alternative is someone
   * clicking Approve and being told no.
   */
  const readiness = useFarmerReadiness(farmer?.id);
  const blocked = action === 'APPROVED' && readiness.data?.canApprove === false;

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
      okButtonProps={{ disabled: blocked }}
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

        {blocked && readiness.data ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message={`${readiness.data.missingRequired.length} required ${
              readiness.data.missingRequired.length === 1 ? 'field is' : 'fields are'
            } still blank`}
            description={
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Progress
                  percent={readiness.data.completenessPercent}
                  size="small"
                  status="active"
                />
                <Typography.Text>
                  Approval mints the permanent traceability code and lets this farmer supply a
                  harvest and be owed money, so the record has to be complete first. Edit the
                  farmer to fill these in:
                </Typography.Text>
                <List
                  size="small"
                  dataSource={readiness.data.missingRequired}
                  renderItem={(field: any) => (
                    <List.Item style={{ padding: '4px 0', border: 'none' }}>
                      <Space direction="vertical" size={0}>
                        <Typography.Text strong>
                          {field.group} — {field.label}
                        </Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {field.reason}
                        </Typography.Text>
                      </Space>
                    </List.Item>
                  )}
                />
              </Space>
            }
          />
        ) : null}

        {action === 'APPROVED' && !blocked ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="This issues a permanent traceability code"
            description="The SVV-YYYY-NNNNNN code is minted once and never reissued. Re-approving later will not change it."
          />
        ) : null}

        {action === 'APPROVED' && readiness.data?.missingAdvisory.length ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="Optional gaps — these do not block approval"
            description={readiness.data.missingAdvisory.map((f) => f.label).join(', ')}
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
