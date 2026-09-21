import { ArrowLeftOutlined, AimOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Popconfirm, Skeleton, Tag, Typography, message } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { checkoutApi, checkoutError, type Address } from '../api/checkout';
import { AddressFormModal } from '../components/AddressFormModal';
import { useCustomerAuth } from '../auth/CustomerAuthContext';

export const ADDRESSES_KEY = ['storefront', 'addresses'] as const;

export function AddressesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { role } = useCustomerAuth();
  const [editing, setEditing] = useState<Address | null>(null);
  const [open, setOpen] = useState(false);
  const addresses = useQuery({ queryKey: ADDRESSES_KEY, queryFn: checkoutApi.addresses, enabled: role !== 'GUEST' });

  const remove = async (id: string) => {
    try {
      await checkoutApi.deleteAddress(id);
      void qc.invalidateQueries({ queryKey: ADDRESSES_KEY });
    } catch (e) {
      message.error(checkoutError(e).message);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f3f6', paddingBottom: 80 }}>
      <header style={{ background: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', position: 'sticky', top: 0, zIndex: 100 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: 12 }}>
          <ArrowLeftOutlined style={{ fontSize: 20 }} />
        </button>
        <Typography.Text strong style={{ fontSize: 16 }}>My Addresses</Typography.Text>
      </header>

      <div style={{ padding: 12, maxWidth: 720, margin: '0 auto' }}>
        {role === 'GUEST' ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 20 }}>
            <Typography.Text>Sign in to save delivery addresses.</Typography.Text>
            <div style={{ marginTop: 12 }}><Button type="primary" onClick={() => navigate('/login')}>Sign in</Button></div>
          </div>
        ) : addresses.isLoading ? (
          <Skeleton active />
        ) : (
          <>
            {(addresses.data ?? []).map((a) => (
              <div key={a.id} style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Typography.Text strong>{a.label}</Typography.Text>
                    {a.isDefault ? <Tag color="orange">Default</Tag> : null}
                    {a.latitude ? <Tag color="green" icon={<AimOutlined />}>Pinned</Tag> : <Tag>Not pinned</Tag>}
                  </div>
                  <div>
                    <Button type="text" icon={<EditOutlined />} onClick={() => { setEditing(a); setOpen(true); }} />
                    <Popconfirm title="Delete this address?" onConfirm={() => void remove(a.id)}>
                      <Button type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </div>
                </div>
                <Typography.Text style={{ display: 'block' }}>{a.fullName} · {a.phone}</Typography.Text>
                <Typography.Text type="secondary">
                  {[a.line1, a.line2, a.landmark].filter(Boolean).join(', ')}, {a.city}, {a.state} {a.pincode}
                </Typography.Text>
              </div>
            ))}
            {(addresses.data ?? []).length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 10 }}>
                <Typography.Text type="secondary">You have no saved addresses yet.</Typography.Text>
              </div>
            ) : null}
            <Button type="primary" icon={<PlusOutlined />} size="large" block onClick={() => { setEditing(null); setOpen(true); }}>
              Add new address
            </Button>
          </>
        )}
      </div>

      <AddressFormModal
        open={open}
        address={editing}
        onClose={() => setOpen(false)}
        onSaved={() => void qc.invalidateQueries({ queryKey: ADDRESSES_KEY })}
      />
    </div>
  );
}
