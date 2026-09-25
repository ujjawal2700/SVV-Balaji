import { App as AntApp, Col, DatePicker, Form, Input, InputNumber, Row, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import { Sheet } from '../../components/Sheet';
import type { SeedDistribution, SeedSource } from '../../api/types';
import { FarmerSelect } from '../../components/pickers';
import { SeedSourceField, initialSeedSource, useIssuableLots, withinLotRule } from '@shared/components/SeedLotField';
import {
  useCreateSeedDistribution,
  useUpdateSeedDistribution,
} from '../../hooks/useSeedDistribution';
import { useFarmer } from '../../hooks/useFarmers';
import { toIsoDate } from '../../utils/format';
import { positiveNumber, required } from '../../validation/rules';

interface SeedDistributionFormModalProps {
  open: boolean;
  /** Present means edit; absent means create. */
  record?: SeedDistribution | null;
  onClose: () => void;
}

interface SeedForm {
  farmerId: string;
  seedName: string;
  seedVariety?: string;
  quantity: number;
  unit?: string;
  batchNumber?: string;
  distributionDate: Dayjs;
  /** Company stock (lot required, deducted) or external (nothing deducted). */
  seedSource?: SeedSource;
  /** FRD 10.2 - the stock lot this is issued from (company stock only). */
  seedStockId?: string;
}

const UNITS = ['KG', 'GRAM', 'QUINTAL', 'PACKET', 'LITRE'];

/**
 * Certified seed and input distribution (FRD Section 10).
 *
 * Recorded by the Agriculture Expert after handing stock over at the farm. The
 * distributing user is taken from the token server-side, so there is no "issued
 * by" field here — it is always whoever is signed in.
 */
export function SeedDistributionFormModal({
  open,
  record,
  onClose,
}: SeedDistributionFormModalProps) {
  const [form] = Form.useForm<SeedForm>();
  const { message } = AntApp.useApp();
  const createDistribution = useCreateSeedDistribution();
  const updateDistribution = useUpdateSeedDistribution();

  const isEdit = Boolean(record);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (record) {
      form.setFieldsValue({
        farmerId: record.farmerId,
        seedName: record.seedName,
        seedVariety: record.seedVariety ?? undefined,
        quantity: Number(record.quantity),
        unit: record.unit,
        batchNumber: record.batchNumber ?? undefined,
        distributionDate: dayjs(record.distributionDate),
        seedSource: initialSeedSource(record),
        seedStockId: record.seedStockId ?? undefined,
      });
    }
  }, [open, record, form]);

  const selectedFarmerId = Form.useWatch('farmerId', form);
  const { data: farmer } = useFarmer(selectedFarmerId);

  // FRD 10.2 - lots at the farmer's branch this handout can be issued from.
  const editing = record
    ? { seedStockId: record.seedStockId, seedSource: record.seedSource, quantity: Number(record.quantity) }
    : null;
  const { lots, loading: lotsLoading } = useIssuableLots(farmer?.branchId, editing);
  // Company stock with a lot chosen: the particulars come from the lot.
  const seedSource = Form.useWatch('seedSource', form) as SeedSource | undefined;
  // Both watches run on every render - a hook behind `&&` would change the hook order.
  const seedStockId = Form.useWatch('seedStockId', form) as string | undefined;
  const lotSelected = seedSource === 'COMPANY_STOCK' && Boolean(seedStockId);

  useEffect(() => {
    if (isEdit || !farmer) return;

    // Issued from a lot: the particulars come from the lot, not from history.
    if (form.getFieldValue('seedStockId')) return;
    const seedNameTouched = form.isFieldTouched('seedName');
    const currentSeedName = form.getFieldValue('seedName');

    if (!seedNameTouched || !currentSeedName) {
      const pastSeedDists = farmer.seedDistributions;
      const pastAgreements = farmer.agreements;

      if (pastSeedDists && pastSeedDists.length > 0) {
        const latest = pastSeedDists[0];
        form.setFieldsValue({
          seedName: latest.seedName,
          seedVariety: latest.seedVariety ?? undefined,
        });
      } else if (pastAgreements && pastAgreements.length > 0) {
        const latestAgreement = pastAgreements[0];
        form.setFieldsValue({
          seedName: latestAgreement.cropName,
          seedVariety: latestAgreement.variety ?? undefined,
        });
      } else if (farmer.cropDetails) {
        const crops = farmer.cropDetails.split(',').map((c: string) => c.trim()).filter(Boolean);
        if (crops.length > 0) {
          form.setFieldsValue({
            seedName: crops[0],
            seedVariety: undefined,
          });
        }
      }
    }
  }, [farmer, form, isEdit]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const payload = {
      farmerId: values.farmerId,
      seedName: values.seedName,
      seedVariety: values.seedVariety,
      quantity: values.quantity,
      unit: values.unit,
      batchNumber: values.batchNumber,
      distributionDate: toIsoDate(values.distributionDate) as string,
      seedSource: values.seedSource,
      // Only company stock names a lot; the server refuses a lot on an external handout.
      seedStockId: values.seedSource === 'COMPANY_STOCK' ? values.seedStockId : undefined,
    };

    try {
      if (record) {
        await updateDistribution.mutateAsync({ id: record.id, input: payload });
        message.success('Distribution updated');
      } else {
        await createDistribution.mutateAsync(payload);
        message.success('Distribution logged');
      }
      onClose();
    } catch (error) {
      message.error(
        apiErrorMessage(error, `Could not ${isEdit ? 'update' : 'log'} the distribution`),
        8,
      );
    }
  };

  return (
    <Sheet
      open={open}
      title={isEdit ? `Edit — ${record?.seedName}` : 'Log seed distribution'}
      okText={isEdit ? 'Save changes' : 'Log distribution'}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createDistribution.isPending || updateDistribution.isPending}
      width={620}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark
        preserve={false}
        initialValues={{ unit: 'KG' }}
      >
        <Form.Item name="farmerId" label="Farmer" rules={[required('Farmer')]}>
          <FarmerSelect />
        </Form.Item>

        <SeedSourceField branchId={farmer?.branchId} lots={lots} loading={lotsLoading} editing={editing} />

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="seedName" label="Seed or input" rules={[required('Seed or input')]}>
              <Input disabled={lotSelected} placeholder="Wheat seed" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="seedVariety" label="Variety">
              <Input disabled={lotSelected} placeholder="Optional" />
            </Form.Item>
          </Col>

          <Col xs={16} md={8}>
            <Form.Item
              name="quantity"
              label="Quantity"
              rules={[required('Quantity'), positiveNumber('Quantity'), withinLotRule(lots, editing)]}
            >
              <InputNumber style={{ width: '100%' }} min={0} step={1} />
            </Form.Item>
          </Col>
          <Col xs={8} md={4}>
            <Form.Item name="unit" label="Unit">
              <Select disabled={lotSelected} options={UNITS.map((unit) => ({ value: unit, label: unit }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="distributionDate"
              label="Date issued"
              rules={[required('Date issued')]}
            >
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>

          <Col xs={24}>
            <Form.Item
              name="batchNumber"
              label="Supplier Batch Number / Lot Remarks"
              extra="Printed on seed packaging or special notes (e.g. LOT-2026-WHT-0482 · Certified Grade-A seed). Helps trace distribution batches."
            >
              <Input disabled={lotSelected} placeholder="e.g. LOT-2026-WHT-0482 · Certified Grade-A seed" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Sheet>
  );
}
