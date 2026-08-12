import { App as AntApp, Form, Input, Modal } from 'antd';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { CreateBranchInput } from '../../api/types';
import { useCreateBranch } from '../../hooks/useBranches';
import { fieldRules, maxLength, required } from '../../validation/rules';

interface BranchFormModalProps {
  open: boolean;
  onClose: () => void;
}

export function BranchFormModal({ open, onClose }: BranchFormModalProps) {
  const [form] = Form.useForm<CreateBranchInput>();
  const { message } = AntApp.useApp();
  const createBranch = useCreateBranch();

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      const branch = await createBranch.mutateAsync(values);
      message.success(`Branch ${branch.name} created`);
      onClose();
    } catch (error) {
      // Show the server's own wording - it is more specific than anything
      // generic we could substitute.
      message.error(apiErrorMessage(error, 'Could not create the branch'));
    }
  };

  return (
    <Modal
      open={open}
      title="New branch"
      okText="Create branch"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createBranch.isPending}
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
