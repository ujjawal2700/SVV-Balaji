import { App as AntApp, Form, Modal, Typography } from 'antd';
import { apiErrorMessage } from '../../api/client';
import { WarehouseSelect } from '../../components/pickers';
import { useDeliverTransport } from '../../hooks/useTransports';
import type { SupplierTransport } from '../../../../shared/api/transports';

export function DeliverTransportModal({
  open,
  onClose,
  transport,
}: {
  open: boolean;
  onClose: () => void;
  transport: SupplierTransport | null;
}) {
  const [form] = Form.useForm<{ warehouseId: string }>();
  const { message } = AntApp.useApp();
  const deliver = useDeliverTransport();

  const handleDeliver = async (values: { warehouseId: string }) => {
    if (!transport) return;
    try {
      await deliver.mutateAsync({
        id: transport.id,
        warehouseId: values.warehouseId,
      });
      message.success('Transport marked as delivered. Raw material batch generated.');
      onClose();
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not complete delivery'));
    }
  };

  return (
    <Modal
      title="Confirm Delivery & Receive into Warehouse"
      open={open}
      onCancel={onClose}
      onOk={form.submit}
      confirmLoading={deliver.isPending}
      destroyOnClose
    >
      <div style={{ marginBottom: 16 }}>
        <Typography.Paragraph>
          You are receiving <strong>{transport?.quantity} {transport?.unit}</strong> of{' '}
          <strong>{transport?.materialName}</strong> from{' '}
          <strong>{transport?.supplier?.fullName || 'Supplier'}</strong>.
        </Typography.Paragraph>
        <Typography.Text type="secondary">
          Receiving this transport marks it as DELIVERED and automatically generates an inbound
          raw material batch with QA pending.
        </Typography.Text>
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={{ warehouseId: transport?.warehouseId || undefined }}
        onFinish={handleDeliver}
      >
        <Form.Item
          name="warehouseId"
          label="Receiving Warehouse"
          rules={[{ required: true, message: 'Please select a receiving warehouse' }]}
        >
          <WarehouseSelect placeholder="Select warehouse to deposit material" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
