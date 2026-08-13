import { App as AntApp, Form, Input, Modal } from 'antd';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { Branch, CreateBranchInput } from '../../api/types';
import { useCreateBranch, useUpdateBranch } from '../../hooks/useBranches';
import { fieldRules, maxLength, required } from '../../validation/rules';

interface BranchFormModalProps {
  open: boolean;
  /** Present means edit; absent means create. */
  branch?: Branch | null;
  onClose: () => void;
}

/**
 * One modal for both create and edit.
 *
 * Keeping them together is deliberate: a separate edit form is how the two
 * quietly drift apart, and then a field validated on create is accepted on
 * edit. The only differences are the title, the button and whether the fields
 * start populated.
 */
export function BranchFormModal({ open, branch, onClose }: BranchFormModalProps) {
  const [form] = Form.useForm<CreateBranchInput>();
  const { message } = AntApp.useApp();
  const createBranch = useCreateBranch();
  const updateBranch = useUpdateBranch();

  const isEdit = Boolean(branch);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (branch) {
      form.setFieldsValue({
        name: branch.name,
        location: branch.location,
        address: branch.address,
        contactName: branch.contactName ?? undefined,
        contactPhone: branch.contactPhone ?? undefined,
      });
    }
  }, [open, branch, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      if (branch) {
        const updated = await updateBranch.mutateAsync({ id: branch.id, input: values });
        message.success(`${updated.name} updated`);
      } else {
        const created = await createBranch.mutateAsync(values);
        message.success(`Branch ${created.name} created`);
      }
      onClose();
    } catch (error) {
      // Show the server's own wording - it is more specific than anything
      // generic we could substitute.
      message.error(
        apiErrorMessage(error, `Could not ${isEdit ? 'update' : 'create'} the branch`),
        8,
      );
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? `Edit ${branch?.name}` : 'New branch'}
      okText={isEdit ? 'Save changes' : 'Create branch'}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createBranch.isPending || updateBranch.isPending}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark preserve={false}>
        <Form.Item name="name" label="Branch name" rules={[required('Branch name'), maxLength(120)]}>
          <Input placeholder="Head Office" />
        </Form.Item>

        <Form.Item
          name="location"
          label="Location"
          rules={[required('Location'), maxLength(120)]}
          extra="City or town, as staff would refer to it"
        >
          <Input placeholder="Hyderabad" />
        </Form.Item>

        <Form.Item name="address" label="Address" rules={[required('Address')]}>
          <Input.TextArea rows={3} placeholder="Full postal address" />
        </Form.Item>

        <Form.Item name="contactName" label="Contact person">
          <Input placeholder="Optional" />
        </Form.Item>

        <Form.Item name="contactPhone" label="Contact phone" rules={fieldRules.optionalMobile}>
          <Input placeholder="Optional" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
