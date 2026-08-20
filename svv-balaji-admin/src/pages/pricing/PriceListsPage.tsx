import { SwapOutlined } from '@ant-design/icons';
import { Alert, App as AntApp, Button, Card, Col, Row, Select, Space, Switch, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { CustomerType, PriceList, PriceListQuery, SalesChannel } from '@shared/api/types';
import { CUSTOMER_TYPES, SALES_CHANNELS } from '@shared/api/types';
import { Can } from '@shared/components/Can';
import { DataTable } from '@shared/components/DataTable';
import { PageHeader } from '@shared/components/PageHeader';
import { ProductSelect } from '@shared/components/pickers';
import { usePriceLists, useSetPriceActive } from '@shared/hooks/usePricing';
import { EM_DASH, formatCurrency, formatDate } from '@shared/utils/format';
import { PriceFormModal } from './PriceFormModal';
import { SupersedePriceModal } from './SupersedePriceModal';

const CHANNEL_COLOUR: Record<SalesChannel, string> = { B2B: 'blue', B2C: 'purple' };

/**
 * Dated price rules (FRD Section 25).
 *
 * The mental model this screen has to teach is that a price is a rule with a
 * date range, not a number on a product. So: no edit button anywhere, a
 * "Current"/"Superseded" column carrying the state, and superseded rows kept
 * visible rather than filtered away by default — the history IS the feature.
 */
export function PriceListsPage() {
  const { message } = AntApp.useApp();
  const [query, setQuery] = useState<PriceListQuery>({ activeOnly: true });
  /**
   * Narrowed here, not on the server: GET /price-lists takes productId, channel
   * and activeOnly, and nothing else. Sending a customerType would be silently
   * dropped and the filter would appear to do nothing.
   */
  const [customerType, setCustomerType] = useState<CustomerType | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [superseding, setSuperseding] = useState<PriceList | null>(null);

  const prices = usePriceLists(query);
  const setActive = useSetPriceActive();

  // A rule with no customerType applies to every type in its channel, so it
  // stays visible whatever is selected — hiding it would misrepresent which
  // rate a customer of that type would actually get.
  const rows = (prices.data?.data ?? []).filter(
    (price) => !customerType || !price.customerType || price.customerType === customerType,
  );

  const patchQuery = (patch: Partial<PriceListQuery>) => setQuery((prev) => ({ ...prev, ...patch }));

  const handleActive = async (price: PriceList, isActive: boolean) => {
    try {
      await setActive.mutateAsync({ id: price.id, isActive });
      message.success(isActive ? 'Rule reinstated' : 'Rule withdrawn');
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not change the rule'), 8);
    }
  };

  const columns: ColumnsType<PriceList> = [
    {
      title: 'Product',
      key: 'product',
      render: (_, price) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{price.product?.name ?? EM_DASH}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {price.product?.sku ?? EM_DASH}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Applies to',
      key: 'applies',
      width: 190,
      render: (_, price) => (
        <Space direction="vertical" size={2}>
          <Tag color={CHANNEL_COLOUR[price.channel]}>{price.channel}</Tag>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {price.customerType
              ? price.customerType.charAt(0) + price.customerType.slice(1).toLowerCase()
              : 'All customer types'}
            {price.minQuantity > 1 ? ` · from ${price.minQuantity} units` : ''}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Rate',
      key: 'unitPrice',
      align: 'right',
      width: 140,
      render: (_, price) => (
        <Space direction="vertical" size={0} style={{ alignItems: 'flex-end' }}>
          <Typography.Text strong>{formatCurrency(price.unitPrice)}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            +{price.gstRatePercent}% GST
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'In force',
      key: 'window',
      width: 220,
      render: (_, price) => (
        <Space direction="vertical" size={0}>
          <span>from {formatDate(price.effectiveFrom)}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {price.effectiveTo ? `until ${formatDate(price.effectiveTo)}` : 'current'}
          </Typography.Text>
        </Space>
      ),
      sorter: (a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom),
    },
    {
      title: 'State',
      key: 'state',
      width: 130,
      render: (_, price) =>
        !price.isActive ? (
          <Tooltip title="Withdrawn — it resolves for nothing, including dates it used to cover">
            <Tag>Withdrawn</Tag>
          </Tooltip>
        ) : price.effectiveTo ? (
          <Tooltip title="Closed by a later rule. Kept so past orders still reproduce.">
            <Tag color="default">Superseded</Tag>
          </Tooltip>
        ) : (
          <Tag color="green">Current</Tag>
        ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 230,
      fixed: 'right',
      render: (_, price) => (
        <Space size={8}>
          {!price.effectiveTo && price.isActive ? (
            <Can do="PRICE_SUPERSEDE">
              <Button size="small" icon={<SwapOutlined />} onClick={() => setSuperseding(price)}>
                Change price
              </Button>
            </Can>
          ) : null}
          <Can do="PRICE_STATUS">
            <Tooltip title={price.isActive ? 'Withdraw this rule' : 'Reinstate this rule'}>
              <Switch
                size="small"
                checked={price.isActive}
                loading={setActive.isPending}
                onChange={(checked) => void handleActive(price, checked)}
              />
            </Tooltip>
          </Can>
        </Space>
      ),
    },
  ];

  const toolbar = (
    <Row gutter={[12, 12]}>
      <Col xs={24} md={8}>
        <ProductSelect
          allowClear
          placeholder="All products"
          value={query.productId}
          onChange={(value) => patchQuery({ productId: value })}
        />
      </Col>
      <Col xs={12} md={4}>
        <Select<SalesChannel>
          allowClear
          style={{ width: '100%' }}
          placeholder="Channel"
          value={query.channel}
          onChange={(value) => patchQuery({ channel: value })}
          options={SALES_CHANNELS.map((value) => ({ value, label: value }))}
        />
      </Col>
      <Col xs={12} md={5}>
        <Select
          allowClear
          style={{ width: '100%' }}
          placeholder="Customer type"
          value={customerType}
          onChange={(value) => setCustomerType(value)}
          options={CUSTOMER_TYPES.map((value) => ({
            value,
            label: value.charAt(0) + value.slice(1).toLowerCase(),
          }))}
        />
      </Col>
      <Col xs={24} md={7}>
        <Space>
          <Switch
            checked={query.activeOnly ?? false}
            onChange={(checked) => patchQuery({ activeOnly: checked || undefined })}
          />
          <Typography.Text type="secondary">Current rules only</Typography.Text>
        </Space>
      </Col>
    </Row>
  );

  return (
    <Card>
      <PageHeader
        title="Price lists"
        subtitle="Dated per-channel rates (FRD Section 25). A rate is never edited in place — changing it closes the current rule and opens a new one, so an invoice raised in June still resolves to June's price years later."
        actions={
          <Can do="PRICE_CREATE">
            <Button type="primary" onClick={() => setFormOpen(true)}>
              New price rule
            </Button>
          </Can>
        }
      />

      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="Each product carries two prices"
          description="A B2B rule and a B2C rule are independent. A product with only one of them will fail to price an order in the other channel — the order is refused rather than guessed at."
        />

        <DataTable<PriceList>
          rows={rows}
          columns={columns}
          rowKey="id"
          isLoading={prices.isLoading}
          isFetching={prices.isFetching}
          error={prices.error}
          onRetry={() => void prices.refetch()}
          toolbar={toolbar}
          emptyText="No price rules yet — create one before taking orders"
        />
      </Space>

      <PriceFormModal open={formOpen} onClose={() => setFormOpen(false)} />
      <SupersedePriceModal price={superseding} onClose={() => setSuperseding(null)} />
    </Card>
  );
}
