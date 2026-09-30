import { CompassOutlined } from '@ant-design/icons';
import { App as AntApp, Alert, Button, Form, Input, InputNumber, Modal, Radio, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { CreateWarehouseInput, Warehouse } from '../../api/types';
import { BranchSelect } from '../../components/pickers';
import { useCreateWarehouse, useUpdateWarehouse } from '../../hooks/useWarehouses';
import { maxLength, positiveNumber, required } from '../../validation/rules';

const { Text } = Typography;

const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  indore: { lat: 22.7196, lng: 75.8577 },
  hyderabad: { lat: 17.385, lng: 78.4867 },
  patna: { lat: 25.5941, lng: 85.1376 },
  bhopal: { lat: 23.2599, lng: 77.4126 },
  jaipur: { lat: 26.9124, lng: 75.7873 },
  varanasi: { lat: 25.3176, lng: 82.9739 },
  ranchi: { lat: 23.3441, lng: 85.3096 },
  delhi: { lat: 28.6139, lng: 77.209 },
  mumbai: { lat: 19.076, lng: 72.8777 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  bengaluru: { lat: 12.9716, lng: 77.5946 },
  kolkata: { lat: 22.5726, lng: 88.3639 },
  chennai: { lat: 13.0827, lng: 80.2707 },
  ahmedabad: { lat: 23.0225, lng: 72.5714 },
  pune: { lat: 18.5204, lng: 73.8567 },
  lucknow: { lat: 26.8467, lng: 80.9462 },
  kanpur: { lat: 26.4499, lng: 80.3319 },
  nagpur: { lat: 21.1458, lng: 79.0882 },
};

async function geocodeLocationText(text: string): Promise<{ lat: number; lng: number } | null> {
  const query = text.trim().toLowerCase();
  if (!query) return null;

  for (const [key, coords] of Object.entries(CITY_COORDINATES)) {
    if (query.includes(key)) {
      return coords;
    }
  }

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text + ', India')}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return {
        lat: parseFloat(parseFloat(data[0].lat).toFixed(6)),
        lng: parseFloat(parseFloat(data[0].lon).toFixed(6)),
      };
    }
  } catch (err) {
    console.warn('Geocoding error:', err);
  }

  return null;
}

interface WarehouseFormModalProps {
  open: boolean;
  /** Present means edit; absent means create. */
  warehouse?: Warehouse | null;
  onClose: () => void;
}

export function WarehouseFormModal({ open, warehouse, onClose }: WarehouseFormModalProps) {
  const [form] = Form.useForm<CreateWarehouseInput>();
  const { message } = AntApp.useApp();
  const createWarehouse = useCreateWarehouse();
  const updateWarehouse = useUpdateWarehouse();
  const [geocoding, setGeocoding] = useState(false);

  const isEdit = Boolean(warehouse);

  const initialValues = useMemo<Partial<CreateWarehouseInput>>(() => {
    if (!warehouse) return { kind: 'CENTRAL' };
    return {
      name: warehouse.name,
      location: warehouse.location,
      branchId: warehouse.branchId,
      capacity: warehouse.capacity === null || warehouse.capacity === undefined ? undefined : Number(warehouse.capacity),
      kind: warehouse.kind ?? 'CENTRAL',
      city: warehouse.city ?? undefined,
      state: warehouse.state ?? undefined,
      pincode: warehouse.pincode ?? undefined,
      latitude: warehouse.latitude !== null && warehouse.latitude !== undefined ? Number(warehouse.latitude) : undefined,
      longitude: warehouse.longitude !== null && warehouse.longitude !== undefined ? Number(warehouse.longitude) : undefined,
      serviceRadiusKm: warehouse.serviceRadiusKm !== null && warehouse.serviceRadiusKm !== undefined ? Number(warehouse.serviceRadiusKm) : undefined,
      contactPhone: warehouse.contactPhone ?? undefined,
    };
  }, [warehouse]);

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue(initialValues);
    }
  }, [open, initialValues, form]);

  const handleAutoDetectCoords = async (manual = true) => {
    const loc = form.getFieldValue('location') || '';
    const city = form.getFieldValue('city') || '';
    const name = form.getFieldValue('name') || '';
    const searchText = [loc, city, name].filter(Boolean).join(', ');

    if (!searchText) {
      if (manual) message.warning('Please enter Location or City first.');
      return;
    }

    setGeocoding(true);
    const coords = await geocodeLocationText(searchText);
    setGeocoding(false);

    if (coords) {
      form.setFieldsValue({
        latitude: coords.lat,
        longitude: coords.lng,
      });
      if (manual) {
        message.success(`GPS coordinates auto-filled for "${searchText}": ${coords.lat}, ${coords.lng}`);
      }
    } else if (manual) {
      message.error(`Could not auto-detect coordinates for "${searchText}". Please enter manually.`);
    }
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      if (warehouse) {
        const updated = await updateWarehouse.mutateAsync({ id: warehouse.id, input: values });
        message.success(`${updated.name} updated`);
      } else {
        const created = await createWarehouse.mutateAsync(values);
        message.success(`${created.name} created`);
      }
      onClose();
    } catch (error) {
      message.error(
        apiErrorMessage(error, `Could not ${isEdit ? 'update' : 'create'} the warehouse`),
        8,
      );
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? `Edit ${warehouse?.name}` : 'New warehouse'}
      okText={isEdit ? 'Save changes' : 'Create warehouse'}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createWarehouse.isPending || updateWarehouse.isPending}
      destroyOnClose
    >
      <Form key={warehouse?.id || 'new'} form={form} layout="vertical" requiredMark initialValues={initialValues}>
        <Form.Item name="name" label="Name" rules={[required('Name'), maxLength(120)]}>
          <Input placeholder="Main Store" />
        </Form.Item>

        <Form.Item name="location" label="Location" rules={[required('Location'), maxLength(120)]}>
          <Input
            placeholder="e.g. Hyderabad"
            onBlur={() => {
              if (!form.getFieldValue('latitude')) {
                void handleAutoDetectCoords(false);
              }
            }}
          />
        </Form.Item>

        <Form.Item name="branchId" label="Branch" rules={[required('Branch')]}>
          <BranchSelect />
        </Form.Item>

        <Form.Item
          name="capacity"
          label="Capacity"
          rules={[positiveNumber('Capacity')]}
          extra="Optional, and unit-less — the occupancy view compares it against stock held. Only meaningful if this warehouse stores in a single unit."
        >
          <InputNumber style={{ width: '100%' }} min={0} step={1000} placeholder="Optional" />
        </Form.Item>

        <Form.Item name="kind" label="Fulfilment role" extra="Central ships nationally by courier. An outlet is a franchise store that delivers locally with its own riders.">
          <Radio.Group optionType="button" buttonStyle="solid" options={[{ value: 'CENTRAL', label: 'Central warehouse' }, { value: 'OUTLET', label: 'Franchise outlet' }]} />
        </Form.Item>
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Map coordinates (Latitude & Longitude) are required to select this warehouse as a Serving Outlet for Quick Delivery Zones." />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <Text strong style={{ fontSize: 13 }}>Map GPS Coordinates</Text>
          <Button
            type="link"
            size="small"
            icon={<CompassOutlined />}
            loading={geocoding}
            onClick={() => void handleAutoDetectCoords(true)}
            style={{ padding: 0, height: 'auto' }}
          >
            ⚡ Auto-Detect GPS Coordinates
          </Button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="latitude" label="Map Latitude (GPS)">
            <InputNumber style={{ width: '100%' }} min={-90} max={90} step={0.0001} placeholder="e.g. 22.7196" />
          </Form.Item>
          <Form.Item name="longitude" label="Map Longitude (GPS)">
            <InputNumber style={{ width: '100%' }} min={-180} max={180} step={0.0001} placeholder="e.g. 75.8577" />
          </Form.Item>
        </div>

        <Form.Item noStyle shouldUpdate={(a, b) => a.kind !== b.kind}>
          {({ getFieldValue }) =>
            getFieldValue('kind') === 'OUTLET' ? (
              <>
                <Form.Item name="serviceRadiusKm" label="Delivery radius (km)" extra="Empty = the program default from Checkout & Delivery settings."><InputNumber style={{ width: '100%' }} min={0.5} max={100} step={0.5} /></Form.Item>
                <Form.Item name="contactPhone" label="Store phone"><Input /></Form.Item>
              </>
            ) : null
          }
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Form.Item
            name="city"
            label="City"
          >
            <Input
              placeholder="e.g. Indore"
              onBlur={() => {
                if (!form.getFieldValue('latitude')) {
                  void handleAutoDetectCoords(false);
                }
              }}
            />
          </Form.Item>
          <Form.Item name="state" label="State"><Input placeholder="e.g. MP" /></Form.Item>
          <Form.Item name="pincode" label="Pincode"><Input maxLength={6} placeholder="452001" /></Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
