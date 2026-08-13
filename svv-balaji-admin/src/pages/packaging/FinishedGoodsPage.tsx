import { InboxOutlined, PrinterOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Row,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { FinishedGoodsBatch } from '../../api/types';
import { Can } from '../../components/Can';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useFinishedGoods } from '../../hooks/usePackaging';
import { useReleaseBatch } from '../../hooks/useQuality';
import { EM_DASH, formatCurrency, formatDate } from '../../utils/format';
import { FinishedGoodsFormModal } from './FinishedGoodsFormModal';
import { ProductLabelModal } from './ProductLabelModal';
import { StockFinishedGoodsModal } from './StockFinishedGoodsModal';

export function FinishedGoodsPage() {
  const { message, modal } = AntApp.useApp();
  const [released, setReleased] = useState<boolean | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [labelOf, setLabelOf] = useState<FinishedGoodsBatch | null>(null);
  const [stocking, setStocking] = useState<FinishedGoodsBatch | null>(null);

  const batches = useFinishedGoods(released === undefined ? {} : { qaReleased: released });
  const release = useReleaseBatch();

  const handleRelease = (batch: FinishedGoodsBatch) => {
    modal.confirm({
      title: `Release ${batch.fgBatchNumber}?`,
      content:
        'This clears the batch for stocking and dispatch. It is refused unless the most recent finished-goods inspection on this batch was a PASS.',
      okText: 'Release',
      onOk: async () => {
        try {
          await release.mutateAsync(batch.id);
          message.success(`${batch.fgBatchNumber} released`);
        } catch (error) {
          // "Batch has no finished-goods inspection - it cannot be released" is
          // exactly the guidance the user needs; pass it straight through.
          message.error(apiErrorMessage(error, 'Could not release the batch'), 8);
        }
      },
    });
  };

  const columns: ColumnsType<FinishedGoodsBatch> = [
    {
      title: 'Batch',
      key: 'fgBatchNumber',
      width: 170,
      render: (_, batch) => (
        <Space direction="vertical" size={0}>
          <Typography.Text code>{batch.fgBatchNumber}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            from {batch.productionBatch?.productionBatchNumber ?? EM_DASH}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Product',
      key: 'product',
      render: (_, batch) => batch.product?.name ?? EM_DASH,
    },
    {
      title: 'Pack',
      key: 'pack',
      render: (_, batch) => (
        <span>
          {batch.netWeight} {batch.weightUnit} · {batch.packagingType}
        </span>
      ),
    },
    {
      title: 'Packs',
      dataIndex: 'packCount',
      key: 'packCount',
      align: 'right',
      width: 90,
    },
    {
      title: 'MRP',
      dataIndex: 'mrp',
      key: 'mrp',
      align: 'right',
      render: (value: string | null) => formatCurrency(value),
    },
    {
      title: 'Manufactured',
      dataIndex: 'manufacturingDate',
      key: 'manufacturingDate',
      render: (value: string) => formatDate(value),
      sorter: (a, b) => a.manufacturingDate.localeCompare(b.manufacturingDate),
    },
    {
      title: 'Expires',
      dataIndex: 'expiryDate',
      key: 'expiryDate',
      render: (value: string | null) => formatDate(value),
    },
    {
      title: 'QA',
      dataIndex: 'qaReleased',
      key: 'qaReleased',
      width: 140,
      render: (releasedFlag: boolean) =>
        releasedFlag ? (
          <Tag color="green">Released</Tag>
        ) : (
          <Tooltip title="Cannot be stocked, allocated or dispatched until released">
            <Tag color="gold">Awaiting QA</Tag>
          </Tooltip>
        ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 250,
      fixed: 'right',
      render: (_, batch) => (
        <Space size={4}>
          <Button size="small" icon={<PrinterOutlined />} onClick={() => setLabelOf(batch)}>
            Label
          </Button>
          {!batch.qaReleased ? (
            <Can do="QUALITY_RELEASE">
              <Button
                size="small"
                type="primary"
                icon={<SafetyCertificateOutlined />}
                loading={release.isPending}
                onClick={() => handleRelease(batch)}
              >
                Release
              </Button>
            </Can>
          ) : (
            <Can do="PACKAGING_CREATE">
              <Button size="small" icon={<InboxOutlined />} onClick={() => setStocking(batch)}>
                Stock
              </Button>
            </Can>
          )}
        </Space>
      ),
    },
  ];

  const awaiting = (batches.data?.data ?? []).filter((b) => !b.qaReleased).length;

  const toolbar = (
    <Row gutter={[12, 12]}>
      <Col xs={24} md={8}>
        <Select<string>
          allowClear
          style={{ width: '100%' }}
          placeholder="QA status"
          value={released === undefined ? undefined : released ? 'released' : 'awaiting'}
          onChange={(value) =>
            setReleased(value === undefined ? undefined : value === 'released')
          }
          options={[
            { value: 'released', label: 'Released' },
            { value: 'awaiting', label: 'Awaiting QA' },
          ]}
        />
      </Col>
    </Row>
  );

  return (
    <Card>
      <PageHeader
        title="Finished goods"
        subtitle="Packed batches (FRD Sections 22–23). The batch number here is what the consumer QR code on the packaging resolves to."
        actions={
          <Can do="PACKAGING_CREATE">
            <Button type="primary" onClick={() => setFormOpen(true)}>
              Pack a run
            </Button>
          </Can>
        }
      />

      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {awaiting > 0 ? (
          <Alert
            type="warning"
            showIcon
            message={`${awaiting} batch${awaiting === 1 ? '' : 'es'} awaiting QA release`}
            description="A batch must pass a finished-goods inspection and then be released before it can be stocked or sold."
          />
        ) : null}

        <DataTable<FinishedGoodsBatch>
          rows={batches.data?.data}
          columns={columns}
          rowKey="id"
          isLoading={batches.isLoading}
          isFetching={batches.isFetching}
          error={batches.error}
          onRetry={() => void batches.refetch()}
          toolbar={toolbar}
          emptyText="Nothing packed yet — complete a production run first"
        />
      </Space>

      <FinishedGoodsFormModal open={formOpen} onClose={() => setFormOpen(false)} />
      <ProductLabelModal batch={labelOf} onClose={() => setLabelOf(null)} />
      <StockFinishedGoodsModal batch={stocking} onClose={() => setStocking(null)} />
    </Card>
  );
}
