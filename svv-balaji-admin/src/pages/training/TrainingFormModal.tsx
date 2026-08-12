import { App as AntApp, DatePicker, Form, Input, Modal } from 'antd';
import type { Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import { BranchSelect } from '../../components/pickers';
import { useCreateTrainingSession } from '../../hooks/useTraining';
import { toIsoDate } from '../../utils/format';
import { maxLength, required } from '../../validation/rules';

interface TrainingFormModalProps {
  open: boolean;
  onClose: () => void;
}

interface TrainingForm {
  title: string;
  description?: string;
  scheduledDate: Dayjs;
  branchId: string;
}

export function TrainingFormModal({ open, onClose }: TrainingFormModalProps) {
  const [form] = Form.useForm<TrainingForm>();
  const { message } = AntApp.useApp();
  const createSession = useCreateTrainingSession();

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      await createSession.mutateAsync({
        title: values.title,
        description: values.description,
        scheduledDate: toIsoDate(values.scheduledDate) as string,
        branchId: values.branchId,
      });
      message.success('Session created — mark attendance from the session view');
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not create the session'));
    }
  };

  return (
    <Modal
      open={open}
      title="New training session"
      okText="Create session"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createSession.isPending}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark preserve={false}>
        <Form.Item name="title" label="Title" rules={[required('Title'), maxLength(160)]}>
          <Input placeholder="Kharif sowing best practice" />
        </Form.Item>

        <Form.Item name="scheduledDate" label="Date" rules={[required('Date')]}>
          <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
        </Form.Item>

        <Form.Item name="branchId" label="Branch" rules={[required('Branch')]}>
          <BranchSelect />
        </Form.Item>

        <Form.Item
          name="description"
          label="What was covered"
          extra="Recorded by the executive who ran the session. Farmers do not see this — there is no farmer login."
        >
          <Input.TextArea rows={3} placeholder="Optional" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
