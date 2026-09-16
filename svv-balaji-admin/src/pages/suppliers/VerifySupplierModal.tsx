import { App as AntApp, Form, Input, Modal, Select } from 'antd';
import { apiErrorMessage } from '../../api/client';
import type { Supplier, VerifySupplierDto } from '../../../../shared/api/suppliers';
import { useVerifySupplier } from '../../hooks/useSuppliers';

export function VerifySupplierModal({
  supplier,
  open,
  onClose,
}: {
  supplier: Supplier;
  open: boolean;
  onClose: () => void;
}) {
  const [form] = Form.useForm<VerifySupplierDto>();
  const { message } = AntApp.useApp();
  const verify = useVerifySupplier();

  const handleSubmit = async (values: VerifySupplierDto) => {
    try {
      await verify.mutateAsync({ id: supplier.id, data: values });
      message.success('Supplier verification logged');
      onClose();
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not verify'));
    }
  };

  return (
    <Modal
      title="Verify Supplier"
      open={open}
      onCancel={onClose}
      onOk={form.submit}
      confirmLoading={verify.isPending}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ action: 'APPROVED' }}
      >
        <Form.Item name="action" label="Action" rules={[{ required: true }]}>
          <Select
            options={[
              { label: 'Approve', value: 'APPROVED' },
              { label: 'Reject & Blacklist', value: 'REJECTED' },
            ]}
          />
        </Form.Item>
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
