import { RetweetOutlined, RollbackOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Skeleton, Tag, Typography } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { RETURN_STATUS_COLOR, returnsApi } from '../api/returns';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * On a delivered order: per item, whether it can still be returned or exchanged
 * (and until when), plus every request already raised for it. The server
 * decides eligibility; this only shows its answer.
 */
export function OrderReturnsCard({ orderNumber }: { orderNumber: string }) {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['storefront', 'returns', 'eligibility', orderNumber], queryFn: () => returnsApi.eligibility(orderNumber), retry: false });

  if (q.isLoading) return <Card title="Returns & exchanges"><Skeleton active paragraph={{ rows: 2 }} /></Card>;
  if (!q.data) return null;
  const e = q.data;

  return (
    <Card title={<span><RollbackOutlined /> Returns &amp; exchanges</span>}>
      {e.items.map((i) => {
        const can = i.return.eligible || i.exchange.eligible;
        const closes = [i.return.eligible ? i.return.closesAt : null, i.exchange.eligible ? i.exchange.closesAt : null].filter(Boolean) as string[];
        return (
          <div key={i.orderItemId} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Typography.Text strong ellipsis style={{ display: 'block' }}>{i.name}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {can
                    ? `${i.remainingQuantity} of ${i.quantity} eligible${closes.length ? ` · until ${day(closes.sort().at(-1)!)}` : ''}`
                    : i.return.reason ?? i.exchange.reason}
                </Typography.Text>
              </div>
              {can ? (
                <Button
                  size="small"
                  icon={<RetweetOutlined />}
                  onClick={() => navigate(`/orders/${encodeURIComponent(orderNumber)}/return?item=${i.orderItemId}`)}
                  style={{ borderRadius: 8 }}
                >
                  Return / Exchange
                </Button>
              ) : null}
            </div>
            {i.requests.map((r) => (
              <Link key={r.requestNumber} to={`/returns/${r.requestNumber}`} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginTop: 6 }}>
                <Tag color={RETURN_STATUS_COLOR[r.status]} style={{ margin: 0 }}>{r.status.replace(/_/g, ' ').toLowerCase()}</Tag>
                <span>{r.type === 'RETURN' ? 'Return' : 'Exchange'} {r.requestNumber} · qty {r.quantity}</span>
              </Link>
            ))}
          </div>
        );
      })}
      {e.policy.policyText ? <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>{e.policy.policyText}</Typography.Paragraph> : null}
    </Card>
  );
}
