import { App as AntApp, Alert, Form, Input, Modal, Select } from 'antd';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { CreateUserInput, StaffUser } from '../../api/types';
import { ROLE_LABELS, USER_ROLES } from '../../auth/types';
import { useAuth } from '../../auth/useAuth';
import { useBranches } from '../../hooks/useBranches';
import { useCreateUser, useUpdateUser } from '../../hooks/useUsers';
import { fieldRules, maxLength, required } from '../../validation/rules';

interface UserFormModalProps {
  open: boolean;
  /** Present means edit; absent means create. */
  user?: StaffUser | null;
  onClose: () => void;
}

export function UserFormModal({ open, user, onClose }: UserFormModalProps) {
  const [form] = Form.useForm<CreateUserInput>();
  const { message } = AntApp.useApp();
  const { user: signedInUser } = useAuth();
  const branches = useBranches(true);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const isEdit = Boolean(user);
  const isSelf = Boolean(user && signedInUser && user.id === signedInUser.id);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (user) {
      form.setFieldsValue({
        fullName: user.fullName,
        email: user.email,
        phone: user.phone ?? undefined,
        role: user.role,
        branchId: user.branchId ?? undefined,
      });
    }
  }, [open, user, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      if (user) {
        // password is not on the edit form at all - it moves through the
        // separate reset action, which also ends the user's sessions.
        const { password, ...editable } = values;
        void password;
        const updated = await updateUser.mutateAsync({ id: user.id, input: editable });
        message.success(`${updated.fullName} updated`);
      } else {
        const created = await createUser.mutateAsync(values);
        message.success(`${created.fullName} can now sign in`);
      }
      onClose();
    } catch (error) {
      message.error(
        apiErrorMessage(error, `Could not ${isEdit ? 'update' : 'create'} the user`),
        8,
      );
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? `Edit ${user?.fullName}` : 'New user'}
      okText={isEdit ? 'Save changes' : 'Create user'}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createUser.isPending || updateUser.isPending}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark preserve={false}>
        {isSelf ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="This is your own account"
            description="You can correct your name, email and phone. Your role is locked — the server refuses a self-demotion, because it is how an administrator loses access to this screen."
          />
        ) : null}

        <Form.Item name="fullName" label="Full name" rules={fieldRules.fullName}>
          <Input placeholder="Asha Reddy" />
        </Form.Item>

        <Form.Item
          name="email"
          label="Email"
          rules={fieldRules.email}
          extra={isEdit ? 'This is the address they sign in with.' : undefined}
        >
          <Input placeholder="asha@svvbalaji.com" autoComplete="off" />
        </Form.Item>

        {!isEdit ? (
          <Form.Item
            name="password"
            label="Temporary password"
            rules={fieldRules.password}
            extra="At least 6 characters. Note it down and pass it on — you can reset it later from the row menu."
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        ) : null}

        <Form.Item name="phone" label="Phone" rules={fieldRules.optionalMobile}>
          <Input placeholder="Optional" />
        </Form.Item>

        <Form.Item
          name="role"
          label="Role"
          rules={[required('Role')]}
          extra={
            isSelf
              ? 'Locked on your own account.'
              : 'Determines what this person can see and do.'
          }
        >
          <Select
            disabled={isSelf}
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
