import { ArrowLeftOutlined, BankOutlined, CalendarOutlined, CheckCircleFilled, FileTextOutlined, WarningFilled } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Progress, Segmented, Skeleton, Tag, Typography } from 'antd';
import { useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { creditApi, TERMS_LABEL, type CreditBill, type CreditPayment, type MyCreditAccount, type StatementLine } from '../api/credit';
import { formatInr } from '../utils/money';

const METHOD_LABEL: Record<CreditPayment['method'], string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  BANK_TRANSFER: 'Bank transfer',
  CHEQUE: 'Cheque',
  OTHER: 'Other',
};

const day = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const card = { background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0' } as const;

/**
 * Retailer credit account ("Mandi Ledger & Credit"): limit and what is left,
 * bills with their due dates and anything overdue, payments Desi Tokri has
 * recorded, and the statement of account. All from GET /storefront/credit.
 * Consumers have no credit; their balance is Desi Rewards.
 */
export function WalletPage() {
  const navigate = useNavigate();
  const { role, initialising } = useCustomerAuth();
  const [view, setView] = useState<'bills' | 'statement' | 'payments'>('bills');
  const account = useQuery({
    queryKey: ['storefront', 'credit'],
    queryFn: () => creditApi.mine(),
    enabled: role === 'RETAILER',
  });

  if (initialising) return null;
  if (role === 'GUEST') return <Navigate to="/login" replace state={{ from: '/wallet' }} />;
  if (role !== 'RETAILER') return <Navigate to="/loyalty" replace />;

  const a = account.data;

  return (
    <div style={{ background: '#f1f5f9', minHeight: '100vh', paddingBottom: 40 }}>
      <header
        style={{ background: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 100 }}
      >
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
        <Typography.Title level={5} style={{ margin: 0 }}>Mandi Ledger &amp; Credit</Typography.Title>
      </header>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {account.isLoading ? (
          <div style={{ ...card, padding: 20 }}><Skeleton active paragraph={{ rows: 4 }} /></div>
        ) : account.error || !a ? (
          <Alert type="error" showIcon message="Could not load your credit account. Pull to refresh or try again shortly." />
        ) : (
          <>
            <Position account={a} />

            {a.summary.overdue > 0 ? (
              <Alert
                type="error"
                showIcon
                icon={<WarningFilled />}
                message={`${formatInr(a.summary.overdue)} is overdue`}
                description={`${a.summary.overdueBills} bill${a.summary.overdueBills === 1 ? '' : 's'} past the due date, the oldest by ${a.summary.oldestOverdueDays} day${a.summary.oldestOverdueDays === 1 ? '' : 's'}. Please pay to keep ordering on credit.`}
              />
            ) : a.summary.nextDue ? (
              <div style={{ ...card, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <CalendarOutlined style={{ fontSize: 20, color: '#2563eb' }} />
                <div style={{ flex: 1 }}>
                  <Typography.Text strong style={{ display: 'block' }}>
                    Next payment {formatInr(a.summary.nextDue.amount)} due {day(a.summary.nextDue.dueDate)}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>Order {a.summary.nextDue.orderNumber}</Typography.Text>
                </div>
              </div>
            ) : null}

            <Segmented
              block
              value={view}
              onChange={(v) => setView(v as typeof view)}
              options={[
                { label: `Bills (${a.openBills.length})`, value: 'bills' },
                { label: 'Statement', value: 'statement' },
                { label: 'Payments', value: 'payments' },
              ]}
            />

            {view === 'bills' ? <Bills bills={a.openBills} /> : null}
            {view === 'statement' ? <Statement lines={a.statement.lines} closing={a.statement.closingBalance} /> : null}
            {view === 'payments' ? <Payments payments={a.receipts.filter((r) => !r.voided)} /> : null}

            <Typography.Text type="secondary" style={{ fontSize: 12, textAlign: 'center' }}>
              Due dates count from the day your order is {a.terms.creditPeriodStart === 'DISPATCH' ? 'dispatched' : 'placed'}.
              Payments appear here once Desi Tokri records them.
            </Typography.Text>
          </>
        )}
      </div>
    </div>
  );
}

function Position({ account: a }: { account: MyCreditAccount }) {
  const limit = a.terms.creditLimit ?? 0;
  const onCredit = a.terms.paymentTerms !== 'PREPAID' && limit > 0;
  const usedPct = limit > 0 ? Math.min(Math.round((a.summary.outstanding / limit) * 100), 100) : 0;

  return (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}><BankOutlined /> Credit available</Typography.Text>
        <Tag color="blue" style={{ margin: 0 }}>{TERMS_LABEL[a.terms.paymentTerms]}</Tag>
      </div>
      {onCredit ? (
        <>
          <Typography.Title level={2} style={{ margin: '4px 0 10px', color: a.summary.availableCredit === 0 ? '#dc2626' : '#15803d' }}>
            {formatInr(a.summary.availableCredit ?? 0)}
          </Typography.Title>
          <Progress percent={usedPct} showInfo={false} strokeColor={usedPct >= 90 ? '#dc2626' : '#ea580c'} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b' }}>
            <span>Outstanding {formatInr(a.summary.outstanding)}</span>
            <span>Limit {formatInr(limit)}</span>
          </div>
        </>
      ) : (
        <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 13 }}>
          {a.summary.outstanding > 0
            ? `You owe ${formatInr(a.summary.outstanding)}. Credit terms are not active on your account right now.`
            : 'Credit terms are not set on your account yet. Orders are prepaid until Desi Tokri enables credit for your store.'}
        </Typography.Paragraph>
      )}
    </div>
  );
}

function Bills({ bills }: { bills: CreditBill[] }) {
  if (bills.length === 0) {
    return <Empty icon={<CheckCircleFilled style={{ color: '#16a34a' }} />} text="Nothing to pay. All your credit bills are settled." />;
  }
  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      {bills.map((b, i) => (
        <Link
          key={b.orderId}
          to={`/orders/${b.orderNumber}`}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: i ? '1px solid #f1f5f9' : 'none', color: 'inherit' }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            <Typography.Text strong style={{ fontSize: 13.5 }}>{b.orderNumber}</Typography.Text>
            <br />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {b.dueDate ? `Due ${day(b.dueDate)}` : b.dueNote ?? `Ordered ${day(b.orderDate)}`}
              {b.amountPaid > 0 ? ` · ${formatInr(b.amountPaid)} paid` : ''}
            </Typography.Text>
          </span>
          <span style={{ textAlign: 'right' }}>
            <Typography.Text strong style={{ display: 'block', color: b.overdue ? '#dc2626' : '#0f172a' }}>{formatInr(b.outstanding)}</Typography.Text>
            {b.overdue ? <Tag color="red" style={{ margin: 0, fontSize: 11 }}>{b.overdueDays}d overdue</Tag> : null}
          </span>
        </Link>
      ))}
    </div>
  );
}

function Statement({ lines, closing }: { lines: StatementLine[]; closing: number }) {
  if (lines.length === 0) return <Empty icon={<FileTextOutlined />} text="No credit bills or payments yet." />;
  const recent = [...lines].reverse();
  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        <Typography.Text strong>Balance</Typography.Text>
        <Typography.Text strong>{formatInr(closing)}</Typography.Text>
      </div>
      {recent.map((l, i) => (
        <div key={`${l.reference}-${l.kind}-${i}`} style={{ display: 'flex', gap: 12, padding: '10px 14px', borderTop: i ? '1px solid #f1f5f9' : 'none' }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <Typography.Text style={{ fontSize: 13 }}>{l.kind === 'BILL' ? `Order ${l.reference}` : l.description}</Typography.Text>
            <br />
            <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>{day(l.date)} · balance {formatInr(l.balance)}</Typography.Text>
          </span>
          <Typography.Text strong style={{ color: l.debit ? '#0f172a' : '#15803d', whiteSpace: 'nowrap' }}>
            {l.debit ? formatInr(l.debit) : `− ${formatInr(l.credit)}`}
          </Typography.Text>
        </div>
      ))}
    </div>
  );
}

function Payments({ payments }: { payments: CreditPayment[] }) {
  if (payments.length === 0) return <Empty icon={<BankOutlined />} text="No payments recorded yet." />;
  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      {payments.map((p, i) => (
        <div key={p.id} style={{ display: 'flex', gap: 12, padding: '12px 14px', borderTop: i ? '1px solid #f1f5f9' : 'none' }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <Typography.Text strong style={{ fontSize: 13.5 }}>{METHOD_LABEL[p.method]}{p.reference ? ` · ${p.reference}` : ''}</Typography.Text>
            <br />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {day(p.receivedOn)} · {p.receiptNumber} · for {p.appliedTo.map((x) => x.orderNumber).join(', ')}
            </Typography.Text>
          </span>
          <Typography.Text strong style={{ color: '#15803d', whiteSpace: 'nowrap' }}>{formatInr(p.amount)}</Typography.Text>
        </div>
      ))}
    </div>
  );
}

function Empty({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div style={{ ...card, padding: '28px 16px', textAlign: 'center', borderStyle: 'dashed' }}>
      <div style={{ fontSize: 26, color: '#94a3b8', marginBottom: 8 }}>{icon}</div>
      <Typography.Text type="secondary">{text}</Typography.Text>
    </div>
  );
}
