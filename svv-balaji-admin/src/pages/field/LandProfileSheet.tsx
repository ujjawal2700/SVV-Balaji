import { DeleteOutlined, EnvironmentOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { FarmPlot, FarmPlotInput } from '../../api/farmPlots';
import type { Farmer } from '../../api/types';
import { useCan } from '../../auth/useCan';
import { Sheet } from '../../components/Sheet';
import {
  useCreateFarmPlot,
  useDeleteFarmPlot,
  useFarmPlotSummary,
  useFarmPlots,
  useUpdateFarmPlot,
} from '../../hooks/useFarmPlots';
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

    const input: FarmPlotInput = {
      name: values.name,
      surveyNumber: values.surveyNumber,
      areaAcres: values.areaAcres,
      soilType: values.soilType,
      irrigationType: values.irrigationType,
      waterSource: values.waterSource,
      currentCrop: values.currentCrop,
      sowingDate: values.sowingDate ? values.sowingDate.format('YYYY-MM-DD') : undefined,
      expectedHarvest: values.expectedHarvest
        ? values.expectedHarvest.format('YYYY-MM-DD')
        : undefined,
      gpsLocation: gps || undefined,
      notes: values.notes,
    };

    try {
      if (plot) await update.mutateAsync({ plotId: plot.id, input });
      else await create.mutateAsync(input);
      message.success(plot ? 'Plot updated' : 'Plot added');
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not save the plot'), 10);
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

  return (
    <Sheet
      open={open}
      title={plot ? `Edit ${plot.name}` : 'Add a plot'}
      onOk={submit}
      onCancel={onClose}
      confirmLoading={create.isPending || update.isPending}
      okText={plot ? 'Save' : 'Add plot'}
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item
          name="name"
          label="What the farmer calls it"
          rules={[{ required: true, message: 'Give the plot a name you would recognise again' }]}
        >
          <Input placeholder="North field" size="large" />
        </Form.Item>

        <Form.Item name="surveyNumber" label="Survey number">
          <Input placeholder="142/3B" size="large" />
        </Form.Item>

        <Form.Item
          name="areaAcres"
          label="Area (acres)"
          rules={[{ required: true, message: 'Area is what makes the plot list add up' }]}
        >
          <InputNumber min={0.01} step={0.25} style={{ width: '100%' }} size="large" />
        </Form.Item>

        <Form.Item label="Location on the plot">
          <GpsField value={gps} onChange={setGps} />
        </Form.Item>

        <Form.Item name="currentCrop" label="Growing now">
          <Input placeholder="Wheat" size="large" />
        </Form.Item>

        <Form.Item name="soilType" label="Soil">
          <Select
            allowClear
            showSearch
            size="large"
            placeholder="Black cotton"
            options={SOIL_TYPES.map((value) => ({ value, label: value }))}
          />
        </Form.Item>

        <Form.Item name="irrigationType" label="Irrigation">
          <Select
            allowClear
            showSearch
            size="large"
            placeholder="Rain-fed"
            options={IRRIGATION_TYPES.map((value) => ({ value, label: value }))}
          />
        </Form.Item>

        <Form.Item name="waterSource" label="Water source">
          <Select
            allowClear
            showSearch
            size="large"
            placeholder="Borewell"
            options={WATER_SOURCES.map((value) => ({ value, label: value }))}
          />
        </Form.Item>

        <Form.Item name="sowingDate" label="Sown">
          <DatePicker style={{ width: '100%' }} size="large" format="DD MMM YYYY" />
        </Form.Item>

        <Form.Item
          name="expectedHarvest"
          label="Harvest expected"
          extra="Drives the harvest reminder on your home screen."
        >
          <DatePicker style={{ width: '100%' }} size="large" format="DD MMM YYYY" />
        </Form.Item>

        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={2} maxLength={500} showCount />
        </Form.Item>

        {plot ? (
          <Button block danger icon={<DeleteOutlined />} onClick={confirmDelete}>
            Delete this plot
          </Button>
        ) : null}
      </Form>
    </Sheet>
  );
}
