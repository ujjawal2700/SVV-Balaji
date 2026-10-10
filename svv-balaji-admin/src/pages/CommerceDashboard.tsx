import {
  AlertOutlined,
  CustomerServiceOutlined,
  InboxOutlined,
  LineChartOutlined,
  RightOutlined,
  RollbackOutlined,
  ShopOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Empty, List, Row, Space, Spin, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiErrorMessage } from '@shared/api/client';
import { reportsApi } from '@shared/api/reports';
import { inr } from '../components/charts';
import { ORDER_STATUS_COLOUR, ORDER_STATUS_LABEL } from './sales/orderStatus';

type MetricCard = (title: string, value: number | string, icon: ReactNode, color1: string, color2: string) => ReactNode;

const FULFIL_STEPS = ['PLACED', 'CONFIRMED', 'ALLOCATED', 'PACKED', 'DISPATCHED'] as const;

/** The Customer & Retail half of the dashboard. Every figure is live from GET /dashboard/commerce. */
export function CommerceDashboard({ renderMetricCard }: { renderMetricCard: MetricCard }) {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['dashboard', 'commerce'], queryFn: () => reportsApi.commerceDashboard(), refetchInterval: 60_000 });

  if (q.isLoading) return <div style={{ padding: 100, textAlign: 'center' }}><Spin size="large" /></div>;
  if (q.isError || !q.data) return <Alert type="error" showIcon message={apiErrorMessage(q.error, 'Could not load the dashboard')} />;
  const d = q.data;
  const monthLabel = dayjs(d.month.from).format('MMMM');

  const go = (label: string, path: string, extra?: ReactNode) => (
    <Button
      block
      size="large"
      style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      onClick={() => navigate(path)}
    >
      <span>{label}</span>
      <Space size={8}>{extra}<RightOutlined style={{ color: '#bfbfbf' }} /></Space>
    </Button>
  );

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <Row gutter={[24, 24]}>
        <Col xs={24} sm={12} lg={6}>
          {renderMetricCard(`Today (${d.today.orders} orders)`, inr(d.today.revenue), <LineChartOutlined />, '#1890ff', '#0050b3')}
        </Col>
        <Col xs={24} sm={12} lg={6}>
          {renderMetricCard(
            `${monthLabel}: B2B / B2C`,
            `${compact(d.month.b2b.revenue)} / ${compact(d.month.b2c.revenue)}`,
            <ShopOutlined />, '#722ed1', '#531dab',
          )}
        </Col>
        <Col xs={24} sm={12} lg={6}>
          {renderMetricCard('Orders to fulfil', d.toFulfil.total, <InboxOutlined />, '#faad14', '#d48806')}
        </Col>
        <Col xs={24} sm={12} lg={6}>
          {renderMetricCard('Open returns', d.openReturns, <WalletOutlined />, '#f5222d', '#cf1322')}
        </Col>
      </Row>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={16}>
          <Space direction="vertical" size={24} style={{ width: '100%' }}>
            <Card
              title={<span style={{ fontSize: 18, fontWeight: 600 }}>Low stock</span>}
              extra={<Space size={6}><Tag color="red">Critical {d.lowStock.critical}</Tag><Tag color="orange">Low {d.lowStock.low}</Tag></Space>}
              style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
            >
              {d.lowStock.items.length ? (
                <List
                  size="small"
                  dataSource={d.lowStock.items}
                  renderItem={(p) => (
                    <List.Item>
                      <Space direction="vertical" size={0}>
                        <Typography.Text strong>{p.name}</Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {p.sku} · reorder at {p.reorderPoint}, safety stock {p.safetyStock}
                        </Typography.Text>
                      </Space>
                      <Space>
                        <Typography.Text style={{ fontVariantNumeric: 'tabular-nums' }}>{p.available} {p.unit} sellable</Typography.Text>
                        <Tag icon={<AlertOutlined />} color={p.status === 'CRITICAL' ? 'red' : 'orange'}>{p.status === 'CRITICAL' ? 'Critical' : 'Low'}</Tag>
                      </Space>
                    </List.Item>
                  )}
                />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Every product is above its reorder point" />
              )}
            </Card>

            <Card title={<span style={{ fontSize: 18, fontWeight: 600 }}>Latest orders</span>} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              {d.recentOrders.length ? (
                <List
                  size="small"
                  dataSource={d.recentOrders}
                  renderItem={(o) => (
                    <List.Item
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/${o.channel === 'B2B' ? 'b2b' : 'b2c'}-orders/${o.id}`)}
                    >
                      <Space direction="vertical" size={0}>
                        <Typography.Text strong>{o.orderNumber}</Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {o.customer.name} · {o.channel} · {dayjs(o.createdAt).format('D MMM, HH:mm')}
                        </Typography.Text>
                      </Space>
                      <Space>
                        <Typography.Text style={{ fontVariantNumeric: 'tabular-nums' }}>{inr(o.total)}</Typography.Text>
                        <Tag color={ORDER_STATUS_COLOUR[o.status as keyof typeof ORDER_STATUS_COLOUR]}>
                          {ORDER_STATUS_LABEL[o.status as keyof typeof ORDER_STATUS_LABEL] ?? o.status}
                        </Tag>
                      </Space>
                    </List.Item>
                  )}
                />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No orders yet" />
              )}
            </Card>
          </Space>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            title={<span style={{ fontSize: 18, fontWeight: 600 }}>Needs attention</span>}
            style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', height: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              {go('Consumer orders', '/b2c-orders')}
              {go('Retailer orders', '/b2b-orders')}
              <Space wrap size={4}>
                {FULFIL_STEPS.filter((s) => d.toFulfil.byStatus[s]).map((s) => (
                  <Tag key={s} color={ORDER_STATUS_COLOUR[s]}>{ORDER_STATUS_LABEL[s]}: {d.toFulfil.byStatus[s]}</Tag>
                ))}
              </Space>
              {go('Retailer registrations', '/b2b-accounts', <Tag color={d.pendingRetailerApprovals ? 'gold' : 'default'}>{d.pendingRetailerApprovals}</Tag>)}
              {go('Support tickets', '/support-tickets', <Tag icon={<CustomerServiceOutlined />} color={d.openSupportTickets ? 'red' : 'default'}>{d.openSupportTickets}</Tag>)}
              {go('Returns & exchanges', '/returns/customers', <Tag icon={<RollbackOutlined />} color={d.openReturns ? 'orange' : 'default'}>{d.openReturns}</Tag>)}
              {go('Sales analytics', '/reports')}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {monthLabel} so far: B2B {d.month.b2b.orders} orders ({inr(d.month.b2b.revenue)}), B2C {d.month.b2c.orders} orders ({inr(d.month.b2c.revenue)}), store counters {d.month.pos.sales} sales ({inr(d.month.pos.revenue)}).
              </Typography.Text>
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}

/** ₹12.4L style, for the big tiles. */
function compact(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}k`;
  return `₹${Math.round(n)}`;
}
