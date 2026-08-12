import { App as AntApp, Form, Input, Modal, Select } from 'antd';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { CreateUserInput } from '../../api/types';
import { ROLE_LABELS, USER_ROLES } from '../../auth/types';
import { useBranches } from '../../hooks/useBranches';
import { useCreateUser } from '../../hooks/useUsers';
import { fieldRules, maxLength, required } from '../../validation/rules';

interface UserFormModalProps {
  open: boolean;
  onClose: () => void;
}

export function UserFormModal({ open, onClose }: UserFormModalProps) {
  const [form] = Form.useForm<CreateUserInput>();
  const { message } = AntApp.useApp();
  const branches = useBranches();
  const createUser = useCreateUser();

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      const user = await createUser.mutateAsync(values);
      message.success(`${user.fullName} can now sign in`);
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not create the user'));
    }
  };

  return (
    <Modal
      open={open}
      title="New user"
      okText="Create user"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createUser.isPending}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark preserve={false}>
        <Form.Item name="fullName" label="Full name" rules={fieldRules.fullName}>
          <Input placeholder="Asha Reddy" />
        </Form.Item>

        <Form.Item name="email" label="Email" rules={fieldRules.email}>
          <Input placeholder="asha@svvbalaji.com" autoComplete="off" />
        </Form.Item>

        <Form.Item
          name="password"
          label="Temporary password"
          rules={fieldRules.password}
          extra="At least 6 characters. There is no password-reset flow yet — note it down and pass it on."
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>

        <Form.Item name="phone" label="Phone" rules={fieldRules.optionalMobile}>
          <Input placeholder="Optional" />
        </Form.Item>

        <Form.Item
          name="role"
          label="Role"
          rules={[required('Role')]}
          extra="Determines what this person can see and do. Changing it later needs a Super Admin."
        >
          <Select
            placeholder="Select a role"
            options={USER_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }))}
          />
        </Form.Item>

        <Form.Item
          name="branchId"
          label="Branch"
          rules={[maxLength(64)]}
          extra="Leave empty for organisation-wide access."
        >
          <Select
            allowClear
            placeholder="Optional"
            loading={branches.isLoading}
            options={(branches.data?.data ?? []).map((branch) => ({
              value: branch.id,
              label: `${branch.name} — ${branch.location}`,
            }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
