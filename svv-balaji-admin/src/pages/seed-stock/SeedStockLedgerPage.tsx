import {
  ArrowLeftOutlined,
  MinusCircleOutlined,
  PlusCircleOutlined,
  ReloadOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Result,
  Row,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiErrorMessage } from '@shared/api/client';
import type { SeedStockLot, SeedStockMovement, SeedStockMovementType } from '@shared/api/types';
import { useCan } from '@shared/auth/useCan';
import { useSeedStockLot } from '@shared/hooks/useSeedStock';
import { EM_DASH, formatDate, formatDateTime } from '@shared/utils/format';
import { ChangeQuantitySheet, isExpired, MOVEMENT, qty, TransferSheet } from './SeedStockPage';

const cardStyle = { borderRadius: 12, border: '1px solid #e2e8f0' };

/** Movements that bring stock into the lot, and ones that take it out other than to a farmer. */
const INFLOW: SeedStockMovementType[] = ['RECEIPT', 'TRANSFER_IN'];
const HANDOUT: SeedStockMovementType[] = ['DISTRIBUTION', 'DISTRIBUTION_REVERSAL'];
const OTHER_OUT: SeedStockMovementType[] = ['ADJUSTMENT', 'WRITE_OFF', 'TRANSFER_OUT'];

/**
 * One lot's stock ledger, as a page of its own (/seed-stock/:id) so it can be
 * linked, bookmarked and opened in a new tab.
 *
 * Every figure here is derived from the movements the server returns — the
 * summary tiles are sums of the same rows the table shows, so they cannot
 * disagree with it.
 */
export function SeedStockLedgerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canManage = useCan('SEED_STOCK_MANAGE');
  const lot = useSeedStockLot(id);
  const [typeFilter, setTypeFilter] = useState<SeedStockMovementType | undefined>();
  const [change, setChange] = useState<{ lot: SeedStockLot; mode: 'receive' | 'adjust' } | null>(null);
  const [transferFor, setTransferFor] = useState<SeedStockLot | null>(null);

  const d = lot.data;
  const movements = d?.movements ?? [];

  const summary = useMemo(() => {
    const sum = (types: SeedStockMovementType[]) =>
      movements.filter((m) => types.includes(m.type)).reduce((total, m) => total + Number(m.quantity), 0);
    // A recount can go either way; upward ones count as stock in, not as a negative "out".
    const other = movements.filter((m) => OTHER_OUT.includes(m.type)).map((m) => Number(m.quantity));
    return {
      received: sum(INFLOW) + other.filter((n) => n > 0).reduce((a, n) => a + n, 0),
      // Handouts are negative, reversals positive: the net is what farmers kept.
      issued: -sum(HANDOUT),
      otherOut: -other.filter((n) => n < 0).reduce((a, n) => a + n, 0),
      handouts: movements.filter((m) => m.type === 'DISTRIBUTION').length,
    };
  }, [movements]);

  const presentTypes = useMemo(
    () => Array.from(new Set(movements.map((m) => m.type))),
    [movements],
  );
  const rows = typeFilter ? movements.filter((m) => m.type === typeFilter) : movements;

  const back = (
    <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/seed-stock')} style={{ paddingInline: 4 }}>
      Seed Stock
    </Button>
  );

  if (lot.isLoading) {
    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {back}
        <Card style={cardStyle}>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      </Space>
    );
  }

  if (lot.error || !d) {
    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {back}
        <Card style={cardStyle}>
          <Result
            status="404"
            title="Lot not found"
            subTitle={lot.error ? apiErrorMessage(lot.error) : 'This seed stock lot does not exist or is not at your branch.'}
            extra={
              <Button type="primary" onClick={() => navigate('/seed-stock')}>
                Back to Seed Stock
              </Button>
            }
          />
        </Card>
      </Space>
    );
  }

  const expired = isExpired(d);
  const onHand = Number(d.quantityOnHand);

  const columns: ColumnsType<SeedStockMovement> = [
    {
      title: 'Date & time',
      dataIndex: 'createdAt',
      width: 180,
      render: (v: string) => <Typography.Text style={{ whiteSpace: 'nowrap' }}>{formatDateTime(v)}</Typography.Text>,
    },
    {
      title: 'Movement',
      dataIndex: 'type',
      width: 190,
      render: (t: SeedStockMovementType) => (
        <Tag color={MOVEMENT[t].color} style={{ borderRadius: 6, marginInlineEnd: 0 }}>
          {MOVEMENT[t].label}
        </Tag>
      ),
    },
    {
      title: 'Details',
      key: 'details',
      render: (_, m) => (
        <div style={{ minWidth: 180 }}>
          {m.farmer ? (
            <div style={{ fontWeight: 500 }}>
              {m.farmer.fullName}
              {m.farmer.farmerCode ? (
                <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>
                  {m.farmer.farmerCode}
                </Typography.Text>
              ) : null}
            </div>
          ) : null}
          {m.reason ? (
            <Typography.Text type={m.farmer ? 'secondary' : undefined} style={{ fontSize: m.farmer ? 12 : 14 }}>
              {m.reason}
            </Typography.Text>
          ) : null}
          {m.relatedSeedStockId ? (
            <div>
              <Link to={`/seed-stock/${m.relatedSeedStockId}`} style={{ fontSize: 12 }}>
                {m.type === 'TRANSFER_OUT' ? 'View receiving lot' : 'View sending lot'} →
              </Link>
            </div>
          ) : null}
          {!m.farmer && !m.reason && !m.relatedSeedStockId ? EM_DASH : null}
        </div>
      ),
    },
    {
      title: `Change (${d.unit})`,
      dataIndex: 'quantity',
      align: 'right',
      width: 130,
      render: (v: string) => {
        const n = Number(v);
        if (n === 0) return <Typography.Text type="secondary">{EM_DASH}</Typography.Text>;
        return (
          <Typography.Text strong type={n < 0 ? 'danger' : 'success'} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {n > 0 ? '+' : '−'}
            {Math.abs(n).toLocaleString('en-IN')}
          </Typography.Text>
        );
      },
    },
    {
      title: `Balance (${d.unit})`,
      dataIndex: 'balanceAfter',
      align: 'right',
      width: 130,
      render: (v: string) => (
        <Typography.Text style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(v).toLocaleString('en-IN')}</Typography.Text>
      ),
    },
    {
      title: 'Recorded by',
      key: 'by',
      width: 170,
      render: (_, m) => m.performedBy?.fullName ?? EM_DASH,
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {back}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Space size={10} wrap align="center">
            <Typography.Title level={4} className="page-title" style={{ margin: 0 }}>
              {d.seedName}
              {d.seedVariety ? <span style={{ color: '#64748b', fontWeight: 500 }}> · {d.seedVariety}</span> : null}
            </Typography.Title>
            {!d.isActive ? (
              <Tag>Withdrawn</Tag>
            ) : expired ? (
              <Tag color="red">Expired</Tag>
            ) : onHand === 0 ? (
              <Tag color="orange">Empty</Tag>
            ) : (
              <Tag color="green">Active</Tag>
            )}
          </Space>
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
            Stock ledger{d.batchNumber ? ` · Lot ${d.batchNumber}` : ''} · {d.branch?.name ?? EM_DASH}
          </Typography.Text>
        </div>

        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => void lot.refetch()} loading={lot.isFetching}>
            Refresh
          </Button>
          {canManage ? (
            <>
              <Button icon={<PlusCircleOutlined />} disabled={!d.isActive} onClick={() => setChange({ lot: d, mode: 'receive' })}>
                Receive more
              </Button>
              <Button icon={<MinusCircleOutlined />} onClick={() => setChange({ lot: d, mode: 'adjust' })}>
                Recount / write off
              </Button>
              <Button
                type="primary"
                icon={<SwapOutlined />}
                disabled={!d.isActive || onHand <= 0}
                onClick={() => setTransferFor(d)}
              >
                Transfer
              </Button>
            </>
          ) : null}
        </Space>
      </div>

      {expired && d.isActive ? (
        <Alert
          type="error"
          showIcon
          message={`This lot expired on ${formatDate(d.expiryDate)}. It can no longer be issued to farmers — write off what is left.`}
        />
      ) : null}

      {/* Summary */}
      <Row gutter={[12, 12]}>
        <SummaryTile label="On hand" value={qty(onHand, d.unit)} accent={onHand === 0 ? '#dc2626' : '#059669'} emphasis />
        <SummaryTile label="Received" value={qty(summary.received, d.unit)} hint="Deliveries, transfers in, recounts up" />
        <SummaryTile
          label="Issued to farmers"
          value={qty(summary.issued, d.unit)}
          hint={`${summary.handouts} handout${summary.handouts === 1 ? '' : 's'}`}
        />
        <SummaryTile label="Other out" value={qty(summary.otherOut, d.unit)} hint="Write-offs, recounts, transfers out" />
      </Row>

      <Row gutter={[16, 16]}>
        {/* Lot details */}
        <Col xs={24} xl={8}>
          <Card title="Lot details" style={cardStyle} styles={{ body: { paddingTop: 8 } }}>
            <Descriptions
              column={1}
              size="small"
              labelStyle={{ color: '#64748b', width: 130 }}
              items={[
                { key: 'seed', label: 'Seed / input', children: d.seedName },
                { key: 'variety', label: 'Variety', children: d.seedVariety ?? EM_DASH },
                { key: 'lot', label: 'Lot / cert. no.', children: d.batchNumber ? <Typography.Text code>{d.batchNumber}</Typography.Text> : EM_DASH },
                { key: 'branch', label: 'Branch', children: d.branch?.name ?? EM_DASH },
                { key: 'supplier', label: 'Supplier', children: d.supplier ?? EM_DASH },
                { key: 'received', label: 'Received on', children: formatDate(d.receivedAt) },
                {
                  key: 'expiry',
                  label: 'Expiry',
                  children: d.expiryDate ? (
                    <Typography.Text type={expired ? 'danger' : undefined}>{formatDate(d.expiryDate)}</Typography.Text>
                  ) : (
                    EM_DASH
                  ),
                },
                { key: 'by', label: 'Received by', children: d.createdBy?.fullName ?? EM_DASH },
                { key: 'notes', label: 'Notes', children: d.notes ?? EM_DASH },
              ]}
            />
          </Card>
        </Col>

        {/* Movements */}
        <Col xs={24} xl={16}>
          <Card
            style={cardStyle}
            styles={{ body: { padding: 0 } }}
            title={
              <Space size={8}>
                Movements
                <Tag style={{ borderRadius: 999, marginInlineEnd: 0 }}>{movements.length}</Tag>
              </Space>
            }
            extra={
              <Select
                allowClear
                placeholder="All movements"
                value={typeFilter}
                onChange={setTypeFilter}
                style={{ width: 200 }}
                options={presentTypes.map((t) => ({ value: t, label: MOVEMENT[t].label }))}
              />
            }
          >
            <Table<SeedStockMovement>
              rowKey="id"
              columns={columns}
              dataSource={rows}
              size="middle"
              scroll={{ x: 860 }}
              pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
              locale={{ emptyText: typeFilter ? 'No movements of this type' : 'No movements recorded yet' }}
            />
          </Card>
        </Col>
      </Row>

      <ChangeQuantitySheet change={change} onClose={() => setChange(null)} />
      <TransferSheet lot={transferFor} onClose={() => setTransferFor(null)} />
    </Space>
  );
}

function SummaryTile({
  label,
  value,
  hint,
  accent = '#0f172a',
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
  emphasis?: boolean;
}) {
  return (
    <Col xs={12} lg={6}>
      <Card
        size="small"
        style={{ ...cardStyle, height: '100%', borderTop: emphasis ? `3px solid ${accent}` : cardStyle.border }}
        styles={{ body: { padding: '14px 16px' } }}
      >
        <Typography.Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {label}
        </Typography.Text>
        <div style={{ fontSize: 22, fontWeight: 700, color: accent, lineHeight: 1.3, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </div>
        {hint ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {hint}
          </Typography.Text>
        ) : null}
      </Card>
    </Col>
  );
}
