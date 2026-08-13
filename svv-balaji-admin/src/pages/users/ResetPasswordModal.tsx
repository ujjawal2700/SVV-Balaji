import { Alert, App as AntApp, Form, Input, Modal } from 'antd';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { StaffUser } from '../../api/types';
import { useResetUserPassword } from '../../hooks/useUsers';
import { fieldRules } from '../../validation/rules';

interface ResetPasswordModalProps {
  user: StaffUser | null;
  onClose: () => void;
}

/**
 * Administrative password reset.
 *
 * There is no self-service reset flow yet, so this is the only recovery path
 * when someone is locked out - and it is worth having, because the alternative
 * that was reached for last time was running a script against the database.
 */
export function ResetPasswordModal({ user, onClose }: ResetPasswordModalProps) {
  const [form] = Form.useForm<{ password: string; confirm: string }>();
  const { message } = AntApp.useApp();
  const reset = useResetUserPassword();

  useEffect(() => {
    if (user) form.resetFields();
  }, [user, form]);

  const handleSubmit = async () => {
    if (!user) return;
    const values = await form.validateFields();
    try {
      await reset.mutateAsync({ id: user.id, password: values.password });
      message.success(`Password reset for ${user.fullName}. Pass it on securely.`, 8);
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not reset the password'), 8);
    }
  };

  return (
    <Modal
      open={Boolean(user)}
      title={user ? `Reset password — ${user.fullName}` : 'Reset password'}
      okText="Reset password"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={reset.isPending}
      destroyOnClose
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="This signs them out everywhere"
        description="Any session this user currently holds stops working immediately. They will need the new password to get back in, so make sure you can pass it on."
      />

      <Form form={form} layout="vertical" requiredMark preserve={false}>
        <Form.Item
          name="password"
          label="New password"
          rules={fieldRules.password}
          extra="At least 6 characters."
        >
          <Input.Password autoComplete="new-password" autoFocus />
        </Form.Item>

        <Form.Item
          name="confirm"
          label="Confirm new password"
          dependencies={['password']}
          rules={[
            { required: true, message: 'Confirm the password' },
            // Typed twice on purpose: this value is dictated to someone over
            // the phone, and a typo here locks them out rather than in.
            ({ getFieldValue }) => ({
              validator: (_rule, value) =>
                !value || getFieldValue('password') === value
                  ? Promise.resolve()
                  : Promise.reject(new Error('The two passwords do not match')),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
