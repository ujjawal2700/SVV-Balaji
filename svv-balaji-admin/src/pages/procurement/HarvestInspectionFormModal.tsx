import {
  Alert,
  App as AntApp,
  Col,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Select,
  Space,
} from 'antd';
import type { Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { CreateHarvestInspectionInput, HarvestInspection } from '../../api/types';
import { FarmerSelect } from '../../components/pickers';
import { useAgreements } from '../../hooks/useAgreements';
import { useCreateHarvestInspection, useUpdateHarvestInspection } from '../../hooks/useProcurement';
import { toIsoDate } from '../../utils/format';
import { positiveNumber, required } from '../../validation/rules';
import dayjs from 'dayjs';

interface HarvestInspectionFormModalProps {
  open: boolean;
  inspection?: HarvestInspection | null;
  onClose: () => void;
}

interface InspectionForm extends Omit<CreateHarvestInspectionInput, 'inspectionDate'> {
  inspectionDate: Dayjs;
}

/**
 * Pre-harvest quality inspection (FRD 13.2 - 13.5).
 *
 * Two gates are visible in this form because the server enforces them:
 *
 *   - the farmer picker is restricted to APPROVED farmers. An unapproved farmer
 *     has no traceability code, so nothing collected from them could be traced
 *     downstream, and the API refuses the inspection outright.
 *   - the result decides whether this harvest can ever be collected. Only
 *     APPROVED passes the gate in collection.service.ts, so the choice is
 *     spelled out rather than left as a neutral dropdown.
 */
export function HarvestInspectionFormModal({ open, inspection, onClose }: HarvestInspectionFormModalProps) {
  const [form] = Form.useForm<InspectionForm>();
  const { message } = AntApp.useApp();
  const createInspection = useCreateHarvestInspection();
  const updateInspection = useUpdateHarvestInspection();

  const isEdit = Boolean(inspection);

  const initialValues = inspection
    ? {
        farmerId: inspection.farmerId,
        agreementId: inspection.agreementId ?? undefined,
        procurementPlanId: inspection.procurementPlanId ?? undefined,
        cropName: inspection.cropName,
        inspectionDate: dayjs(inspection.inspectionDate),
        moistureLevel: inspection.moistureLevel === null ? undefined : Number(inspection.moistureLevel),
        foreignMatter: inspection.foreignMatter === null ? undefined : Number(inspection.foreignMatter),
        grainSize: inspection.grainSize ?? undefined,
        grainColor: inspection.grainColor ?? undefined,
        smell: inspection.smell ?? undefined,
        physicalDamage: inspection.physicalDamage ?? undefined,
        result: inspection.result,
        remarks: inspection.remarks ?? undefined,
      }
    : undefined;

  const farmerId = Form.useWatch('farmerId', form);
  const result = Form.useWatch('result', form);

  // Only this farmer's agreements can be linked, and the agreement is what
  // supplies the fallback purchase rate at collection.
  const agreements = useAgreements(farmerId);

  useEffect(() => {
    if (open && !inspection) form.resetFields();
  }, [open, inspection, form]);

  // A stale agreement selection after switching farmer would be rejected by the
  // server ("Agreement does not belong to this farmer") - clear it instead.
  useEffect(() => {
    form.setFieldValue('agreementId', undefined);
  }, [farmerId, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      const payload = {
        ...values,
        inspectionDate: toIsoDate(values.inspectionDate) as string,
      };
      
      if (isEdit && inspection) {
        await updateInspection.mutateAsync({ id: inspection.id, input: payload });
        message.success('Inspection updated');
      } else {
        await createInspection.mutateAsync(payload);
        message.success(
          values.result === 'APPROVED'
            ? 'Inspection recorded — this harvest can now be collected'
            : 'Inspection recorded',
        );
      }
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, `Could not ${isEdit ? 'update' : 'record'} the inspection`));
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit harvest inspection' : 'Record harvest inspection'}
      okText={isEdit ? 'Save changes' : 'Record inspection'}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createInspection.isPending || updateInspection.isPending}
      width={760}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark preserve={false} initialValues={initialValues}>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              name="farmerId"
              label="Farmer"
              rules={[required('Farmer')]}
              extra="Approved farmers only — an unapproved farmer has no traceability code."
            >
              <FarmerSelect approvedOnly />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item name="cropName" label="Crop" rules={[required('Crop')]}>
              <Input placeholder="Wheat" />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item
              name="inspectionDate"
              label="Inspection date"
              rules={[required('Inspection date')]}
            >
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>

          <Col xs={24}>
            <Form.Item
              name="agreementId"
              label="Against agreement"
              extra="Optional, but linking one means the collection can fall back to the agreed rate instead of needing it typed in."
            >
              <Select
                allowClear
                disabled={!farmerId}
                loading={agreements.isFetching}
                placeholder={farmerId ? 'Optional' : 'Select a farmer first'}
                options={(agreements.data?.data ?? []).map((agreement) => ({
                  value: agreement.id,
                  label: `${agreement.cropName}${agreement.variety ? ` (${agreement.variety})` : ''} — ₹${agreement.purchaseRate}/KG · ${agreement.status}`,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>
          Quality checklist (FRD 13.2)
        </Divider>

        <Row gutter={16}>
          <Col xs={12} md={6}>
            <Form.Item
              name="moistureLevel"
              label="Moisture %"
              rules={[positiveNumber('Moisture', true)]}
            >
              <InputNumber style={{ width: '100%' }} min={0} max={100} step={0.1} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              name="foreignMatter"
              label="Foreign matter %"
              rules={[positiveNumber('Foreign matter', true)]}
            >
              <InputNumber style={{ width: '100%' }} min={0} max={100} step={0.1} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="grainSize" label="Grain size">
              <Input placeholder="e.g. Bold" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="grainColor" label="Colour">
              <Input placeholder="e.g. Golden" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="smell" label="Smell">
              <Input placeholder="e.g. Normal" />
            </Form.Item>
          </Col>
          <Col xs={12} md={18}>
            <Form.Item name="physicalDamage" label="Physical damage">
              <Input placeholder="e.g. None observed" />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>
          Decision (FRD 13.4)
        </Divider>

        <Form.Item name="result" label="Result" rules={[required('Result')]}>
          <Radio.Group>
            <Space direction="vertical">
              <Radio value="APPROVED">Approved — this harvest may be collected</Radio>
              <Radio value="REJECTED">Rejected — it may never be collected</Radio>
              <Radio value="HOLD_FOR_REINSPECTION">Hold — re-inspect before deciding</Radio>
            </Space>
          </Radio.Group>
        </Form.Item>

        {result && result !== 'APPROVED' ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="This blocks collection"
            description="Only an APPROVED inspection can be collected (FRD 13.5). A rejected or held harvest cannot be received into stock until a new inspection approves it."
          />
        ) : null}

        <Form.Item
          name="remarks"
          label="Remarks"
          rules={
            result === 'REJECTED'
              ? [{ required: true, message: 'Give a reason for the rejection' }]
              : undefined
          }
        >
          <Input.TextArea rows={2} placeholder="Optional for approval, required when rejecting" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
