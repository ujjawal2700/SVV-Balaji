import {
  BankOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  PhoneOutlined,
  QuestionCircleOutlined,
  RightOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Typography } from 'antd';
import { retailerProfile } from '../mock/homeMockData';

/**
 * The retailer's account screen — reached from the Profile tab.
 *
 * Mock data only, same as `HomePage`: there is no customer identity in the
 * schema yet (see `LoginPage`), so this reads the same static
 * `retailerProfile` rather than `useAuth()`.
 */

const MENU_ITEMS = [
  { key: 'store', label: 'Store Details', icon: <ShopOutlined /> },
  { key: 'address', label: 'Delivery Addresses', icon: <EnvironmentOutlined /> },
  { key: 'credit', label: 'Credit & Payments', icon: <BankOutlined /> },
  { key: 'invoices', label: 'Invoices', icon: <FileTextOutlined /> },
  { key: 'support', label: 'Help & Support', icon: <QuestionCircleOutlined /> },
];

export function ProfilePage() {
  return (
    <div className="store-container" style={{ paddingTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <Avatar size={56} style={{ background: '#1d4ed8', fontWeight: 600 }}>
          {retailerProfile.storeName.charAt(0)}
        </Avatar>
        <div>
          <Typography.Title level={5} style={{ margin: 0 }}>
            {retailerProfile.storeName}
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            Retailer ID: {retailerProfile.retailerId}
          </Typography.Text>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              <PhoneOutlined /> Rep: {retailerProfile.repName}
            </Typography.Text>
          </div>
        </div>
      </div>

      <div
        style={{
          background: '#eef1f6',
          borderRadius: 16,
          padding: 16,
          display: 'flex',
          gap: 32,
          marginBottom: 24,
        }}
      >
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
            Outstanding
          </Typography.Text>
          <Typography.Text strong style={{ fontSize: 16, color: '#dc2626' }}>
            ₹{retailerProfile.outstanding.toLocaleString('en-IN')}
          </Typography.Text>
        </div>
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
            Credit Limit
          </Typography.Text>
          <Typography.Text strong style={{ fontSize: 16 }}>
            ₹{retailerProfile.creditLimit.toLocaleString('en-IN')}
          </Typography.Text>
        </div>
      </div>

      <div style={{ border: '1px solid #e7e5e4', borderRadius: 16, overflow: 'hidden' }}>
        {MENU_ITEMS.map((item, index) => (
          <div
            key={item.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 16px',
              borderBottom: index === MENU_ITEMS.length - 1 ? 'none' : '1px solid #f0eee9',
            }}
          >
            <span style={{ fontSize: 16, color: '#1d4ed8' }}>{item.icon}</span>
            <Typography.Text style={{ flex: 1 }}>{item.label}</Typography.Text>
            <RightOutlined style={{ fontSize: 12, color: '#a8a29e' }} />
          </div>
        ))}
      </div>

      <Button block size="large" style={{ marginTop: 24 }} disabled>
        Sign out
      </Button>
    </div>
  );
}
