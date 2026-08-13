import {
  Alert,
  App as AntApp,
  Col,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Typography,
} from 'antd';
import { useEffect } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { RawMaterialCollection, UpdateCollectionInput } from '../../api/types';
import { useUpdateCollection } from '../../hooks/useCollections';
import { EM_DASH, formatCurrency, formatDate, formatQuantity } from '../../utils/format';
import { notGreaterThan, positiveNumber, required } from '../../validation/rules';

interface CollectionCorrectionModalProps {
  collection: RawMaterialCollection | null;
  onClose: () => void;
}

const UNITS = ['KG', 'QUINTAL', 'TONNE'];

/**
 * Correcting a collection's figures — a separate form from the one that creates
 * it, deliberately.
 *
 * The create form asks for the harvest, the date and the destination warehouse.
 * None of those can be changed afterwards: the inspection relation is unique,
 * the date is encoded into the receipt and batch numbers already printed on the
 * farmer's copy, and moving stock between warehouses has to go through transfer
 * so the ledger records it. Showing those fields greyed out would invite the
 * question of why; showing only what can change answers it.
 *
 * What this does change reaches further than it looks. A net weight correction
 * updates the batch quantity, the warehouse stock line and writes an ADJUSTMENT
 * to the movement ledger — all server-side, in one transaction.
 */
export function CollectionCorrectionModal({
  collection,
  onClose,
}: CollectionCorrectionModalProps) {
  const [form] = Form.useForm<UpdateCollectionInput>();
  const { message } = AntApp.useApp();
  const update = useUpdateCollection();

  const netWeight = Form.useWatch('netWeight', form);
  const purchaseRate = Form.useWatch('purchaseRate', form);

  const previousNet = collection ? Number(collection.netWeight) : 0;
  const newTotal = Number(netWeight ?? 0) * Number(purchaseRate ?? 0);
  const weightChanged = collection ? Number(netWeight ?? previousNet) !== previousNet : false;

  useEffect(() => {
    if (!collection) return;
    form.resetFields();
    form.setFieldsValue({
      grossWeight: Number(collection.grossWeight),
      netWeight: Number(collection.netWeight),
      purchaseRate: Number(collection.purchaseRate),
      unit: collection.unit,
      collectionLocation: collection.collectionLocation ?? undefined,
    });
  }, [collection, form]);

  const handleSubmit = async () => {
    if (!collection) return;
    const values = await form.validateFields();
    try {
      await update.mutateAsync({ id: collection.id, input: values });
      message.success(`${collection.receiptNumber} corrected`);
      onClose();
    } catch (error) {
      // The server's refusal names what has already used the batch — a
      // cleaning record, a consumption, a movement since receipt. That is
      // exactly what the user needs, so it goes through unchanged.
      message.error(apiErrorMessage(error, 'Could not correct the collection'), 12);
    }
  };

  return (
    <Modal
      open={Boolean(collection)}
      title={collection ? `Correct ${collection.receiptNumber}` : 'Correct collection'}
      okText="Save correction"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={update.isPending}
      width={640}
      destroyOnClose
    >
      {collection ? (
        <>
          <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Farmer">
              {collection.farmer?.fullName ?? EM_DASH}
            </Descriptions.Item>
            <Descriptions.Item label="Batch">
              {collection.batch ? (
                <Typography.Text code>{collection.batch.batchNumber}</Typography.Text>
              ) : (
                EM_DASH
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Collected">
              {formatDate(collection.collectionDate)}
            </Descriptions.Item>
            <Descriptions.Item label="Crop">{collection.cropName}</Descriptions.Item>
          </Descriptions>

          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="The harvest, date and warehouse are fixed"
            description="The receipt and batch numbers encode the collection date and are already on the farmer's copy, and stock only moves between warehouses through a transfer so the ledger records it. If any of those is wrong, delete this collection and record it again."
          />

          {weightChanged ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="This also changes the batch and the stock on hand"
              description={`Batch ${collection.batch?.batchNumber ?? ''} moves from ${formatQuantity(
                previousNet,
                collection.unit,
              )} to ${formatQuantity(
                Number(netWeight ?? 0),
                collection.unit,
              )}, and an adjustment is written to the movement ledger. The server refuses this outright if the batch has already been cleaned, inspected, consumed or moved.`}
            />
          ) : null}

          <Form form={form} layout="vertical" requiredMark preserve={false}>
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item
                  name="grossWeight"
                  label="Gross weight"
                  rules={[required('Gross weight'), positiveNumber('Gross weight')]}
                >
                  <InputNumber style={{ width: '100%' }} min={0} step={10} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item
                  name="netWeight"
                  label="Net weight"
                  dependencies={['grossWeight']}
                  rules={[
                    required('Net weight'),
                    positiveNumber('Net weight'),
                    notGreaterThan('grossWeight', 'the gross weight'),
                  ]}
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
                  label="Rate (₹ per unit)"
                  rules={[required('Rate'), positiveNumber('Rate')]}
                  extra={
                    collection.paymentStatus === 'PENDING'
                      ? 'Payment is still pending, so the amount can change.'
                      : 'Payment is already marked ' + collection.paymentStatus.toLowerCase() + '.'
                  }
                >
                  <InputNumber style={{ width: '100%' }} min={0} step={1} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Amount payable">
                  <Typography.Text strong style={{ fontSize: 16 }}>
                    {formatCurrency(newTotal)}
                  </Typography.Text>
                  {newTotal !== Number(collection.totalAmount) ? (
                    <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                      was {formatCurrency(collection.totalAmount)}
                    </Typography.Text>
                  ) : null}
                </Form.Item>
              </Col>

              <Col xs={24}>
                <Form.Item name="collectionLocation" label="Collection location">
                  <Input placeholder="Optional — where the crop was weighed" />
                </Form.Item>
              </Col>

              <Col xs={24}>
                <Form.Item
                  name="correctionReason"
                  label="Why was this corrected?"
                  rules={weightChanged ? [required('A reason')] : undefined}
                  extra="Written onto the stock ledger, so the adjustment is explainable months from now."
                >
                  <Input.TextArea
                    rows={2}
                    placeholder="e.g. Weighbridge slip read 500 instead of 50"
                  />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </>
      ) : null}
    </Modal>
  );
}
