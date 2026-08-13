import {
  Alert,
  App as AntApp,
  Checkbox,
  Col,
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
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { CreateQualityInspectionInput, InspectionStage } from '../../api/types';
import { useBatches } from '../../hooks/useCollections';
import { useFinishedGoods } from '../../hooks/usePackaging';
import { useProductionBatches } from '../../hooks/useProduction';
import { useCreateQualityInspection } from '../../hooks/useQuality';
import { positiveNumber, required } from '../../validation/rules';

interface QualityInspectionFormModalProps {
  open: boolean;
  onClose: () => void;
}

const STAGE_LABELS: Record<InspectionStage, string> = {
  RAW_MATERIAL: 'Raw material — before production',
  IN_PROCESS: 'In process — during manufacturing',
  FINISHED_GOODS: 'Finished goods — before packing out',
};

/**
 * Quality inspection (FRD Section 21).
 *
 * The stage decides three things at once: which target is required, which
 * parameters are relevant, and what a FAIL actually does. The form follows all
 * three, because a QA manager should not have to remember that failing a
 * raw-material batch rejects it permanently while failing a finished batch
 * merely withdraws its release.
 */
export function QualityInspectionFormModal({ open, onClose }: QualityInspectionFormModalProps) {
  const [form] = Form.useForm<CreateQualityInspectionInput>();
  const { message } = AntApp.useApp();
  const createInspection = useCreateQualityInspection();

  const stage = Form.useWatch('stage', form) as InspectionStage | undefined;
  const result = Form.useWatch('result', form);

  const rawBatches = useBatches({});
  const productionBatches = useProductionBatches({});
  const finishedGoods = useFinishedGoods({});

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ stage: 'RAW_MATERIAL' } as CreateQualityInspectionInput);
    }
  }, [open, form]);

  // Only one target may be sent; switching stage must clear the others or the
  // server refuses with "Supply exactly one target id for the given stage".
  useEffect(() => {
    form.setFieldsValue({
      rawMaterialBatchId: undefined,
      productionBatchId: undefined,
      finishedGoodsBatchId: undefined,
    });
  }, [stage, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      await createInspection.mutateAsync(values);
      message.success(
        values.result === 'FAIL'
          ? values.stage === 'RAW_MATERIAL'
            ? 'Recorded — this batch is now REJECTED and cannot enter production'
            : values.stage === 'FINISHED_GOODS'
              ? 'Recorded — QA release withdrawn, this batch cannot be stocked or dispatched'
              : 'Inspection recorded'
          : 'Inspection recorded',
        6,
      );
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not record the inspection'));
    }
  };

  return (
    <Modal
      open={open}
      title="Record quality inspection"
      okText="Record inspection"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createInspection.isPending}
      width={760}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark preserve={false}>
        <Form.Item name="stage" label="Stage" rules={[required('Stage')]}>
          <Select
            options={(Object.keys(STAGE_LABELS) as InspectionStage[]).map((value) => ({
              value,
              label: STAGE_LABELS[value],
            }))}
          />
        </Form.Item>

        {stage === 'RAW_MATERIAL' ? (
          <>
            <Form.Item
              name="rawMaterialBatchId"
              label="Raw material batch"
              rules={[required('Batch')]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                loading={rawBatches.isLoading}
                placeholder="Select a batch"
                options={(rawBatches.data?.data ?? []).map((batch) => ({
                  value: batch.id,
                  label: `${batch.batchNumber} — ${batch.cropName} · ${batch.status}`,
                }))}
              />
            </Form.Item>

            <Divider orientation="left" plain>
              Parameters (FRD 21.1)
            </Divider>
            <Row gutter={16}>
              <Col xs={12} md={8}>
                <Form.Item name="moisture" label="Moisture %" rules={[positiveNumber('Moisture', true)]}>
                  <InputNumber style={{ width: '100%' }} min={0} max={100} step={0.1} />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name="purity" label="Purity %" rules={[positiveNumber('Purity', true)]}>
                  <InputNumber style={{ width: '100%' }} min={0} max={100} step={0.1} />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item
                  name="foreignMatter"
                  label="Foreign matter %"
                  rules={[positiveNumber('Foreign matter', true)]}
                >
                  <InputNumber style={{ width: '100%' }} min={0} max={100} step={0.1} />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name="grainSize" label="Grain size">
                  <Input placeholder="Optional" />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name="color" label="Colour">
                  <Input placeholder="Optional" />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name="odor" label="Odour">
                  <Input placeholder="Optional" />
                </Form.Item>
              </Col>
            </Row>
          </>
        ) : null}

        {stage === 'IN_PROCESS' ? (
          <>
            <Form.Item
              name="productionBatchId"
              label="Production run"
              rules={[required('Production run')]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                loading={productionBatches.isLoading}
                placeholder="Select a run"
                options={(productionBatches.data?.data ?? []).map((batch) => ({
                  value: batch.id,
                  label: `${batch.productionBatchNumber} — ${batch.product?.name ?? ''} · ${batch.status}`,
                }))}
              />
            </Form.Item>

            <Divider orientation="left" plain>
              Parameters (FRD 21.2)
            </Divider>
            <Row gutter={16}>
              <Col xs={12} md={8}>
                <Form.Item name="ingredientRatio" label="Ingredient ratio">
                  <Input placeholder="Optional" />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name="mixingAccuracy" label="Mixing accuracy">
                  <Input placeholder="Optional" />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name="grindingQuality" label="Grinding quality">
                  <Input placeholder="Optional" />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name="temperature" label="Temperature (°C)">
                  <InputNumber style={{ width: '100%' }} step={0.5} />
                </Form.Item>
              </Col>
              <Col xs={12} md={16}>
                <Form.Item name="productConsistency" label="Consistency">
                  <Input placeholder="Optional" />
                </Form.Item>
              </Col>
            </Row>
          </>
        ) : null}

        {stage === 'FINISHED_GOODS' ? (
          <>
            <Form.Item
              name="finishedGoodsBatchId"
              label="Finished goods batch"
              rules={[required('Batch')]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                loading={finishedGoods.isLoading}
                placeholder="Select a pack batch"
                options={(finishedGoods.data?.data ?? []).map((batch) => ({
                  value: batch.id,
                  label: `${batch.fgBatchNumber} — ${batch.product?.name ?? ''} · ${batch.packCount} packs`,
                }))}
              />
            </Form.Item>

            <Divider orientation="left" plain>
              Parameters (FRD 21.3)
            </Divider>
            <Row gutter={16}>
              <Col xs={12} md={8}>
                <Form.Item name="productAppearance" label="Appearance">
                  <Input placeholder="Optional" />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item
                  name="productWeight"
                  label="Weight check"
                  rules={[positiveNumber('Weight', true)]}
                >
                  <InputNumber style={{ width: '100%' }} min={0} step={0.001} />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name="packagingQuality" label="Packaging quality">
                  <Input placeholder="Optional" />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name="labelAccuracy" label="Label accuracy">
                  <Input placeholder="Optional" />
                </Form.Item>
              </Col>
              <Col xs={12} md={16}>
                <Form.Item name="shelfLifeVerified" valuePropName="checked">
                  <Checkbox>Shelf life verified</Checkbox>
                </Form.Item>
              </Col>
            </Row>
          </>
        ) : null}

        <Divider orientation="left" plain>
          Decision (FRD 21.4)
        </Divider>

        <Form.Item name="result" label="Result" rules={[required('Result')]}>
          <Radio.Group>
            <Space direction="vertical">
              <Radio value="PASS">Pass</Radio>
              <Radio value="FAIL">Fail</Radio>
              <Radio value="REWORK_REQUIRED">Rework required</Radio>
            </Space>
          </Radio.Group>
        </Form.Item>

        {result === 'FAIL' && stage === 'RAW_MATERIAL' ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message="This rejects the batch permanently"
            description="A failed raw material batch is marked REJECTED and can never enter production. The only way forward for that stock is to write it off."
          />
        ) : null}

        {result === 'FAIL' && stage === 'FINISHED_GOODS' ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message="This withdraws QA release"
            description="The batch cannot be stocked, allocated or dispatched until a new finished-goods inspection passes and it is released again."
          />
        ) : null}

        <Form.Item
          name="remarks"
          label="Remarks"
          rules={
            result === 'FAIL'
              ? [{ required: true, message: 'A failure needs a reason on record' }]
              : undefined
          }
        >
          <Input.TextArea rows={2} placeholder="Optional for a pass, required for a failure" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
