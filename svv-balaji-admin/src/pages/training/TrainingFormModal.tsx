import { App as AntApp, DatePicker, Form, Input } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import { Sheet } from '../../components/Sheet';
import type { TrainingSession } from '../../api/types';
import { BranchSelect } from '../../components/pickers';
import {
  useCreateTrainingSession,
  useUpdateTrainingSession,
} from '../../hooks/useTraining';
import { toIsoDate } from '../../utils/format';
import { maxLength, required } from '../../validation/rules';

interface TrainingFormModalProps {
  open: boolean;
  /** Present means edit; absent means create. */
  session?: TrainingSession | null;
  onClose: () => void;
}

interface TrainingForm {
  title: string;
  description?: string;
  scheduledDate: Dayjs;
  branchId: string;
}

export function TrainingFormModal({ open, session, onClose }: TrainingFormModalProps) {
  const [form] = Form.useForm<TrainingForm>();
  const { message } = AntApp.useApp();
  const createSession = useCreateTrainingSession();
  const updateSession = useUpdateTrainingSession();

  const isEdit = Boolean(session);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (session) {
      form.setFieldsValue({
        title: session.title,
        description: session.description ?? undefined,
        scheduledDate: dayjs(session.scheduledDate),
        branchId: session.branchId,
      });
    }
  }, [open, session, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const payload = {
      title: values.title,
      description: values.description,
      scheduledDate: toIsoDate(values.scheduledDate) as string,
      branchId: values.branchId,
    };

    try {
      if (session) {
        await updateSession.mutateAsync({ id: session.id, input: payload });
        message.success('Session updated');
      } else {
        await createSession.mutateAsync(payload);
        message.success('Session created — mark attendance from the session view');
      }
      onClose();
    } catch (error) {
      message.error(
        apiErrorMessage(error, `Could not ${isEdit ? 'update' : 'create'} the session`),
        8,
      );
    }
  };

  return (
    <Sheet
      open={open}
      title={isEdit ? `Edit — ${session?.title}` : 'New training session'}
      okText={isEdit ? 'Save changes' : 'Create session'}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createSession.isPending || updateSession.isPending}
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
          label="Session Description & Remarks"
          extra="Recorded by the executive who ran the session. Add topics covered, discussion points, or special remarks."
        >
          <Input.TextArea rows={3} placeholder="e.g. Organic bio-fertilizer usage, pest control demo, farmer questions and remarks..." />
        </Form.Item>
      </Form>
    </Sheet>
  );
}
