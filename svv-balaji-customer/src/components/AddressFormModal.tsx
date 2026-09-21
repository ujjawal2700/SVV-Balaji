import { AimOutlined } from '@ant-design/icons';
import { Button, Form, Input, Modal, Switch, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { checkoutApi, checkoutError, type Address, type AddressInput } from '../api/checkout';

/**
 * Add / edit a delivery address. The pin ("use my current location") matters:
 * it is what lets the server decide whether a nearby store can deliver locally.
 * Without one the order is shipped by courier from the central warehouse.
 */
export function AddressFormModal({
  open,
  address,
  onClose,
  onSaved,
}: {
  open: boolean;
  address?: Address | null;
  onClose: () => void;
  onSaved: (saved: Address) => void;
}) {
  const [form] = Form.useForm<AddressInput>();
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (address) {
      form.setFieldsValue({
        label: address.label, fullName: address.fullName, phone: address.phone, line1: address.line1,
        line2: address.line2 ?? undefined, landmark: address.landmark ?? undefined, city: address.city,
        state: address.state, pincode: address.pincode, isDefault: address.isDefault,
      });
      setCoords(address.latitude && address.longitude ? { latitude: Number(address.latitude), longitude: Number(address.longitude) } : null);
    } else {
      form.setFieldsValue({ label: 'Home' });
      setCoords(null);
    }
  }, [open, address, form]);

  const locate = () => {
    if (!navigator.geolocation) {
      message.warning('Your browser cannot share its location');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ latitude: +pos.coords.latitude.toFixed(6), longitude: +pos.coords.longitude.toFixed(6) });
        setLocating(false);
      },
      () => {
        message.warning('Could not get your location. You can still save the address; it will ship by courier.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const input: AddressInput = { ...values, ...(coords ?? {}) };
      const saved = address ? await checkoutApi.updateAddress(address.id, input) : await checkoutApi.createAddress(input);
      onSaved(saved);
      onClose();
    } catch (error) {
      message.error(checkoutError(error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title={address ? 'Edit address' : 'Add delivery address'} onCancel={onClose} onOk={() => void save()} okText="Save address" confirmLoading={saving} destroyOnClose>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="label" label="Save as"><Input placeholder="Home / Office" maxLength={30} /></Form.Item>
        <Form.Item name="fullName" label="Full name" rules={[{ required: true, min: 2, message: 'Enter the name' }]}><Input /></Form.Item>
        <Form.Item name="phone" label="Mobile number" rules={[{ required: true, pattern: /^[6-9]\d{9}$/, message: 'Enter a valid 10-digit mobile number' }]}><Input maxLength={10} inputMode="numeric" /></Form.Item>
        <Form.Item name="line1" label="Flat / house / street" rules={[{ required: true, min: 3, message: 'Enter the address' }]}><Input /></Form.Item>
        <Form.Item name="line2" label="Area / locality"><Input /></Form.Item>
        <Form.Item name="landmark" label="Landmark (optional)"><Input /></Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="city" label="City" rules={[{ required: true, message: 'Enter the city' }]}><Input /></Form.Item>
          <Form.Item name="pincode" label="Pincode" rules={[{ required: true, pattern: /^[1-9]\d{5}$/, message: '6-digit pincode' }]}><Input maxLength={6} inputMode="numeric" /></Form.Item>
        </div>
        <Form.Item name="state" label="State" rules={[{ required: true, message: 'Enter the state' }]}><Input /></Form.Item>

        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <Typography.Text strong style={{ display: 'block' }}>Pin your location for faster delivery</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', margin: '4px 0 8px' }}>
            If a store near you can deliver, we route your order there automatically. Without a pin it ships by courier.
          </Typography.Text>
          <Button icon={<AimOutlined />} loading={locating} onClick={locate}>
            {coords ? 'Location pinned ✓ (update)' : 'Use my current location'}
          </Button>
        </div>
        <Form.Item name="isDefault" label="Make this my default address" valuePropName="checked"><Switch /></Form.Item>
      </Form>
    </Modal>
  );
}
