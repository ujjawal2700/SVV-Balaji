import { Card, Col, Row, Space, Switch, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PAYMENT_TERMS_LABEL, type ReceivablesRow } from '@shared/api/receivables';
import { useAuth } from '@shared/auth/useAuth';
import { DataTable } from '@shared/components/DataTable';
import { PageHeader } from '@shared/components/PageHeader';
import { BranchSelect } from '@shared/components/pickers';
import { useReceivables } from '@shared/hooks/useReceivables';
import { AgeingBar, inr } from './CreditAccountPanel';

const { Text } = Typography;

/**
 * Who owes what on B2B credit, most overdue first. Each row opens the retailer's
 * credit tab (open bills, statement, record payment).
 */
export function ReceivablesPage() {
  const { user } = useAuth();
  const [branchId, setBranchId] = useState<string | undefined>();
  const [overdueOnly, setOverdueOnly] = useState(false);
  const q = useReceivables({ branchId, overdueOnly });
  const data = q.data;
  const rows = data?.customers ?? [];

  const columns: ColumnsType<ReceivablesRow> = [
    {
      title: 'Customer',
      key: 'customer',
      render: (_, r) => (
        <div>
          <Link to={`/b2b-customers/${r.customerId}?tab=credit`} style={{ fontWeight: 600 }}>{r.name}</Link>
          <div><Text type="secondary" style={{ fontSize: 12 }}>{r.customerCode} · {r.phone}</Text></div>
        </div>
      ),
    },
    { title: 'Terms', dataIndex: 'paymentTerms', render: (t: ReceivablesRow['paymentTerms']) => <Tag style={{ margin: 0 }}>{PAYMENT_TERMS_LABEL[t]}</Tag> },
    { title: 'Limit', dataIndex: 'creditLimit', align: 'right', render: (v: number | null) => (v === null ? '—' : inr(v)) },
    { title: 'Outstanding', dataIndex: 'outstanding', align: 'right', sorter: (a, b) => a.outstanding - b.outstanding, render: (v: number) => <Text strong>{inr(v)}</Text> },
    {
      title: 'Overdue',
      dataIndex: 'overdue',
      align: 'right',
      sorter: (a, b) => a.overdue - b.overdue,
      render: (v: number, r) => (v > 0 ? <Text strong type="danger">{inr(v)} <Text type="secondary" style={{ fontSize: 12 }}>({r.overdueBills})</Text></Text> : '—'),
    },
    {
      title: 'Oldest overdue',
      dataIndex: 'oldestOverdueDays',
      align: 'right',
      sorter: (a, b) => a.oldestOverdueDays - b.oldestOverdueDays,
      defaultSortOrder: 'descend',
      render: (v: number) => (v > 0 ? <Tag color={v > 60 ? 'red' : v > 30 ? 'orange' : 'gold'} style={{ margin: 0 }}>{v} days</Tag> : '—'),
    },
    { title: 'Open bills', dataIndex: 'openBills', align: 'right' },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="Receivables"
        subtitle={`What B2B customers owe on credit and what is overdue. Due dates count from ${data?.creditPeriodStart === 'ORDER_DATE' ? 'the order date' : 'dispatch'} (Checkout & Delivery settings).`}
      />

      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Card size="small" style={{ borderRadius: 12 }}>
            <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase' }}>Outstanding</Text>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{inr(data?.totals.outstanding ?? 0)}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>{rows.length} customer{rows.length === 1 ? '' : 's'}</Text>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ borderRadius: 12 }}>
            <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase' }}>Overdue</Text>
            <div style={{ fontSize: 22, fontWeight: 700, color: (data?.totals.overdue ?? 0) > 0 ? '#dc2626' : undefined }}>{inr(data?.totals.overdue ?? 0)}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>{rows.filter((r) => r.overdue > 0).length} customers overdue</Text>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          {data ? <AgeingBar ageing={data.ageing} total={data.totals.outstanding} /> : null}
        </Col>
      </Row>

      <Card size="small" style={{ borderRadius: 10 }}>
        <Space wrap size={16}>
          {user?.role === 'SUPER_ADMIN' ? (
            <BranchSelect allowClear placeholder="All branches" value={branchId} onChange={setBranchId} style={{ width: 220 }} />
          ) : null}
          <Space>
            <Switch size="small" checked={overdueOnly} onChange={setOverdueOnly} />
            <Text>Overdue only</Text>
          </Space>
        </Space>
      </Card>

      <DataTable<ReceivablesRow>
        rows={rows}
        columns={columns}
        rowKey="customerId"
        isLoading={q.isLoading}
        isFetching={q.isFetching}
        error={q.error}
        onRetry={() => void q.refetch()}
        emptyText={overdueOnly ? 'Nothing overdue' : 'No customer owes anything on credit'}
      />
    </Space>
  );
}
