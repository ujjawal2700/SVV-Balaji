import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowUpOutlined,
  CopyOutlined,
  GiftOutlined,
  PlusOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Button, Divider, Tag, Typography, message } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function formatInr(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

interface Transaction {
  id: string;
  type: 'credit' | 'debit';
  title: string;
  subtitle: string;
  amount: number;
  date: string;
  status: 'success' | 'pending' | 'failed';
}

const mockTransactions: Transaction[] = [
  { id: 't1', type: 'credit', title: 'Cashback Reward',     subtitle: 'Order #ORD-76342891',          amount: 45,  date: 'Today, 2:30 PM',     status: 'success' },
  { id: 't2', type: 'debit',  title: 'Order Payment',       subtitle: 'Order #ORD-89237492',          amount: 1450, date: 'Today, 1:15 PM',    status: 'success' },
  { id: 't3', type: 'credit', title: 'Referral Bonus',      subtitle: 'Friend joined using your code', amount: 100, date: 'Yesterday, 6:00 PM', status: 'success' },
  { id: 't4', type: 'credit', title: 'Wallet Top-up',       subtitle: 'UPI Payment',                  amount: 500, date: '1 Sep, 10:00 AM',    status: 'success' },
  { id: 't5', type: 'debit',  title: 'Order Payment',       subtitle: 'Order #ORD-54328912',          amount: 300, date: '28 Aug, 4:20 PM',    status: 'failed'  },
  { id: 't6', type: 'credit', title: 'Cashback Reward',     subtitle: 'Order #ORD-54328912',          amount: 20,  date: '28 Aug, 4:20 PM',    status: 'success' },
  { id: 't7', type: 'credit', title: 'Welcome Bonus',       subtitle: 'New account reward',           amount: 50,  date: '1 Jan, 9:00 AM',     status: 'success' },
];

const ADD_AMOUNTS = [100, 200, 500, 1000, 2000];

const REFERRAL_CODE = 'RAHUL100';

export function WalletPage() {
  const navigate = useNavigate();
  const [balance] = useState(895);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);

  const handleAddMoney = () => {
    if (!selectedAmount) { message.warning('Please select an amount to add'); return; }
    message.success(`₹${selectedAmount} added to your Desi Tokri Wallet! (mock)`);
    setSelectedAmount(null);
  };

  const handleCopyReferral = () => {
    navigator.clipboard.writeText(REFERRAL_CODE).catch(() => {});
    message.success('Referral code copied!');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f3f6', paddingBottom: 80 }}>
      {/* Header */}
      <header style={{
        background: '#fff', padding: '12px 16px',
        display: 'flex', alignItems: 'center',
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)', position: 'sticky', top: 0, zIndex: 100,
      }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: 12 }}>
          <ArrowLeftOutlined style={{ fontSize: 20 }} />
        </button>
        <Typography.Text strong style={{ fontSize: 16 }}>Desi Tokri Wallet</Typography.Text>
      </header>

      <div style={{ padding: '12px' }}>

        {/* Balance Card */}
        <div style={{
          background: 'linear-gradient(135deg, #f97316 0%, #c2410c 100%)',
          borderRadius: 16, padding: '24px 20px', marginBottom: 12,
          boxShadow: '0 4px 16px rgba(249,115,22,0.35)', position: 'relative', overflow: 'hidden',
        }}>
          {/* Decorative circles */}
          <div style={{ position: 'absolute', top: -24, right: -24, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ position: 'absolute', bottom: -16, right: 60, width: 70, height: 70, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <WalletOutlined style={{ color: 'rgba(255,255,255,0.85)', fontSize: 18 }} />
            <Typography.Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14 }}>Available Balance</Typography.Text>
          </div>
          <Typography.Title level={2} style={{ color: '#fff', margin: '0 0 4px', fontSize: 36, fontWeight: 800 }}>
            {formatInr(balance)}
          </Typography.Title>
          <Typography.Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>
            Desi Tokri Wallet • Rahul Sharma
          </Typography.Text>

          {/* Quick stats */}
          <div style={{ display: 'flex', gap: 20, marginTop: 20 }}>
            <div>
              <Typography.Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, display: 'block' }}>Earned</Typography.Text>
              <Typography.Text strong style={{ color: '#fff', fontSize: 15 }}>₹715</Typography.Text>
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.2)' }} />
            <div>
              <Typography.Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, display: 'block' }}>Used</Typography.Text>
              <Typography.Text strong style={{ color: '#fff', fontSize: 15 }}>₹1,750</Typography.Text>
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.2)' }} />
            <div>
              <Typography.Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, display: 'block' }}>Cashback</Typography.Text>
              <Typography.Text strong style={{ color: '#fff', fontSize: 15 }}>₹65</Typography.Text>
            </div>
          </div>
        </div>

        {/* Add Money */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <Typography.Text strong style={{ fontSize: 15, display: 'block', marginBottom: 12 }}>Add Money</Typography.Text>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {ADD_AMOUNTS.map(amt => (
              <button
                key={amt}
                onClick={() => setSelectedAmount(amt)}
                style={{
                  padding: '8px 16px', borderRadius: 20, border: `1.5px solid ${selectedAmount === amt ? '#f97316' : '#e0e0e0'}`,
                  background: selectedAmount === amt ? '#fff3ed' : '#fff',
                  color: selectedAmount === amt ? '#f97316' : '#424242',
                  fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }}
              >
                ₹{amt}
              </button>
            ))}
          </div>
          <Button
            type="primary"
            block
            icon={<PlusOutlined />}
            size="large"
            style={{ background: '#f97316', borderColor: '#f97316', fontWeight: 600, borderRadius: 8 }}
            onClick={handleAddMoney}
          >
            {selectedAmount ? `Add ${formatInr(selectedAmount)}` : 'Select Amount & Add'}
          </Button>
        </div>

        {/* Referral */}
        <div style={{
          background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
          border: '1px solid #fde68a', borderRadius: 12, padding: 16, marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <GiftOutlined style={{ color: '#f59e0b', fontSize: 22 }} />
            <div>
              <Typography.Text strong style={{ fontSize: 14, display: 'block' }}>Invite Friends & Earn ₹100</Typography.Text>
              <Typography.Text style={{ fontSize: 12, color: '#92400e' }}>
                Your friend gets ₹50 on first order too!
              </Typography.Text>
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#fff', borderRadius: 8, padding: '10px 14px', border: '1px dashed #f59e0b',
          }}>
            <Typography.Text strong style={{ fontSize: 16, letterSpacing: 2, color: '#f97316' }}>{REFERRAL_CODE}</Typography.Text>
            <button
              onClick={handleCopyReferral}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f97316', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 13 }}
            >
              <CopyOutlined /> Copy
            </button>
          </div>
        </div>

        {/* How It Works */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <Typography.Text strong style={{ fontSize: 15, display: 'block', marginBottom: 12 }}>How It Works</Typography.Text>
          {[
            { step: '1', title: 'Add Money', desc: 'Top up your wallet via UPI, card, or net banking.' },
            { step: '2', title: 'Shop & Earn', desc: 'Earn cashback on every order placed.' },
            { step: '3', title: 'Pay Instantly', desc: 'Use wallet balance at checkout — no OTP needed.' },
          ].map((item, idx, arr) => (
            <div key={item.step}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: '#fff3ed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Typography.Text strong style={{ color: '#f97316' }}>{item.step}</Typography.Text>
                </div>
                <div>
                  <Typography.Text strong style={{ display: 'block', fontSize: 14 }}>{item.title}</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>{item.desc}</Typography.Text>
                </div>
              </div>
              {idx < arr.length - 1 && <Divider style={{ margin: '12px 0' }} />}
            </div>
          ))}
        </div>

        {/* Transaction History */}
        <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '16px 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography.Text strong style={{ fontSize: 15 }}>Transaction History</Typography.Text>
            <Typography.Text style={{ fontSize: 12, color: '#f97316', fontWeight: 600 }}>See All</Typography.Text>
          </div>
          <Divider style={{ margin: 0 }} />

          {mockTransactions.map((txn, idx) => (
            <div key={txn.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
                {/* Icon */}
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  background: txn.type === 'credit' ? '#f0fdf4' : '#fef2f2',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {txn.type === 'credit'
                    ? <ArrowDownOutlined style={{ color: '#16a34a', fontSize: 16 }} />
                    : <ArrowUpOutlined style={{ color: '#dc2626', fontSize: 16 }} />
                  }
                </div>

                {/* Details */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Typography.Text strong style={{ fontSize: 14 }}>{txn.title}</Typography.Text>
                    {txn.status === 'failed' && <Tag color="red" style={{ margin: 0, fontSize: 10 }}>Failed</Tag>}
                    {txn.status === 'pending' && <Tag color="orange" style={{ margin: 0, fontSize: 10 }}>Pending</Tag>}
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>{txn.subtitle}</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{txn.date}</Typography.Text>
                </div>

                {/* Amount */}
                <Typography.Text strong style={{
                  fontSize: 15,
                  color: txn.status === 'failed' ? '#aaa' : txn.type === 'credit' ? '#16a34a' : '#dc2626',
                }}>
                  {txn.type === 'credit' ? '+' : '-'}{formatInr(txn.amount)}
                </Typography.Text>
              </div>
              {idx < mockTransactions.length - 1 && <Divider style={{ margin: '0 16px', width: 'auto', minWidth: 'auto' }} />}
            </div>
          ))}

          <div style={{ padding: '14px', textAlign: 'center' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>~ No more transactions ~</Typography.Text>
          </div>
        </div>

      </div>
    </div>
  );
}
