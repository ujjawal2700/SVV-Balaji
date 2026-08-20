import {
  EnvironmentOutlined,
  ReadOutlined,
} from '@ant-design/icons';
import {
  App as AntApp,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  Modal,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { TrainingSession } from '@shared/api/types';
import { BranchSelect } from '@shared/components/pickers';
import {
  useCreateTrainingSession,
  useUpdateTrainingSession,
} from '@shared/hooks/useTraining';
import { useIsMobile } from '@shared/hooks/useIsMobile';
import { toIsoDate } from '@shared/utils/format';
import { maxLength, required } from '@shared/validation/rules';

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

interface SectionCardProps {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

function FormSectionCard({ icon, iconBg, iconColor, title, subtitle, children }: SectionCardProps) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: '16px 18px',
        marginBottom: 16,
        boxShadow: '0 1px 2px 0 rgba(15, 23, 42, 0.03)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: iconBg,
            color: iconColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div>
          <Typography.Text strong style={{ fontSize: 14, color: '#0f172a', display: 'block', lineHeight: 1.2 }}>
            {title}
          </Typography.Text>
          {subtitle && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {subtitle}
            </Typography.Text>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

export function TrainingFormModal({ open, session, onClose }: TrainingFormModalProps) {
  const isMobile = useIsMobile();
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
        message.success('Training session updated successfully');
      } else {
        await createSession.mutateAsync(payload);
        message.success('Training session scheduled — mark attendance from session details');
      }
      onClose();
    } catch (error) {
      message.error(
        apiErrorMessage(error, `Could not ${isEdit ? 'update' : 'create'} the session`),
        8,
      );
    }
  };

  const formContent = (
    <Form form={form} layout="vertical" requiredMark preserve={false} style={{ padding: isMobile ? 0 : '4px 0' }}>
      <FormSectionCard
        icon={<ReadOutlined />}
        iconBg="#eff6ff"
        iconColor="#2563eb"
        title="Session Topic & Schedule"
        subtitle="Workshop curriculum and scheduled training date"
      >
        <Form.Item name="title" label="Session Title / Topic" rules={[required('Title'), maxLength(160)]}>
          <Input placeholder="e.g. Kharif Sowing & Soil Fertility Best Practices" style={{ borderRadius: 8 }} />
        </Form.Item>

        <Form.Item name="scheduledDate" label="Scheduled Date" rules={[required('Date')]}>
          <DatePicker style={{ width: '100%', borderRadius: 8 }} format="DD MMM YYYY" />
        </Form.Item>

        <Form.Item name="branchId" label="Managing Branch" rules={[required('Branch')]}>
          <BranchSelect />
        </Form.Item>
      </FormSectionCard>

      <FormSectionCard
        icon={<EnvironmentOutlined />}
        iconBg="#ecfdf5"
        iconColor="#059669"
        title="Curriculum & Agenda Notes"
        subtitle="Brief notes on topics covered and training materials"
      >
        <Form.Item
          name="description"
          label="Topics Covered / Description"
          extra="Recorded for reporting and internal curriculum logs"
        >
          <Input.TextArea rows={3} placeholder="e.g. Organic bio-fertilizer usage, drip irrigation maintenance..." style={{ borderRadius: 8 }} />
        </Form.Item>
      </FormSectionCard>
    </Form>
  );

  const headerContent = (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 50%, #f7fee7 100%)',
        margin: '-16px -24px -16px -24px',
        padding: '18px 24px',
        borderRadius: isMobile ? 0 : '14px 14px 0 0',
        borderBottom: '1px solid #e2e8f0',
      }}
    >
      <svg
        viewBox="0 0 600 160"
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '100%',
          height: '100%',
          opacity: 0.45,
          pointerEvents: 'none',
        }}
      >
        <path d="M0,0 L600,0 L600,80 C480,140 420,20 320,110 C240,180 140,40 0,90 Z" fill="#d9f99d" />
        <path d="M0,0 L600,0 L600,40 C490,90 390,-10 280,70 C190,130 90,20 0,60 Z" fill="#a7f3d0" />
        <circle cx="50" cy="30" r="14" fill="none" stroke="#65a30d" strokeWidth="2" opacity="0.35" />
      </svg>

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#059669',
            fontSize: 20,
            boxShadow: '0 2px 8px rgba(5, 150, 105, 0.15)',
            border: '1px solid #a7f3d0',
            flexShrink: 0,
          }}
        >
          <ReadOutlined />
        </div>
        <div>
          <Typography.Title level={4} style={{ margin: 0, color: '#0f172a', fontWeight: 700, letterSpacing: '-0.01em' }}>
            {isEdit ? `Edit Training — ${session?.title}` : 'Schedule Training Session'}
          </Typography.Title>
          <Typography.Text style={{ color: '#475569', fontSize: 13, display: 'block', marginTop: 2 }}>
            Organize farmer capacity building workshops and track session attendance
          </Typography.Text>
        </div>
      </div>
    </div>
  );

  const isPending = createSession.isPending || updateSession.isPending;

  if (isMobile) {
    return (
      <Drawer
        open={open}
        onClose={onClose}
        title={headerContent}
        placement="top"
        height="100vh"
        styles={{
          body: { background: '#f8fafc', padding: '14px 14px 80px 14px' },
          header: { borderBottom: '1px solid #e2e8f0' },
        }}
        footer={
          <div style={{ display: 'flex', gap: 10 }}>
            <Button block style={{ height: 44, borderRadius: 10 }} onClick={onClose}>
              Cancel
            </Button>
            <Button
              block
              type="primary"
              loading={isPending}
              onClick={handleSubmit}
              style={{
                height: 44,
                borderRadius: 10,
                fontWeight: 600,
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                boxShadow: '0 2px 8px 0 rgba(16, 185, 129, 0.3)',
              }}
            >
              {isEdit ? 'Save Changes' : 'Schedule Session'}
            </Button>
          </div>
        }
        destroyOnClose
      >
        {formContent}
      </Drawer>
    );
  }

  return (
    <Modal
      open={open}
      title={headerContent}
      onCancel={onClose}
      width={640}
      style={{ top: 24, paddingBottom: 24 }}
      styles={{
        body: {
          background: '#f8fafc',
          padding: '16px 20px',
          maxHeight: 'calc(90vh - 130px)',
          overflowY: 'auto',
          margin: '0 -24px',
          paddingInline: 24,
        },
        header: {
          padding: '16px 24px',
          borderBottom: '1px solid #e2e8f0',
          marginBottom: 0,
        },
        footer: {
          padding: '14px 24px',
          borderTop: '1px solid #e2e8f0',
          margin: 0,
        },
      }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button style={{ height: 42, paddingInline: 20, borderRadius: 10 }} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="primary"
            loading={isPending}
            onClick={handleSubmit}
            style={{
              height: 42,
              paddingInline: 24,
              borderRadius: 10,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none',
              boxShadow: '0 2px 10px 0 rgba(16, 185, 129, 0.35)',
            }}
          >
            {isEdit ? 'Save Changes' : 'Schedule Session'}
          </Button>
        </div>
      }
      destroyOnClose
    >
      {formContent}
    </Modal>
  );
}
