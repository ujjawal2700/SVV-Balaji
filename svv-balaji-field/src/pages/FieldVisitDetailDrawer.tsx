import { PlusOutlined } from '@ant-design/icons';
import { Alert, App as AntApp, Button, Descriptions, Drawer, Empty, Form, List, Select, Space, Spin, Typography } from 'antd';
import { apiErrorMessage } from '@shared/api/client';
import type { FieldVisitDocument } from '@shared/api/types';
import { useCan } from '@shared/auth/useCan';
import { FileUploadField } from '@shared/components/FileUploadField';
import { AttachmentPreview } from '@shared/components/AttachmentPreview';
import { useAddFieldVisitDocument, useFieldVisit } from '@shared/hooks/useFieldVisits';
import { EM_DASH, formatDate, formatQuantity } from '@shared/utils/format';

interface FieldVisitDetailDrawerProps {
  visitId: string | null;
  onClose: () => void;
}

const FILE_TYPES = ['photo', 'video', 'pdf', 'inspection_doc'];

export function FieldVisitDetailDrawer({ visitId, onClose }: FieldVisitDetailDrawerProps) {
  const { message } = AntApp.useApp();
  const visit = useFieldVisit(visitId ?? undefined);
  const addDocument = useAddFieldVisitDocument();
  const canEdit = useCan('FIELD_VISIT_CREATE');
  const [documentForm] = Form.useForm<{ fileUrl: string; fileType: string }>();

  const handleAddDocument = async () => {
    if (!visitId) return;
    const values = await documentForm.validateFields();
    try {
      await addDocument.mutateAsync({ id: visitId, input: values });
      documentForm.resetFields();
      message.success('Document attached');
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not attach the document'));
    }
  };

  const data = visit.data;

  return (
    <Drawer
      open={Boolean(visitId)}
      onClose={onClose}
      width={680}
      title={
        data ? `${data.farmer?.fullName ?? 'Field visit'} — ${formatDate(data.visitDate)}` : 'Field visit'
      }
    >
      {visit.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
          <Spin />
        </div>
      ) : visit.error ? (
        <Alert type="error" showIcon message={apiErrorMessage(visit.error)} />
      ) : data ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions bordered column={2} size="small" title="Visit">
            <Descriptions.Item label="Farmer">{data.farmer?.fullName ?? EM_DASH}</Descriptions.Item>
            <Descriptions.Item label="Code">
              {data.farmer?.farmerCode ? (
                <Typography.Text code>{data.farmer.farmerCode}</Typography.Text>
              ) : (
                <Typography.Text type="secondary">Not yet issued</Typography.Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Date">{formatDate(data.visitDate)}</Descriptions.Item>
            <Descriptions.Item label="Branch">{data.branch?.name ?? EM_DASH}</Descriptions.Item>
            <Descriptions.Item label="Visited by" span={2}>
              {data.expert?.fullName ?? EM_DASH}
            </Descriptions.Item>
          </Descriptions>

          <Descriptions bordered column={2} size="small" title="Observed">
            <Descriptions.Item label="Crop">{data.cropName ?? EM_DASH}</Descriptions.Item>
            <Descriptions.Item label="Growth stage">
              {data.cropGrowthStage ?? EM_DASH}
            </Descriptions.Item>
            <Descriptions.Item label="Health">{data.cropHealth ?? EM_DASH}</Descriptions.Item>
            <Descriptions.Item label="Pests">{data.pestStatus ?? EM_DASH}</Descriptions.Item>
            <Descriptions.Item label="Disease" span={2}>
              {data.diseaseObservation ?? EM_DASH}
            </Descriptions.Item>
            <Descriptions.Item label="Predicted yield" span={2}>
              {formatQuantity(data.yieldPredictionQty, 'KG')}
            </Descriptions.Item>
          </Descriptions>

          <Descriptions bordered column={1} size="small" title="Advised">
            <Descriptions.Item label="Fertiliser">
              {data.fertilizerAdvice ?? EM_DASH}
            </Descriptions.Item>
            <Descriptions.Item label="Irrigation">
              {data.irrigationAdvice ?? EM_DASH}
            </Descriptions.Item>
            <Descriptions.Item label="Pest control">
              {data.pestControlSuggestions ?? EM_DASH}
            </Descriptions.Item>
            <Descriptions.Item label="Harvest preparation">
              {data.harvestPreparation ?? EM_DASH}
            </Descriptions.Item>
          </Descriptions>

          <div>
            <Typography.Title level={5}>Documents ({data.documents.length})</Typography.Title>

            {canEdit ? (
              <Form form={documentForm} layout="vertical" style={{ marginBottom: 12 }}>
                <Form.Item
                  name="fileUrl"
                  rules={[{ required: true, message: 'Attach a photo or document first' }]}
                >
                  <FileUploadField
                    allowVideo
                    folder="field-visits"
                    hint="Crop photographs, pest damage, an inspection report — photos and documents up to 10 MB, or a short MP4/MOV clip up to 100 MB"
                  />
                </Form.Item>
                <Form.Item name="fileType" initialValue="photo" rules={[{ required: true }]}>
                  <Select
                    style={{ width: 160 }}
                    options={FILE_TYPES.map((type) => ({ value: type, label: type }))}
                  />
                </Form.Item>
                <Form.Item>
                  <Button
                    icon={<PlusOutlined />}
                    loading={addDocument.isPending}
                    onClick={handleAddDocument}
                  >
                    Attach
                  </Button>
                </Form.Item>
              </Form>
            ) : null}

            <List<FieldVisitDocument>
              size="small"
              bordered
              dataSource={data.documents}
              locale={{ emptyText: <Empty description="Nothing attached" /> }}
              renderItem={(document) => (
                <List.Item>
                  <AttachmentPreview url={document.fileUrl} fileType={document.fileType} />
                </List.Item>
              )}
            />
          </div>
        </Space>
      ) : null}
    </Drawer>
  );
}
