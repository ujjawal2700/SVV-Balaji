import {
  CompassOutlined,
  CustomerServiceOutlined,
  EnvironmentOutlined,
  LockOutlined,
  MailOutlined,
  PhoneOutlined,
  QrcodeOutlined,
  SafetyCertificateOutlined,
  SafetyOutlined,
  ThunderboltOutlined,
  TruckOutlined,
} from '@ant-design/icons';
import { Button, Divider, Input, Space, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { categories } from '../mock/homeMockData';

export function DesktopFooter() {
  return (
    <footer className="desktop-only" style={{ background: '#1c1917', color: '#d6d3d1', marginTop: 'auto', borderTop: '4px solid #059669' }}>
      {/* Trust & Guarantee Banner */}
      <div style={{ background: '#292524', borderBottom: '1px solid #3f3f46', padding: '24px 0' }}>
        <div className="store-container" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: 'rgba(5, 150, 105, 0.15)',
                  border: '1px solid rgba(5, 150, 105, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#34d399',
                  fontSize: 22,
                  flexShrink: 0,
                }}
              >
                <QrcodeOutlined />
              </div>
              <div>
                <Typography.Text strong style={{ color: '#ffffff', fontSize: 14, display: 'block' }}>
                  100% Farm Traceable
                </Typography.Text>
                <Typography.Text style={{ color: '#a8a29e', fontSize: 12 }}>
                  Scan QR on pack to trace farm origin
                </Typography.Text>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: 'rgba(249, 115, 22, 0.15)',
                  border: '1px solid rgba(249, 115, 22, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fb923c',
                  fontSize: 22,
                  flexShrink: 0,
                }}
              >
                <TruckOutlined />
              </div>
              <div>
                <Typography.Text strong style={{ color: '#ffffff', fontSize: 14, display: 'block' }}>
                  Direct Mill Dispatch
                </Typography.Text>
                <Typography.Text style={{ color: '#a8a29e', fontSize: 12 }}>
                  Same-day delivery to retailer store
                </Typography.Text>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#60a5fa',
                  fontSize: 22,
                  flexShrink: 0,
                }}
              >
                <SafetyCertificateOutlined />
              </div>
              <div>
                <Typography.Text strong style={{ color: '#ffffff', fontSize: 14, display: 'block' }}>
                  FSSAI &amp; Agmark Certified
                </Typography.Text>
                <Typography.Text style={{ color: '#a8a29e', fontSize: 12 }}>
                  Unadulterated, graded quality
                </Typography.Text>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: 'rgba(168, 85, 247, 0.15)',
                  border: '1px solid rgba(168, 85, 247, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#c084fc',
                  fontSize: 22,
                  flexShrink: 0,
                }}
              >
                <ThunderboltOutlined />
              </div>
              <div>
                <Typography.Text strong style={{ color: '#ffffff', fontSize: 14, display: 'block' }}>
                  Flexible Retailer Credit
                </Typography.Text>
                <Typography.Text style={{ color: '#a8a29e', fontSize: 12 }}>
                  Transparent ledger &amp; instant invoices
                </Typography.Text>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="store-container" style={{ paddingTop: 48, paddingBottom: 40 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.5fr', gap: 40 }}>
          {/* Col 1: Brand & Traceability */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div
                style={{
                  background: '#ffffff',
                  padding: 4,
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img src="/images/desi-tokri.png" alt="Desi Tokri" style={{ width: 36, height: 36, objectFit: 'contain' }} />
              </div>
              <div>
                <span className="brand-title-font" style={{ fontSize: 18, fontWeight: 800, color: '#ffffff', letterSpacing: '1.5px', display: 'block' }}>
                  Desi Tokri
                </span>
                <span className="brand-title-font" style={{ display: 'block', fontSize: 10, color: '#f59e0b', fontWeight: 700, letterSpacing: '1.5px', marginTop: 2 }}>
                  By SVV Balaji Enterprises
                </span>
              </div>
            </div>

            <p style={{ fontSize: 13, lineHeight: 1.6, color: '#a8a29e', marginBottom: 20 }}>
              Desi Tokri Food &amp; Beverages Pvt. Ltd. connects consumers and retail partners directly to authentic mandi farmers and certified milling units. Every single package carries an immutable batch QR code for complete transparency.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Link
                to="/trace"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#059669',
                  color: '#ffffff',
                  padding: '8px 16px',
                  borderRadius: 8,
                  textDecoration: 'none',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <QrcodeOutlined /> Trace Any Batch QR
              </Link>
            </div>
          </div>

          {/* Col 2: Categories */}
          <div>
            <Typography.Title level={5} style={{ color: '#ffffff', marginBottom: 16, fontSize: 15 }}>
              Shop by Category
            </Typography.Title>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              {categories.map((cat) => (
                <li key={cat.id}>
                  <Link
                    to={`/products/${cat.id}`}
                    style={{ color: '#a8a29e', textDecoration: 'none' }}
                    className="nav-link-hover"
                  >
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3: Quick Links */}
          <div>
            <Typography.Title level={5} style={{ color: '#ffffff', marginBottom: 16, fontSize: 15 }}>
              Retailer Services
            </Typography.Title>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <li>
                <Link to="/orders" style={{ color: '#a8a29e', textDecoration: 'none' }} className="nav-link-hover">
                  Track Running Orders
                </Link>
              </li>
              <li>
                <Link to="/wallet" style={{ color: '#a8a29e', textDecoration: 'none' }} className="nav-link-hover">
                  Retailer Ledger &amp; Credit
                </Link>
              </li>
              <li>
                <Link to="/products/atta-flour" style={{ color: '#a8a29e', textDecoration: 'none' }} className="nav-link-hover">
                  Active Wholesale Schemes
                </Link>
              </li>
              <li>
                <Link to="/trace" style={{ color: '#a8a29e', textDecoration: 'none' }} className="nav-link-hover">
                  Quality &amp; Lab Reports
                </Link>
              </li>
              <li>
                <Link to="/profile" style={{ color: '#a8a29e', textDecoration: 'none' }} className="nav-link-hover">
                  Store Profile &amp; KYC
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4: Retailer Helpdesk */}
          <div>
            <Typography.Title level={5} style={{ color: '#ffffff', marginBottom: 16, fontSize: 15 }}>
              Retailer Support Desk
            </Typography.Title>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, color: '#a8a29e' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <PhoneOutlined style={{ color: '#34d399', marginTop: 3 }} />
                <div>
                  <strong style={{ color: '#ffffff', display: 'block' }}>Toll Free: 1800-209-DESI</strong>
                  <span>Mon - Sat: 8:00 AM to 8:00 PM</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <MailOutlined style={{ color: '#34d399' }} />
                <span>orders@desitokri.com</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <EnvironmentOutlined style={{ color: '#34d399', marginTop: 3 }} />
                <span>Central Mandi Hub, Plot 42-B, Industrial Area, Sector 18</span>
              </div>

              <div style={{ marginTop: 12, padding: '10px 14px', background: '#292524', borderRadius: 8, border: '1px solid #3f3f46' }}>
                <span style={{ fontSize: 11, color: '#d6d3d1' }}>Assigned Field Rep:</span>
                <strong style={{ display: 'block', color: '#34d399', fontSize: 13 }}>Ramesh Verma (+91 98765 43210)</strong>
              </div>
            </div>
          </div>
        </div>

        <Divider style={{ borderColor: '#292524', margin: '36px 0 24px' }} />

        {/* Bottom copyright & certifications */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#78716c' }}>
          <div>
            &copy; {new Date().getFullYear()} Desi Tokri Food &amp; Beverages Pvt. Ltd. All rights reserved. | FSSAI Lic. No. 10020011000342
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <LockOutlined style={{ color: '#34d399' }} /> 256-Bit SSL Encrypted
            </span>
            <span>Privacy Policy</span>
            <span>Terms of B2B Supply</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
