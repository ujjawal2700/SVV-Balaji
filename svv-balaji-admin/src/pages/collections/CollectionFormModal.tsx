import {
  Alert,
  App as AntApp,
  Col,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useEffect, useMemo } from 'react';
import { apiErrorMessage } from '../../api/client';
import { BranchSelect, WarehouseSelect } from '../../components/pickers';
import { useCreateCollection, useUpdateCollection } from '../../hooks/useCollections';
import { useHarvestInspections } from '../../hooks/useProcurement';
import { formatDate, toIsoDate } from '../../utils/format';
import { notGreaterThan, positiveNumber, required } from '../../validation/rules';
import type { RawMaterialCollection } from '../../api/types';

interface CollectionFormModalProps {
  open: boolean;
  collection?: RawMaterialCollection | null;
  onClose: () => void;
}

interface CollectionForm {
  inspectionId: string;
  branchId: string;
  collectionDate: Dayjs;
  collectionLocation?: string;
  grossWeight: number;
  netWeight: number;
  unit?: string;
  purchaseRate?: number;
  warehouseId?: string;
}

const UNITS = ['KG', 'QUINTAL', 'TONNE'];

/**
 * Raw material collection (FRD Section 14) — the point at which the chain
 * extends Farmer → Collection → Batch.
 *
 * The harvest picker only offers inspections that are APPROVED and not already
 * collected, because those are the only ones the server will accept. Rather
 * than let someone pick a spent or rejected harvest and meet a 400, the list
 * simply does not contain them.
 */
export function CollectionFormModal({ open, collection, onClose }: CollectionFormModalProps) {
  const [form] = Form.useForm<CollectionForm>();
  const { message } = AntApp.useApp();
  const createCollection = useCreateCollection();
  const updateCollection = useUpdateCollection();

  const isEdit = Boolean(collection);

  const initialValues = collection ? {
    inspectionId: collection.inspectionId,
    branchId: collection.branchId,
    collectionDate: dayjs(collection.collectionDate),
    collectionLocation: collection.collectionLocation ?? undefined,
    grossWeight: Number(collection.grossWeight),
    netWeight: Number(collection.netWeight),
    unit: collection.unit,
    purchaseRate: Number(collection.purchaseRate),
  } : { unit: 'KG' };

  const inspections = useHarvestInspections({ result: 'APPROVED' });
  const inspectionId = Form.useWatch('inspectionId', form);

  const eligible = useMemo(
    () => (inspections.data?.data ?? []).filter((row) => !row.collection),
    [inspections.data],
  );

  const selected = eligible.find((row) => row.id === inspectionId);
  const agreedRate = selected?.agreement?.purchaseRate;

  useEffect(() => {
    if (open && !collection) form.resetFields();
  }, [open, collection, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      const payload = {
        inspectionId: values.inspectionId,
        branchId: values.branchId,
        collectionDate: toIsoDate(values.collectionDate) as string,
        collectionLocation: values.collectionLocation,
        grossWeight: values.grossWeight,
        netWeight: values.netWeight,
        unit: values.unit,
        purchaseRate: values.purchaseRate,
        warehouseId: values.warehouseId,
      };

      if (isEdit && collection) {
        await updateCollection.mutateAsync({ id: collection.id, input: payload });
        message.success('Collection updated');
      } else {
        const result = await createCollection.mutateAsync(payload);
        message.success(
          `Collected. Receipt ${result.receiptNumber}, batch ${result.batch?.batchNumber ?? '—'}`,
          6,
        );
      }
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, `Could not ${isEdit ? 'update' : 'record'} the collection`));
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit collection' : 'Record collection'}
      okText={isEdit ? 'Save changes' : 'Collect & mint batch'}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createCollection.isPending || updateCollection.isPending}
      width={720}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark
        preserve={false}
        initialValues={initialValues}
      >
        <Form.Item
          name="inspectionId"
          label="Approved harvest"
          rules={[required('Harvest')]}
          extra={isEdit ? 'Cannot change harvest after collection.' : 'Only approved, not-yet-collected harvests appear here.'}
        >
          <Select
            disabled={isEdit}
            showSearch
            optionFilterProp="label"
            loading={inspections.isLoading}
            placeholder={eligible.length === 0 ? 'Nothing awaiting collection' : 'Select a harvest'}
            notFoundContent={
              inspections.isLoading
                ? undefined
                : 'No approved harvests awaiting collection — record an inspection first'
            }
            options={eligible.map((row) => ({
              value: row.id,
              label: `${row.farmer?.fullName ?? 'Unknown'} — ${row.cropName} · inspected ${formatDate(row.inspectionDate)}`,
            }))}
          />
        </Form.Item>

        {selected ? (
          <Descriptions size="small" bordered column={2} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Farmer">{selected.farmer?.fullName}</Descriptions.Item>
            <Descriptions.Item label="Code">
              <Typography.Text code>{selected.farmer?.farmerCode}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="Crop">{selected.cropName}</Descriptions.Item>
            <Descriptions.Item label="Agreed rate">
              {agreedRate ? `₹${agreedRate}/KG` : 'No agreement linked'}
            </Descriptions.Item>
          </Descriptions>
        ) : null}

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="branchId" label="Branch" rules={[required('Branch')]}>
              <BranchSelect />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="collectionDate"
              label="Collection date"
              rules={[required('Collection date')]}
              extra="Sets the batch number's date part (RM-YYYYMMDD-NNN)."
            >
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>

          <Col xs={12} md={8}>
            <Form.Item
              name="grossWeight"
              label="Gross weight"
              rules={[required('Gross weight'), positiveNumber('Gross weight')]}
            >
              <InputNumber style={{ width: '100%' }} min={0} step={10} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item
              name="netWeight"
              label="Net weight"
              dependencies={['grossWeight']}
              rules={[
                required('Net weight'),
                positiveNumber('Net weight'),
                // Mirrors the server check in collection.service.ts.
                notGreaterThan('grossWeight', 'the gross weight'),
              ]}
              extra="This becomes the batch quantity."
            >
              <InputNumber style={{ width: '100%' }} min={0} step={10} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="unit" label="Unit">
              <Select options={UNITS.map((unit) => ({ value: unit, label: unit }))} />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item
              name="purchaseRate"
              label="Purchase rate (₹ per unit)"
              rules={[positiveNumber('Purchase rate')]}
              extra={
                agreedRate
                  ? `Leave empty to use the agreed rate of ₹${agreedRate}.`
                  : 'No agreement is linked to this harvest, so a rate is required.'
              }
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                step={1}
                placeholder={agreedRate ? `Defaults to ${agreedRate}` : 'Required'}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="collectionLocation" label="Collected at">
              <Input placeholder="Optional — village collection point" />
            </Form.Item>
          </Col>

          {!isEdit && (
            <Col xs={24}>
              <Form.Item
                name="warehouseId"
                label="Store into warehouse"
                extra="Optional. If set, the batch is booked into stock and a ledger row written in the same transaction — otherwise the batch is created as COLLECTED and stocked in later."
              >
                <WarehouseSelect allowClear placeholder="Optional" />
              </Form.Item>
            </Col>
          )}
        </Row>

        {!agreedRate && selected ? (
          <Alert
            type="info"
            showIcon
            message="No agreement linked"
            description="Without one there is no rate to fall back on, so the purchase rate must be entered here."
          />
        ) : null}
      </Form>
    </Modal>
  );
}
