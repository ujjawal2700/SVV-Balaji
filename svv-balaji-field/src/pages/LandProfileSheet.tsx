import { DeleteOutlined, EnvironmentOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { FarmPlot, FarmPlotInput } from '@shared/api/farmPlots';
import type { Farmer } from '@shared/api/types';
import { useCan } from '@shared/auth/useCan';
import { Sheet } from '@shared/components/Sheet';
import {
  useCreateFarmPlot,
  useDeleteFarmPlot,
  useFarmPlotSummary,
  useFarmPlots,
  useUpdateFarmPlot,
} from '@shared/hooks/useFarmPlots';
import { useIsMobile } from '@shared/hooks/useIsMobile';
import { toIsoDate } from '@shared/utils/format';
import { GpsField } from './GpsField';

/**
 * Common values, offered as suggestions rather than enforced as a master.
 *
 * A soil-type master table would be the "correct" answer and would be wrong
 * here: the crop names on agreements and collections are free text, so a
 * constrained list on plots alone would fork the vocabulary. So this is a
 * searchable combobox with suggestions: the common answers are one tap, and
 * anything else is typed and saved as given.
 */
const SOIL_TYPES = ['Black cotton', 'Red', 'Alluvial', 'Sandy loam', 'Clay', 'Laterite'];
const IRRIGATION_TYPES = ['Rain-fed', 'Drip', 'Sprinkler', 'Flood', 'Canal'];
const WATER_SOURCES = ['Borewell', 'Open well', 'Canal', 'River', 'Pond', 'Rain only'];

export function LandProfileSheet({
  farmer,
  open,
  onClose,
}: {
  farmer: Farmer | null;
  open: boolean;
  onClose: () => void;
}) {
  const farmerId = farmer?.id ?? '';
  const canEdit = useCan('FARMER_PLOTS');

  const plots = useFarmPlots(farmerId || undefined);
  const summary = useFarmPlotSummary(farmerId || undefined);

  const [editing, setEditing] = useState<FarmPlot | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const rows = plots.data?.data ?? [];

  return (
    <>
      <Sheet
        open={open}
        title={farmer ? `${farmer.fullName} — land` : 'Land'}
        onOk={onClose}
        onCancel={onClose}
        okText="Done"
        cancelText="Close"
      >
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <MappedVersusRegistered
            summary={summary.data}
            registeredLabel={farmer?.farmSizeAcres ?? null}
          />

          {rows.length === 0 && !plots.isLoading ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No plots mapped yet. The registration form captured a total holding size; this is where the individual fields go."
            />
          ) : null}

          {rows.map((plot) => (
            <Card
              key={plot.id}
              size="small"
              styles={{ body: { padding: 12 } }}
              title={
                <Space size={6} wrap>
                  <Typography.Text strong>{plot.name}</Typography.Text>
                  {plot.surveyNumber ? <Tag>#{plot.surveyNumber}</Tag> : null}
                  {!plot.isActive ? <Tag color="default">Not worked</Tag> : null}
                </Space>
              }
              extra={
                canEdit ? (
                  <Button
                    size="small"
                    onClick={() => {
                      setEditing(plot);
                      setFormOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                ) : null
              }
            >
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Typography.Text strong>{plot.areaAcres} acres</Typography.Text>
                <Space size={4} wrap>
                  {plot.currentCrop ? <Tag color="green">{plot.currentCrop}</Tag> : null}
                  {plot.soilType ? <Tag>{plot.soilType}</Tag> : null}
                  {plot.irrigationType ? <Tag>{plot.irrigationType}</Tag> : null}
                  {plot.waterSource ? <Tag>{plot.waterSource}</Tag> : null}
                </Space>

                {plot.expectedHarvest ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Harvest expected {dayjs(plot.expectedHarvest).format('D MMM YYYY')}
                  </Typography.Text>
                ) : null}

                <Typography.Text
                  type={plot.gpsLocation ? 'secondary' : 'warning'}
                  style={{ fontSize: 12 }}
                >
                  <EnvironmentOutlined />{' '}
                  {plot.gpsLocation ?? 'No location — this plot cannot be found again from the record'}
                </Typography.Text>
              </Space>
            </Card>
          ))}

          {canEdit ? (
            <Button
              block
              type="dashed"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Add a plot
            </Button>
          ) : null}
        </Space>
      </Sheet>

      <PlotFormSheet
        farmerId={farmerId}
        plot={editing}
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
    </>
  );
}

/**
 * The gap between what was entered at the desk and what was measured in the
 * field, shown rather than reconciled.
 *
 * Neither figure is authoritative. Registration often records the whole family
 * holding; plots record what this farmer actually works. The executive is the
 * only person who can say which is right, so the screen surfaces the difference
 * and stops there instead of quietly overwriting one with the other.
 */
function MappedVersusRegistered({
  summary,
  registeredLabel,
}: {
  summary: { plotCount: number; mappedAcres: string; registeredAcres: string | null; differenceAcres: string | null; plotsWithoutGps: number } | undefined;
  registeredLabel: string | null;
}) {
  if (!summary) return null;

  const difference = summary.differenceAcres ? Number(summary.differenceAcres) : null;
  const materially = difference !== null && Math.abs(difference) >= 0.5;

  return (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      <Space size={24} wrap>
        <Statistic title="Plots mapped" value={summary.plotCount} />
        <Statistic title="Mapped area" value={summary.mappedAcres} suffix="ac" />
        <Statistic
          title="At registration"
          value={summary.registeredAcres ?? registeredLabel ?? '—'}
          suffix={summary.registeredAcres || registeredLabel ? 'ac' : undefined}
        />
      </Space>

      {materially ? (
        <Alert
          type="warning"
          showIcon
          message={
            difference! > 0
              ? `Plots add up to ${difference!.toFixed(2)} acres more than registration recorded`
              : `Plots add up to ${Math.abs(difference!).toFixed(2)} acres less than registration recorded`
          }
          description="Neither figure is automatically right — registration often records the whole family holding. Correct whichever is wrong; nothing here overwrites the other."
        />
      ) : null}

      {summary.plotsWithoutGps > 0 ? (
        <Alert
          type="info"
          showIcon
          message={`${summary.plotsWithoutGps} plot${summary.plotsWithoutGps === 1 ? '' : 's'} without a location`}
          description="A plot with no coordinates cannot be found again from the record, and leaves a gap on the consumer trace page."
        />
      ) : null}
    </Space>
  );
}

function PlotFormSheet({
  farmerId,
  plot,
  open,
  onClose,
}: {
  farmerId: string;
  plot: FarmPlot | null;
  open: boolean;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const { message, modal } = AntApp.useApp();
  const [form] = Form.useForm();
  const [gps, setGps] = useState<string | undefined>(undefined);

  const create = useCreateFarmPlot(farmerId);
  const update = useUpdateFarmPlot(farmerId);
  const remove = useDeleteFarmPlot(farmerId);

  useEffect(() => {
    if (!open) return;

    if (plot) {
      form.setFieldsValue({
        name: plot.name,
        surveyNumber: plot.surveyNumber ?? undefined,
        areaAcres: Number(plot.areaAcres),
        soilType: plot.soilType ?? undefined,
        irrigationType: plot.irrigationType ?? undefined,
        waterSource: plot.waterSource ?? undefined,
        currentCrop: plot.currentCrop ?? undefined,
        sowingDate: plot.sowingDate ? dayjs(plot.sowingDate) : undefined,
        expectedHarvest: plot.expectedHarvest ? dayjs(plot.expectedHarvest) : undefined,
        notes: plot.notes ?? undefined,
      });
      setGps(plot.gpsLocation ?? undefined);
    } else {
      form.resetFields();
      setGps(undefined);
    }
  }, [open, plot, form]);

  const submit = async () => {
    const values = await form.validateFields();

    const payload: FarmPlotInput = {
      name: values.name,
      surveyNumber: values.surveyNumber || undefined,
      areaAcres: values.areaAcres,
      gpsLocation: gps || undefined,
      soilType: values.soilType || undefined,
      irrigationType: values.irrigationType || undefined,
      waterSource: values.waterSource || undefined,
      currentCrop: values.currentCrop || undefined,
      sowingDate: values.sowingDate ? (toIsoDate(values.sowingDate) as string) : undefined,
      expectedHarvest: values.expectedHarvest
        ? (toIsoDate(values.expectedHarvest) as string)
        : undefined,
      isActive: values.isActive ?? true,
      notes: values.notes || undefined,
    };

    try {
      if (plot) {
        await update.mutateAsync({ plotId: plot.id, input: payload });
        message.success('Plot updated');
      } else {
        await create.mutateAsync(payload);
        message.success('Plot added');
      }
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not save the plot'), 8);
    }
  };

  const confirmDelete = () => {
    if (!plot) return;
    modal.confirm({
      title: `Delete ${plot.name}?`,
      content:
        'Plots are descriptive — nothing downstream references them, so this really does remove ' +
        'it. If the farmer has simply stopped working the plot, edit it and mark it not worked ' +
        'instead, which keeps the history.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await remove.mutateAsync(plot.id);
          message.success('Plot deleted');
          onClose();
        } catch (error) {
          message.error(apiErrorMessage(error, 'Could not delete the plot'), 10);
        }
      },
    });
  };

  const formContent = (
    <Form form={form} layout="vertical" requiredMark="optional" style={{ padding: isMobile ? 0 : '4px 0' }}>
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: '16px 18px',
          marginBottom: 16,
          boxShadow: '0 1px 2px 0 rgba(15, 23, 42, 0.03)',
        }}
      >
        <Typography.Text strong style={{ fontSize: 14, color: '#0f172a', display: 'block', marginBottom: 12 }}>
          Plot Identification & Dimensions
        </Typography.Text>
        <Row gutter={[14, 0]}>
          <Col xs={24} md={12}>
            <Form.Item
              name="name"
              label="Plot Name"
              rules={[{ required: true, message: 'Give the plot a name' }]}
            >
              <Input placeholder="e.g. North Field" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="surveyNumber" label="Survey Number">
              <Input placeholder="e.g. 142/3B" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="areaAcres"
              label="Area (Acres)"
              rules={[{ required: true, message: 'Area is required' }]}
            >
              <InputNumber min={0.01} step={0.25} style={{ width: '100%', borderRadius: 8 }} placeholder="e.g. 3.5" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="currentCrop" label="Current Standing Crop">
              <Input placeholder="e.g. Wheat" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item label="Plot GPS Coordinates">
              <GpsField value={gps} onChange={setGps} />
            </Form.Item>
          </Col>
        </Row>
      </div>

      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: '16px 18px',
          marginBottom: 16,
          boxShadow: '0 1px 2px 0 rgba(15, 23, 42, 0.03)',
        }}
      >
        <Typography.Text strong style={{ fontSize: 14, color: '#0f172a', display: 'block', marginBottom: 12 }}>
          Soil, Irrigation & Timeline
        </Typography.Text>
        <Row gutter={[14, 0]}>
          <Col xs={24} md={8}>
            <Form.Item name="soilType" label="Soil Type">
              <Select
                allowClear
                showSearch
                placeholder="Select soil"
                style={{ borderRadius: 8 }}
                options={SOIL_TYPES.map((value) => ({ value, label: value }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="irrigationType" label="Irrigation Method">
              <Select
                allowClear
                showSearch
                placeholder="Select irrigation"
                style={{ borderRadius: 8 }}
                options={IRRIGATION_TYPES.map((value) => ({ value, label: value }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="waterSource" label="Water Source">
              <Select
                allowClear
                showSearch
                placeholder="Select source"
                style={{ borderRadius: 8 }}
                options={WATER_SOURCES.map((value) => ({ value, label: value }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="sowingDate" label="Sowing Date">
              <DatePicker style={{ width: '100%', borderRadius: 8 }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="expectedHarvest"
              label="Expected Harvest Date"
              extra="Drives pre-harvest gate schedule"
            >
              <DatePicker style={{ width: '100%', borderRadius: 8 }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="notes" label="Additional Notes">
              <Input.TextArea rows={2} maxLength={500} showCount placeholder="Optional soil health or boundary notes" style={{ borderRadius: 8 }} />
            </Form.Item>
          </Col>
        </Row>
      </div>

      {plot ? (
        <Button block danger icon={<DeleteOutlined />} onClick={confirmDelete} style={{ borderRadius: 8, height: 40, marginTop: 4 }}>
          Delete this plot
        </Button>
      ) : null}
    </Form>
  );

  const headerContent = (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 50%, #f7fee7 100%)',
        margin: '-16px -24px -16px -24px',
        padding: '18px 24px',
        borderRadius: isMobile ? 0 : '14px 14px 0 0',
        borderBottom: '1px solid #e2e8f0',
      }}
    >
      <svg
        viewBox="0 0 600 160"
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '100%',
          height: '100%',
          opacity: 0.45,
          pointerEvents: 'none',
        }}
      >
        <path d="M0,0 L600,0 L600,80 C480,140 420,20 320,110 C240,180 140,40 0,90 Z" fill="#d9f99d" />
        <path d="M0,0 L600,0 L600,40 C490,90 390,-10 280,70 C190,130 90,20 0,60 Z" fill="#a7f3d0" />
        <circle cx="50" cy="30" r="14" fill="none" stroke="#65a30d" strokeWidth="2" opacity="0.35" />
      </svg>

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#059669',
            fontSize: 20,
            boxShadow: '0 2px 8px rgba(5, 150, 105, 0.15)',
            border: '1px solid #a7f3d0',
            flexShrink: 0,
          }}
        >
          <EnvironmentOutlined />
        </div>
        <div>
          <Typography.Title level={4} style={{ margin: 0, color: '#0f172a', fontWeight: 700, letterSpacing: '-0.01em' }}>
            {plot ? `Edit Plot — ${plot.name}` : 'Map New Farm Plot'}
          </Typography.Title>
          <Typography.Text style={{ color: '#475569', fontSize: 13, display: 'block', marginTop: 2 }}>
            Record boundary coordinates, acreage, standing crop, and soil profile
          </Typography.Text>
        </div>
      </div>
    </div>
  );

  const isPending = create.isPending || update.isPending;

  if (isMobile) {
    return (
      <Drawer
        open={open}
        onClose={onClose}
        title={headerContent}
        placement="top"
        height="100vh"
        styles={{
          body: { background: '#f8fafc', padding: '14px 14px 80px 14px' },
          header: { borderBottom: '1px solid #e2e8f0' },
        }}
        footer={
          <div style={{ display: 'flex', gap: 10 }}>
            <Button block style={{ height: 44, borderRadius: 10 }} onClick={onClose}>
              Cancel
            </Button>
            <Button
              block
              type="primary"
              loading={isPending}
              onClick={submit}
              style={{
                height: 44,
                borderRadius: 10,
                fontWeight: 600,
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                boxShadow: '0 2px 8px 0 rgba(16, 185, 129, 0.3)',
              }}
            >
              {plot ? 'Save Changes' : 'Save Plot'}
            </Button>
          </div>
        }
        destroyOnClose
      >
        {formContent}
      </Drawer>
    );
  }

  return (
    <Modal
      open={open}
      title={headerContent}
      onCancel={onClose}
      width={680}
      style={{ top: 24, paddingBottom: 24 }}
      styles={{
        body: {
          background: '#f8fafc',
          padding: '16px 20px',
          maxHeight: 'calc(90vh - 130px)',
          overflowY: 'auto',
          margin: '0 -24px',
          paddingInline: 24,
        },
        header: {
          padding: '16px 24px',
          borderBottom: '1px solid #e2e8f0',
          marginBottom: 0,
        },
        footer: {
          padding: '14px 24px',
          borderTop: '1px solid #e2e8f0',
          margin: 0,
        },
      }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button style={{ height: 42, paddingInline: 20, borderRadius: 10 }} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="primary"
            loading={isPending}
            onClick={submit}
            style={{
              height: 42,
              paddingInline: 24,
              borderRadius: 10,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none',
              boxShadow: '0 2px 10px 0 rgba(16, 185, 129, 0.35)',
            }}
          >
            {plot ? 'Save Changes' : 'Save Plot'}
          </Button>
        </div>
      }
      destroyOnClose
    >
      {formContent}
    </Modal>
  );
}
