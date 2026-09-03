import { Button, Typography } from 'antd';
import { ArrowLeftOutlined, WarningOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8f7f5' }}>
      <header
        className="store-safe-top"
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #f0eee9',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <ArrowLeftOutlined style={{ fontSize: 20, color: '#44403c' }} />
        </button>
        <Typography.Title level={4} style={{ margin: 0, color: '#1c1917', fontSize: 18 }}>
          Not Found
        </Typography.Title>
      </header>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#ffedd5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <WarningOutlined style={{ fontSize: 40, color: '#f97316' }} />
        </div>
        <Typography.Title level={3} style={{ margin: '0 0 12px', color: '#1c1917' }}>
          Page Not Found
        </Typography.Title>
        <Typography.Text style={{ fontSize: 15, color: '#78716c', marginBottom: 32, maxWidth: 300 }}>
          The page you are looking for doesn't exist or has been moved.
        </Typography.Text>
        <Button type="primary" size="large" onClick={() => navigate('/')} style={{ background: '#f97316', borderColor: '#f97316', borderRadius: 24, padding: '0 32px', fontWeight: 600 }}>
          Go to Home
        </Button>
      </div>
    </div>
  );
}
