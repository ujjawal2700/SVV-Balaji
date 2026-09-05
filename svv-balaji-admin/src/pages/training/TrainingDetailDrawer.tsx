import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Button,
  Descriptions,
  Drawer,
  Popconfirm,
  Empty,
  Form,
  List,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { TrainingAttendance, TrainingMaterial } from '../../api/types';
import { useCan } from '../../auth/useCan';
import { useFarmers } from '../../hooks/useFarmers';
import {
  useAddTrainingMaterial,
  useMarkAttendance,
  useRemoveAttendance,
  useRemoveTrainingMaterial,
  useTrainingSession,
} from '../../hooks/useTraining';
import { FileUploadField } from '../../components/FileUploadField';
import { AttachmentPreview } from '@shared/components/AttachmentPreview';
import { EM_DASH, formatDate } from '../../utils/format';

interface TrainingDetailDrawerProps {
  sessionId: string | null;
  onClose: () => void;
}

const FILE_TYPES = ['pdf', 'image', 'presentation', 'video'];

export function TrainingDetailDrawer({ sessionId, onClose }: TrainingDetailDrawerProps) {
  const { message } = AntApp.useApp();
  const session = useTrainingSession(sessionId ?? undefined);
  const farmers = useFarmers({});
  const markAttendance = useMarkAttendance();
  const addMaterial = useAddTrainingMaterial();
  const removeAttendance = useRemoveAttendance();
  const removeMaterial = useRemoveTrainingMaterial();
  const canEdit = useCan('TRAINING_CREATE');

  const handleRemoveAttendance = async (farmerId: string, name: string) => {
    if (!sessionId) return;
    try {
      await removeAttendance.mutateAsync({ id: sessionId, farmerId });
      message.success(`${name} removed from this session`);
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not remove the attendance'), 8);
    }
  };

  const handleRemoveMaterial = async (materialId: string) => {
    if (!sessionId) return;
    try {
      await removeMaterial.mutateAsync({ id: sessionId, materialId });
      message.success('Material removed');
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not remove the material'), 8);
    }
  };

  const [selectedFarmers, setSelectedFarmers] = useState<string[]>([]);
  const [materialForm] = Form.useForm<{ fileUrl: string; fileType: string }>();

  // Seed the picker with whoever is already marked, so the control shows the
  // current state rather than an empty box over a populated list.
  useEffect(() => {
    if (session.data) {
      setSelectedFarmers(session.data.attendances.map((a) => a.farmerId));
    }
  }, [session.data]);

  const handleSaveAttendance = async () => {
    if (!sessionId) return;
    try {
      await markAttendance.mutateAsync({ id: sessionId, farmerIds: selectedFarmers });
      message.success('Attendance saved');
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not save attendance'));
    }
  };

  const handleAddMaterial = async () => {
    if (!sessionId) return;
    const values = await materialForm.validateFields();
    try {
      await addMaterial.mutateAsync({ id: sessionId, input: values });
      materialForm.resetFields();
      message.success('Material added');
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not add the material'));
    }
  };

  const data = session.data;
  const alreadyMarked = new Set(data?.attendances.map((a) => a.farmerId) ?? []);
  const hasChanges =
    selectedFarmers.length !== alreadyMarked.size ||
    selectedFarmers.some((id) => !alreadyMarked.has(id));

  return (
    <Drawer
      open={Boolean(sessionId)}
      onClose={onClose}
      width={720}
      title={data ? data.title : 'Training session'}
    >
      {session.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
          <Spin />
        </div>
      ) : session.error ? (
        <Alert type="error" showIcon message={apiErrorMessage(session.error)} />
      ) : data ? (
        <Tabs
          items={[
            {
              key: 'details',
              label: 'Details',
              children: (
                <Descriptions bordered column={1} size="small">
                  <Descriptions.Item label="Date">{formatDate(data.scheduledDate)}</Descriptions.Item>
                  <Descriptions.Item label="Branch">{data.branch?.name ?? EM_DASH}</Descriptions.Item>
                  <Descriptions.Item label="Conducted by">
                    {data.conductedBy?.fullName ?? EM_DASH}
                  </Descriptions.Item>
                  <Descriptions.Item label="Session Description & Remarks">
                    {data.description ?? EM_DASH}
                  </Descriptions.Item>
                </Descriptions>
              ),
            },
            {
              key: 'attendance',
              label: `Attendance (${data.attendances.length})`,
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  {canEdit ? (
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Typography.Text strong>Who attended</Typography.Text>
                      <Select
                        mode="multiple"
                        style={{ width: '100%' }}
                        placeholder="Select the farmers who attended"
                        value={selectedFarmers}
                        onChange={setSelectedFarmers}
                        loading={farmers.isLoading}
                        showSearch
                        optionFilterProp="label"
                        options={(farmers.data?.data ?? []).map((farmer) => ({
                          value: farmer.id,
                          label: `${farmer.fullName} — ${farmer.farmerCode ?? 'pending'} · ${farmer.village}`,
                        }))}
                      />
                      <Space>
                        <Button
                          type="primary"
                          disabled={!hasChanges}
                          loading={markAttendance.isPending}
                          onClick={handleSaveAttendance}
                        >
                          Save attendance
                        </Button>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Saving is idempotent — re-submitting the same list changes nothing.
                        </Typography.Text>
                      </Space>
                    </Space>
                  ) : null}

                  <Table<TrainingAttendance>
                    size="small"
                    rowKey="id"
                    dataSource={data.attendances}
                    pagination={false}
                    locale={{ emptyText: <Empty description="Nobody marked yet" /> }}
                    columns={[
                      {
                        title: 'Farmer',
                        key: 'farmer',
                        render: (_, row) => row.farmer?.fullName ?? row.farmerId,
                      },
                      {
                        title: 'Code',
                        key: 'code',
                        render: (_, row) =>
                          row.farmer?.farmerCode ? (
                            <Typography.Text code>{row.farmer.farmerCode}</Typography.Text>
                          ) : (
                            <Typography.Text type="secondary">Not yet issued</Typography.Text>
                          ),
                      },
                      {
                        title: 'Attended',
                        dataIndex: 'attended',
                        width: 100,
                        render: (attended: boolean) =>
                          attended ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>,
                      },
                      ...(canEdit
                        ? [
                            {
                              title: '',
                              key: 'remove',
                              width: 50,
                              render: (_: unknown, row: TrainingAttendance) => (
                                <Popconfirm
                                  title="Remove from this session?"
                                  description="Marked by mistake — the farmer's other sessions are unaffected."
                                  okText="Remove"
                                  okButtonProps={{ danger: true }}
                                  onConfirm={() =>
                                    void handleRemoveAttendance(
                                      row.farmerId,
                                      row.farmer?.fullName ?? 'The farmer',
                                    )
                                  }
                                >
                                  <Button
                                    size="small"
                                    type="text"
                                    danger
                                    icon={<DeleteOutlined />}
                                    aria-label="Remove attendance"
                                  />
                                </Popconfirm>
                              ),
                            },
                          ]
                        : []),
                    ]}
                  />
                </Space>
              ),
            },
            {
              key: 'materials',
              label: `Materials (${data.materials.length})`,
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>

                  {canEdit ? (
                    <Form form={materialForm} layout="vertical">
                      <Form.Item
                        name="fileUrl"
                        rules={[{ required: true, message: 'Attach the material first' }]}
                      >
                        <FileUploadField
                          allowVideo
                          folder="training"
                          hint="A handout, slide deck, photograph or recording from the session — PDF, Word, PowerPoint, JPEG, PNG or HEIC up to 10 MB, or MP4/MOV video up to 100 MB"
                        />
                      </Form.Item>
                      <Form.Item
                        name="fileType"
                        rules={[{ required: true, message: 'Pick a type' }]}
                        initialValue="pdf"
                      >
                        <Select
                          style={{ width: 140 }}
                          options={FILE_TYPES.map((type) => ({ value: type, label: type }))}
                        />
                      </Form.Item>
                      <Form.Item>
                        <Button
                          icon={<PlusOutlined />}
                          loading={addMaterial.isPending}
                          onClick={handleAddMaterial}
                        >
                          Add
                        </Button>
                      </Form.Item>
                    </Form>
                  ) : null}

                  <List<TrainingMaterial>
                    size="small"
                    bordered
                    dataSource={data.materials}
                    locale={{ emptyText: <Empty description="No materials attached" /> }}
                    renderItem={(material) => (
                      <List.Item
                        actions={
                          canEdit
                            ? [
                                <Popconfirm
                                  key="remove"
                                  title="Remove this material?"
                                  okText="Remove"
                                  okButtonProps={{ danger: true }}
                                  onConfirm={() => void handleRemoveMaterial(material.id)}
                                >
                                  <Button
                                    size="small"
                                    type="text"
                                    danger
                                    icon={<DeleteOutlined />}
                                    aria-label="Remove material"
                                  />
                                </Popconfirm>,
                              ]
                            : undefined
                        }
                      >
                        <AttachmentPreview
                          url={material.fileUrl}
                          fileType={material.fileType}
                        />
                      </List.Item>
                    )}
                  />
                </Space>
              ),
            },
          ]}
        />
      ) : null}
    </Drawer>
  );
}
