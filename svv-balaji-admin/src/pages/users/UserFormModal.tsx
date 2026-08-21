import { App as AntApp, Alert, Form, Input, Modal, Select } from 'antd';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { CreateUserInput, StaffUser } from '../../api/types';
import { ROLE_LABELS, USER_ROLES } from '../../auth/types';
import { useAuth } from '../../auth/useAuth';
import { BranchSelect } from '../../components/pickers';
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
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const isEdit = Boolean(user);
  const isSelf = Boolean(user && signedInUser && user.id === signedInUser.id);

  // Watched rather than read once: picking a role changes whether a branch is
  // required, and the rule has to move with the selection, not with the modal.
  const selectedRole = Form.useWatch('role', form) ?? user?.role;
  const isSuperAdmin = selectedRole === 'SUPER_ADMIN';

  const initialValues = user
    ? {
        fullName: user.fullName,
        email: user.email,
        phone: user.phone ?? undefined,
        role: user.role,
        branchId: user.branchId ?? undefined,
      }
    : undefined;

  useEffect(() => {
    if (!open) return;
    if (user) {
      form.setFieldsValue({
        fullName: user.fullName,
        email: user.email,
        phone: user.phone ?? undefined,
        role: user.role,
        branchId: user.branchId ?? undefined,
      });
    } else {
      form.resetFields();
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
      <Form
        key={user ? user.id : 'new-user'}
        form={form}
        layout="vertical"
        requiredMark
        preserve={false}
        initialValues={initialValues}
      >
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
          /**
           * Required for every role except Super Admin.
           *
           * This used to read "leave empty for organisation-wide access", which
           * was true until list endpoints started scoping by branch on 20 Aug.
           * A blank branch now means the opposite: the account can sign in and
           * is then refused by every screen. Making it required here is what
           * stops an administrator creating that account by following the
           * form's own advice.
           */
          rules={[
            maxLength(64),
            {
              required: !isSuperAdmin,
              message: 'Pick a branch — only a Super Admin can be organisation-wide',
            },
          ]}
          extra={
            isSuperAdmin
              ? 'Super Admins are organisation-wide, so this is optional for them.'
              : 'Records are scoped to this branch. Leaving it blank does not grant wider access — it leaves the account locked out of every screen.'
          }
        >
          <BranchSelect
            allowClear
            placeholder={isSuperAdmin ? 'Optional' : 'Select a branch'}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
