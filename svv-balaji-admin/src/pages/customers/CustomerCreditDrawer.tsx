import { Alert, Descriptions, Drawer, Progress, Space, Spin, Tag, Typography } from 'antd';
import { apiErrorMessage } from '@shared/api/client';
import type { Customer } from '@shared/api/types';
import { useCustomerCredit } from '@shared/hooks/useCustomers';
import { EM_DASH, formatCurrency } from '@shared/utils/format';

/**
 * Where a B2B account stands against its limit.
 *
 * Outstanding counts every confirmed-and-beyond order that has not been paid,
 * not just overdue ones — that is the figure the server checks when the next
 * order is confirmed, so it is the figure the sales executive needs to see
 * before promising anything.
 */
export function CustomerCreditDrawer({
  customer,
  onClose,
}: {
  customer: Customer | null;
  onClose: () => void;
}) {
  const credit = useCustomerCredit(customer?.id, customer?.channel === 'B2B');

  const limit = credit.data?.creditLimit ?? null;
  const outstanding = credit.data?.outstanding ?? 0;
  const available = credit.data?.availableCredit ?? null;
  const usedPercent = limit && limit > 0 ? Math.min(100, Math.round((outstanding / limit) * 100)) : 0;

  return (
    <Drawer
      open={Boolean(customer)}
      onClose={onClose}
      width={480}
      title={customer ? `Credit — ${customer.name}` : 'Credit'}
    >
      {credit.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
          <Spin />
        </div>
      ) : credit.error ? (
        <Alert type="error" showIcon message="Could not load the credit position" description={apiErrorMessage(credit.error)} />
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {limit === null ? (
            <Alert
              type="info"
              showIcon
              message="No credit limit set"
              description="This account is prepaid: every order has to be paid before it can be dispatched. Set a limit on the customer record to allow credit."
            />
          ) : (
            <Progress
              percent={usedPercent}
              status={usedPercent >= 100 ? 'exception' : usedPercent >= 80 ? 'active' : 'normal'}
              format={(value) => `${value}% used`}
            />
          )}

          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Customer">
              <Space direction="vertical" size={0}>
                <Typography.Text strong>{customer?.name}</Typography.Text>
                <Typography.Text code>{customer?.customerCode}</Typography.Text>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Payment terms">
              <Tag>{customer?.paymentTerms.replace('_', ' ')}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Credit limit">
              {limit === null ? EM_DASH : formatCurrency(limit)}
            </Descriptions.Item>
            <Descriptions.Item label="Outstanding">
              <Typography.Text type={outstanding > 0 ? 'warning' : undefined}>
                {formatCurrency(outstanding)}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="Available">
              {available === null ? (
                EM_DASH
              ) : (
                <Typography.Text type={available <= 0 ? 'danger' : 'success'} strong>
                  {formatCurrency(available)}
                </Typography.Text>
              )}
            </Descriptions.Item>
          </Descriptions>

          {available !== null && available <= 0 ? (
            <Alert
              type="warning"
              showIcon
              message="Limit reached"
              description="The next order will be refused at confirmation until something is paid or the limit is raised."
            />
          ) : null}
        </Space>
      )}
    </Drawer>
  );
}
