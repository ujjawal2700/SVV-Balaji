import { CreditCardOutlined, EditOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Card, Col, Input, Row, Select, Space, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { Customer, CustomerQuery, CustomerStatus, SalesChannel } from '@shared/api/types';
import { CUSTOMER_TYPES, SALES_CHANNELS } from '@shared/api/types';
import { Can } from '@shared/components/Can';
import { DataTable } from '@shared/components/DataTable';
import { PageHeader } from '@shared/components/PageHeader';
import { BranchSelect } from '@shared/components/pickers';
import { useCustomers, useSetCustomerStatus } from '@shared/hooks/useCustomers';
import { EM_DASH, formatCurrency } from '@shared/utils/format';
import { CustomerCreditDrawer } from './CustomerCreditDrawer';
import { CustomerFormModal } from './CustomerFormModal';

const CHANNEL_COLOUR: Record<SalesChannel, string> = { B2B: 'blue', B2C: 'purple' };

const STATUS_COLOUR: Record<CustomerStatus, string> = {
  ACTIVE: 'green',
  INACTIVE: 'default',
  BLACKLISTED: 'red',
};

const STATUS_ACTIONS: Record<CustomerStatus, { next: CustomerStatus; label: string; warning?: string }[]> = {
  ACTIVE: [
    { next: 'INACTIVE', label: 'Deactivate', warning: 'No new orders can be raised. Orders already in flight are unaffected.' },
    { next: 'BLACKLISTED', label: 'Blacklist', warning: 'No new orders, and the account is flagged everywhere it appears. Orders already in flight are unaffected.' },
  ],
  INACTIVE: [{ next: 'ACTIVE', label: 'Reactivate' }],
  BLACKLISTED: [{ next: 'ACTIVE', label: 'Remove blacklist' }],
};

/**
 * The customer registry (FRD Section 24).
 *
 * Both channels live in one table rather than two screens, because they are one
 * list to the people who use it — "who do we sell to" is a single question. The
 * channel column carries the distinction, and the filter narrows it when only
 * one side matters.
 */
export function CustomersPage() {
  const { message, modal } = AntApp.useApp();
  const [query, setQuery] = useState<CustomerQuery>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [creditOf, setCreditOf] = useState<Customer | null>(null);

  const customers = useCustomers(query);
  const setStatus = useSetCustomerStatus();

  const patchQuery = (patch: Partial<CustomerQuery>) => setQuery((prev) => ({ ...prev, ...patch }));

  const openEdit = (customer: Customer) => {
    setEditing(customer);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const handleStatus = (customer: Customer, next: CustomerStatus, warning?: string) => {
    modal.confirm({
      title: `${next === 'ACTIVE' ? 'Reactivate' : next === 'INACTIVE' ? 'Deactivate' : 'Blacklist'} ${customer.name}?`,
      content: warning ?? 'The account becomes available for new orders again.',
      okText: 'Confirm',
      okButtonProps: { danger: next === 'BLACKLISTED' },
      onOk: async () => {
        try {
          await setStatus.mutateAsync({ id: customer.id, status: next });
          message.success(`${customer.name} is now ${next.toLowerCase()}`);
        } catch (error) {
          message.error(apiErrorMessage(error, 'Could not change the status'), 8);
        }
      },
    });
  };

  const columns: ColumnsType<Customer> = [
    {
      title: 'Customer',
      key: 'name',
      render: (_, customer) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{customer.name}</Typography.Text>
          <Typography.Text code style={{ fontSize: 12 }}>
            {customer.customerCode}
          </Typography.Text>
        </Space>
      ),
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: 'Channel',
      dataIndex: 'channel',
      key: 'channel',
      width: 110,
      render: (channel: SalesChannel, customer) => (
        <Space direction="vertical" size={2}>
          <Tag color={CHANNEL_COLOUR[channel]}>{channel}</Tag>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {customer.type.charAt(0) + customer.type.slice(1).toLowerCase()}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Contact',
      key: 'contact',
      render: (_, customer) => (
        <Space direction="vertical" size={0}>
          <span>{customer.phone}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {customer.contactName ?? customer.email ?? EM_DASH}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Location',
      key: 'location',
      render: (_, customer) =>
        [customer.city, customer.district, customer.state].filter(Boolean).join(', ') || EM_DASH,
    },
    {
      title: 'GSTIN',
      dataIndex: 'gstin',
      key: 'gstin',
      width: 160,
      render: (value: string | null) =>
        value ? <Typography.Text code>{value}</Typography.Text> : EM_DASH,
    },
    {
      title: 'Credit',
      key: 'credit',
      width: 150,
      align: 'right',
      render: (_, customer) =>
        customer.channel === 'B2C' ? (
          <Tooltip title="B2C is always prepaid">
            <Typography.Text type="secondary">Prepaid</Typography.Text>
          </Tooltip>
        ) : (
          <Space direction="vertical" size={0} style={{ alignItems: 'flex-end' }}>
            <span>{customer.creditLimit ? formatCurrency(customer.creditLimit) : 'No limit'}</span>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {customer.paymentTerms.replace('_', ' ').toLowerCase()}
            </Typography.Text>
          </Space>
        ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: CustomerStatus) => <Tag color={STATUS_COLOUR[status]}>{status}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 260,
      fixed: 'right',
      render: (_, customer) => (
        <Space size={4} wrap>
          {customer.channel === 'B2B' ? (
            <Button size="small" icon={<CreditCardOutlined />} onClick={() => setCreditOf(customer)}>
              Credit
            </Button>
          ) : null}
          <Can do="CUSTOMER_EDIT">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(customer)}>
              Edit
            </Button>
          </Can>
          <Can do="CUSTOMER_STATUS">
            <>
              {STATUS_ACTIONS[customer.status].map((action) => (
                <Button
                  key={action.next}
                  size="small"
                  danger={action.next === 'BLACKLISTED'}
                  loading={setStatus.isPending}
                  onClick={() => handleStatus(customer, action.next, action.warning)}
                >
                  {action.label}
                </Button>
              ))}
            </>
          </Can>
        </Space>
      ),
    },
  ];

  const toolbar = (
    <Row gutter={[12, 12]}>
      <Col xs={24} md={7}>
        <Input.Search
          allowClear
          placeholder="Name, code, phone or GSTIN"
          onSearch={(value) => patchQuery({ search: value || undefined })}
        />
      </Col>
      <Col xs={12} md={4}>
        <Select<SalesChannel>
          allowClear
          style={{ width: '100%' }}
          placeholder="Channel"
          value={query.channel}
          onChange={(value) => patchQuery({ channel: value, type: undefined })}
          options={SALES_CHANNELS.map((value) => ({ value, label: value }))}
        />
      </Col>
      <Col xs={12} md={5}>
        <Select
          allowClear
          style={{ width: '100%' }}
          placeholder="Type"
          value={query.type}
          onChange={(value) => patchQuery({ type: value })}
          options={CUSTOMER_TYPES.map((value) => ({
            value,
            label: value.charAt(0) + value.slice(1).toLowerCase(),
          }))}
        />
      </Col>
      <Col xs={12} md={4}>
        <Select<CustomerStatus>
          allowClear
          style={{ width: '100%' }}
          placeholder="Status"
          value={query.status}
          onChange={(value) => patchQuery({ status: value })}
          options={(['ACTIVE', 'INACTIVE', 'BLACKLISTED'] as CustomerStatus[]).map((value) => ({
            value,
            label: value.charAt(0) + value.slice(1).toLowerCase(),
          }))}
        />
      </Col>
      <Col xs={12} md={4}>
        <BranchSelect
          allowClear
          placeholder="Branch"
          value={query.branchId}
          onChange={(value) => patchQuery({ branchId: value })}
        />
      </Col>
    </Row>
  );

  return (
    <Card>
      <PageHeader
        title="Customers"
        subtitle="One registry across both channels (FRD Section 24). Channel is chosen at registration and cannot be changed afterwards — it decides which price list resolves for every order the customer places."
        actions={
          <Can do="CUSTOMER_CREATE">
            <Button type="primary" onClick={() => setFormOpen(true)}>
              Register a customer
            </Button>
          </Can>
        }
      />

      <DataTable<Customer>
        rows={customers.data?.data}
        columns={columns}
        rowKey="id"
        isLoading={customers.isLoading}
        isFetching={customers.isFetching}
        error={customers.error}
        onRetry={() => void customers.refetch()}
        toolbar={toolbar}
        emptyText="No customers registered yet"
      />

      <CustomerFormModal open={formOpen} customer={editing} onClose={closeForm} />
      <CustomerCreditDrawer customer={creditOf} onClose={() => setCreditOf(null)} />
    </Card>
  );
}
