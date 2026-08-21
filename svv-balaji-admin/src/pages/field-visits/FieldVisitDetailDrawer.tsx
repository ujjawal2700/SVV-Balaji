import { LinkOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Image,
  List,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { apiErrorMessage } from '../../api/client';
import type { FieldVisitDocument } from '../../api/types';
import { useCan } from '../../auth/useCan';
import { FileUploadField } from '../../components/FileUploadField';
import { useAddFieldVisitDocument, useFieldVisit } from '../../hooks/useFieldVisits';
import { EM_DASH, formatDate, formatQuantity } from '../../utils/format';

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
                    hint="Crop photographs, pest damage, an inspection report — photos and documents up to 10 MB, or a short MP4/MOV clip up to 20 MB"
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
              renderItem={(document) => {
                const isImg =
                  document.fileType === 'photo' ||
                  /\.(jpg|jpeg|png|webp|heic|heif|gif)($|\?)/i.test(document.fileUrl) ||
                  document.fileUrl.includes('/image/upload/');
                const isVid =
                  document.fileType === 'video' ||
                  /\.(mp4|mov|avi|mkv|webm)($|\?)/i.test(document.fileUrl) ||
                  document.fileUrl.includes('/video/upload/');

                return (
                  <List.Item>
                    <Space align="start" size={12}>
                      {isImg ? (
                        <Image
                          src={document.fileUrl}
                          alt="Visit document"
                          width={72}
                          height={72}
                          style={{
                            objectFit: 'cover',
                            borderRadius: 8,
                            border: '1px solid #e2e8f0',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 72,
                            height: 72,
                            borderRadius: 8,
                            background: isVid ? '#f3e8ff' : '#eff6ff',
                            color: isVid ? '#7e22ce' : '#2563eb',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 11,
                            fontWeight: 600,
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          {isVid ? '🎬 Video' : '📄 Doc'}
                        </div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <Space>
                          <Tag color={isImg ? 'green' : isVid ? 'purple' : 'blue'}>
                            {document.fileType.toUpperCase()}
                          </Tag>
                        </Space>
                        <Typography.Link
                          href={document.fileUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          style={{ wordBreak: 'break-all', fontSize: 13 }}
                        >
                          <LinkOutlined /> Open full file in new tab
                        </Typography.Link>
                      </div>
                    </Space>
                  </List.Item>
                );
              }}
            />
          </div>
        </Space>
      ) : null}
    </Drawer>
  );
}
