import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  ClockCircleOutlined,
  CustomerServiceOutlined,
  DeleteOutlined,
  EnvironmentOutlined,
  EyeOutlined,
  MailOutlined,
  MessageOutlined,
  PhoneOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  SaveOutlined,
  SettingOutlined,
  ShopOutlined,
  UserOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import {
  App as AntApp,
  Badge,
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Input,
  Row,
  Select,
  Skeleton,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { SupportFaqItem, SupportSettings } from '@shared/api/types';
import { useCan } from '@shared/auth/useCan';
import { PageHeader } from '@shared/components/PageHeader';
import { useSupportSettings, useUpdateSupportSettings } from '@shared/hooks/useSupportSettings';

const DEFAULT_CATEGORIES = [
  'Orders & Live Tracking',
  'Delivery & Dispatch Timing',
  'Payments, GST & Invoices',
  'Returns, Refunds & Damaged Items',
  'Account, KYC & Wholesale Margins',
];

export function SupportSettingsPage() {
  const { message } = AntApp.useApp();
  const canManage = useCan('DASHBOARD_VIEW'); // Accessible to super admin / management

  const settings = useSupportSettings();
  const update = useUpdateSupportSettings();

  const [draft, setDraft] = useState<SupportSettings | null>(null);
  const [activeTab, setActiveTab] = useState<'customer' | 'retailer'>('customer');
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setDraft({
      ...settings.data,
      helpCategories: settings.data.helpCategories || DEFAULT_CATEGORIES,
      customerFaqs: settings.data.customerFaqs || [],
      retailerFaqs: settings.data.retailerFaqs || [],
    });
  }, [settings.data]);

  const dirty =
    draft !== null &&
    settings.data !== undefined &&
    JSON.stringify(draft) !== JSON.stringify(settings.data);

  const handleReset = () => {
    if (!settings.data) return;
    setDraft({
      ...settings.data,
      helpCategories: settings.data.helpCategories || DEFAULT_CATEGORIES,
      customerFaqs: settings.data.customerFaqs || [],
      retailerFaqs: settings.data.retailerFaqs || [],
    });
  };

  const handleSave = async () => {
    if (!draft) return;
    try {
      await update.mutateAsync(draft);
      message.success('Help & Customer Support settings saved successfully');
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not save support settings'), 8);
    }
  };

  const handleUpdateFaq = (
    type: 'customer' | 'retailer',
    index: number,
    field: keyof SupportFaqItem,
    value: string,
  ) => {
    setDraft((d) => {
      if (!d) return d;
      const list = type === 'customer' ? [...d.customerFaqs] : [...d.retailerFaqs];
      list[index] = { ...list[index], [field]: value };
      return type === 'customer' ? { ...d, customerFaqs: list } : { ...d, retailerFaqs: list };
    });
  };

  const handleAddFaq = (type: 'customer' | 'retailer') => {
    setDraft((d) => {
      if (!d) return d;
      const list = type === 'customer' ? [...d.customerFaqs] : [...d.retailerFaqs];
      list.push({
        category: d.helpCategories?.[0] || 'Orders & Live Tracking',
        question: '',
        answer: '',
      });
      return type === 'customer' ? { ...d, customerFaqs: list } : { ...d, retailerFaqs: list };
    });
  };

  const handleRemoveFaq = (type: 'customer' | 'retailer', index: number) => {
    setDraft((d) => {
      if (!d) return d;
      const list = type === 'customer' ? [...d.customerFaqs] : [...d.retailerFaqs];
      list.splice(index, 1);
      return type === 'customer' ? { ...d, customerFaqs: list } : { ...d, retailerFaqs: list };
    });
  };

  const handleMoveFaq = (type: 'customer' | 'retailer', index: number, direction: 'up' | 'down') => {
    setDraft((d) => {
      if (!d) return d;
      const list = type === 'customer' ? [...d.customerFaqs] : [...d.retailerFaqs];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= list.length) return d;
      const item = list.splice(index, 1)[0];
      list.splice(targetIndex, 0, item);
      return type === 'customer' ? { ...d, customerFaqs: list } : { ...d, retailerFaqs: list };
    });
  };

  const renderFaqEditor = (type: 'customer' | 'retailer') => {
    const list = type === 'customer' ? draft?.customerFaqs || [] : draft?.retailerFaqs || [];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '12px 16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: type === 'customer' ? '#e0e7ff' : '#fef3c7',
                color: type === 'customer' ? '#4338ca' : '#b45309',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
              }}
            >
              {type === 'customer' ? <UserOutlined /> : <ShopOutlined />}
            </div>
            <div>
              <Typography.Text strong style={{ display: 'block', fontSize: 14 }}>
                {type === 'customer' ? 'B2C Customer Help FAQs' : 'B2B Retailer / Kirana Partner FAQs'}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {type === 'customer'
                  ? 'Shown to grocery buyers on the Help & Customer Support (/help) page.'
                  : 'Shown to trade partners & retailers on their dedicated support view.'}
              </Typography.Text>
            </div>
          </div>
          <Button
            type="primary"
            ghost
            icon={<PlusOutlined />}
            disabled={!canManage}
            onClick={() => handleAddFaq(type)}
            style={{ borderRadius: 8 }}
          >
            Add FAQ
          </Button>
        </div>

        {list.length === 0 ? (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              background: '#f8fafc',
              border: '2px dashed #cbd5e1',
              borderRadius: 12,
            }}
          >
            <QuestionCircleOutlined style={{ fontSize: 36, color: '#94a3b8', marginBottom: 12 }} />
            <Typography.Text strong style={{ display: 'block', fontSize: 15, color: '#334155' }}>
              No custom FAQs configured yet
            </Typography.Text>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!canManage}
              onClick={() => handleAddFaq(type)}
              style={{ marginTop: 12 }}
            >
              Create First Question
            </Button>
          </div>
        ) : (
          list.map((item, index) => (
            <div
              key={index}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '16px 18px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      background: '#166534',
                      color: '#ffffff',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 6,
                    }}
                  >
                    Q{index + 1}
                  </span>
                  <Select
                    size="small"
                    value={item.category || 'Orders & Live Tracking'}
                    onChange={(val) => handleUpdateFaq(type, index, 'category', val)}
                    style={{ width: 220 }}
                    options={(draft?.helpCategories || DEFAULT_CATEGORIES).map((cat) => ({
                      label: cat,
                      value: cat,
                    }))}
                  />
                </div>

                {canManage && (
                  <Space size={4}>
                    <Tooltip title="Move up">
                      <Button
                        type="text"
                        size="small"
                        icon={<ArrowUpOutlined />}
                        disabled={index === 0}
                        onClick={() => handleMoveFaq(type, index, 'up')}
                      />
                    </Tooltip>
                    <Tooltip title="Move down">
                      <Button
                        type="text"
                        size="small"
                        icon={<ArrowDownOutlined />}
                        disabled={index === list.length - 1}
                        onClick={() => handleMoveFaq(type, index, 'down')}
                      />
                    </Tooltip>
                    <Tooltip title="Delete FAQ">
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleRemoveFaq(type, index)}
                      />
                    </Tooltip>
                  </Space>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <Typography.Text style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
                    Question Title:
                  </Typography.Text>
                  <Input
                    placeholder="e.g. How can I track my live order delivery status?"
                    value={item.question}
                    disabled={!canManage}
                    onChange={(e) => handleUpdateFaq(type, index, 'question', e.target.value)}
                    style={{ borderRadius: 8, fontWeight: 500 }}
                  />
                </div>
                <div>
                  <Typography.Text style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
                    Helpful Answer Explanation:
                  </Typography.Text>
                  <Input.TextArea
                    placeholder="Provide step-by-step guidance for the user..."
                    value={item.answer}
                    disabled={!canManage}
                    rows={2}
                    autoSize={{ minRows: 2, maxRows: 6 }}
                    onChange={(e) => handleUpdateFaq(type, index, 'answer', e.target.value)}
                    style={{ borderRadius: 8 }}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 80 }}>
      {/* Top Header */}
      <PageHeader
        title="Help & Customer Support Settings"
        subtitle="Manage dynamic helpline numbers, WhatsApp desk, support hours, and self-service FAQs for Customer (B2C) & Retailer (B2B) storefronts."
        extra={
          <Space>
            <Button
              icon={<EyeOutlined />}
              onClick={() => setPreviewOpen(true)}
              style={{ borderRadius: 8 }}
            >
              Live Help Preview
            </Button>
            {canManage && dirty && (
              <Button onClick={handleReset} style={{ borderRadius: 8 }}>
                Discard
              </Button>
            )}
            {canManage && (
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={update.isPending}
                disabled={!dirty}
                onClick={() => void handleSave()}
                style={{
                  borderRadius: 8,
                  background: dirty ? '#166534' : undefined,
                  borderColor: dirty ? '#166534' : undefined,
                  boxShadow: dirty ? '0 4px 12px rgba(22, 101, 52, 0.35)' : undefined,
                }}
              >
                Save Changes
              </Button>
            )}
          </Space>
        }
      />

      {settings.isLoading || !draft ? (
        <Card style={{ borderRadius: 16 }}>
          <Skeleton active paragraph={{ rows: 10 }} />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Executive Overview Hero Banner */}
          <div
            style={{
              background: 'linear-gradient(135deg, #14532d 0%, #166534 50%, #15803d 100%)',
              borderRadius: 16,
              padding: '24px 28px',
              color: '#ffffff',
              boxShadow: '0 10px 25px -5px rgba(20, 83, 45, 0.3)',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 20,
            }}
          >
            <div style={{ maxWidth: 500 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span
                  style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '2px 10px',
                    borderRadius: 20,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <CustomerServiceOutlined /> Dynamic Support Hub
                </span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                  Live on Customer & Retailer App
                </span>
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px 0', color: '#ffffff' }}>
                Helpline & Self-Service Portal
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
                Changes made here immediately update the customer & retailer storefront Help (/help) pages, phone tap-to-call links, and WhatsApp buttons.
              </p>
            </div>

            {/* Quick Metrics Pills */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(8px)',
                  borderRadius: 12,
                  padding: '12px 18px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  minWidth: 140,
                }}
              >
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Toll-Free Helpline
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fef08a', marginTop: 4 }}>
                  {draft.tollFreeNumber || '1800-209-DESI'}
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(8px)',
                  borderRadius: 12,
                  padding: '12px 18px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  minWidth: 140,
                }}
              >
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', fontWeight: 600 }}>
                  WhatsApp Desk
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#86efac', marginTop: 4 }}>
                  {draft.whatsappNumber || '+91 98765 43210'}
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(8px)',
                  borderRadius: 12,
                  padding: '12px 18px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  minWidth: 120,
                }}
              >
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Total FAQs
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#ffffff', marginTop: 2 }}>
                  {(draft.customerFaqs?.length || 0) + (draft.retailerFaqs?.length || 0)} Active
                </div>
              </div>
            </div>
          </div>

          <Row gutter={[24, 24]}>
            {/* Left Column: Contact Channels & Business Hours */}
            <Col xs={24} lg={10}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* 1. Direct Helpline Channels */}
                <Card
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <PhoneOutlined style={{ color: '#166534', fontSize: 18 }} />
                      <span style={{ fontWeight: 600, fontSize: 16 }}>1. Support Contact Channels</span>
                    </div>
                  }
                  style={{ borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Toll Free */}
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Typography.Text strong style={{ fontSize: 13, color: '#1e293b' }}>
                          <PhoneOutlined style={{ color: '#2563eb', marginRight: 6 }} /> Toll-Free Phone Helpline
                        </Typography.Text>
                        <Switch
                          size="small"
                          checked={draft.isPhoneSupportActive}
                          disabled={!canManage}
                          onChange={(val) => setDraft((d) => (d ? { ...d, isPhoneSupportActive: val } : d))}
                        />
                      </div>
                      <Input
                        value={draft.tollFreeNumber}
                        disabled={!canManage}
                        onChange={(e) => setDraft((d) => (d ? { ...d, tollFreeNumber: e.target.value } : d))}
                        placeholder="1800-209-DESI"
                        style={{ borderRadius: 8 }}
                      />
                    </div>

                    {/* WhatsApp Support */}
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Typography.Text strong style={{ fontSize: 13, color: '#1e293b' }}>
                          <WhatsAppOutlined style={{ color: '#16a34a', marginRight: 6 }} /> WhatsApp Support Line
                        </Typography.Text>
                        <Switch
                          size="small"
                          checked={draft.isWhatsappSupportActive}
                          disabled={!canManage}
                          onChange={(val) => setDraft((d) => (d ? { ...d, isWhatsappSupportActive: val } : d))}
                        />
                      </div>
                      <Input
                        value={draft.whatsappNumber}
                        disabled={!canManage}
                        onChange={(e) => setDraft((d) => (d ? { ...d, whatsappNumber: e.target.value } : d))}
                        placeholder="+91 98765 43210"
                        style={{ borderRadius: 8 }}
                      />
                    </div>

                    {/* Email Support */}
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Typography.Text strong style={{ fontSize: 13, color: '#1e293b' }}>
                          <MailOutlined style={{ color: '#ea580c', marginRight: 6 }} /> Support Email Inbox
                        </Typography.Text>
                        <Switch
                          size="small"
                          checked={draft.isEmailSupportActive}
                          disabled={!canManage}
                          onChange={(val) => setDraft((d) => (d ? { ...d, isEmailSupportActive: val } : d))}
                        />
                      </div>
                      <Input
                        value={draft.supportEmail}
                        disabled={!canManage}
                        onChange={(e) => setDraft((d) => (d ? { ...d, supportEmail: e.target.value } : d))}
                        placeholder="support@svvbalaji.com"
                        style={{ borderRadius: 8 }}
                      />
                    </div>
                  </div>
                </Card>

                {/* 2. Operating Hours & Address */}
                <Card
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ClockCircleOutlined style={{ color: '#0ea5e9', fontSize: 18 }} />
                      <span style={{ fontWeight: 600, fontSize: 16 }}>2. Operating Hours & Address</span>
                    </div>
                  }
                  style={{ borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <Typography.Text strong style={{ fontSize: 13, color: '#1e293b', display: 'block', marginBottom: 4 }}>
                        Customer Support Working Hours:
                      </Typography.Text>
                      <Input
                        value={draft.operatingHours}
                        disabled={!canManage}
                        onChange={(e) => setDraft((d) => (d ? { ...d, operatingHours: e.target.value } : d))}
                        placeholder="Mon - Sat: 8:00 AM - 9:00 PM IST"
                        style={{ borderRadius: 8 }}
                      />
                    </div>

                    <div>
                      <Typography.Text strong style={{ fontSize: 13, color: '#1e293b', display: 'block', marginBottom: 4 }}>
                        Official Head Office Address:
                      </Typography.Text>
                      <Input.TextArea
                        value={draft.officeAddress}
                        disabled={!canManage}
                        rows={3}
                        onChange={(e) => setDraft((d) => (d ? { ...d, officeAddress: e.target.value } : d))}
                        placeholder="SVV Balaji Complex, Mandi Highway, Sector 4..."
                        style={{ borderRadius: 8 }}
                      />
                    </div>
                  </div>
                </Card>
              </div>
            </Col>

            {/* Right Column: Dynamic FAQ Studio */}
            <Col xs={24} lg={14}>
              <Card
                title={
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <QuestionCircleOutlined style={{ color: '#166534', fontSize: 18 }} />
                      <span style={{ fontWeight: 600, fontSize: 16 }}>3. Dynamic Storefront FAQs Studio</span>
                    </div>
                    <Tag color="green" style={{ borderRadius: 12, fontWeight: 600 }}>
                      {(draft.customerFaqs?.length || 0) + (draft.retailerFaqs?.length || 0)} Total
                    </Tag>
                  </div>
                }
                style={{ borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', height: '100%' }}
              >
                <Tabs
                  activeKey={activeTab}
                  onChange={(k) => setActiveTab(k as 'customer' | 'retailer')}
                  items={[
                    {
                      key: 'customer',
                      label: (
                        <span>
                          <UserOutlined /> Customer (B2C) FAQs{' '}
                          <Badge
                            count={draft.customerFaqs?.length || 0}
                            style={{ backgroundColor: activeTab === 'customer' ? '#166534' : '#94a3b8' }}
                          />
                        </span>
                      ),
                      children: renderFaqEditor('customer'),
                    },
                    {
                      key: 'retailer',
                      label: (
                        <span>
                          <ShopOutlined /> Retailer (B2B) FAQs{' '}
                          <Badge
                            count={draft.retailerFaqs?.length || 0}
                            style={{ backgroundColor: activeTab === 'retailer' ? '#166534' : '#94a3b8' }}
                          />
                        </span>
                      ),
                      children: renderFaqEditor('retailer'),
                    },
                  ]}
                />
              </Card>
            </Col>
          </Row>

          {/* Sticky Unsaved Changes Floating Bar */}
          {canManage && dirty && (
            <div
              style={{
                position: 'fixed',
                bottom: 24,
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#1e293b',
                color: '#ffffff',
                padding: '12px 24px',
                borderRadius: 50,
                boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                zIndex: 1000,
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#16a34a',
                    boxShadow: '0 0 8px #16a34a',
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 500 }}>You have unsaved support changes</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Button size="small" onClick={handleReset} style={{ borderRadius: 20 }}>
                  Reset
                </Button>
                <Button
                  type="primary"
                  size="small"
                  icon={<SaveOutlined />}
                  loading={update.isPending}
                  onClick={() => void handleSave()}
                  style={{
                    borderRadius: 20,
                    background: '#166534',
                    borderColor: '#166534',
                    fontWeight: 600,
                  }}
                >
                  Save Settings
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Live Storefront Mockup Drawer */}
      <Drawer
        title="Live Help & Support Storefront Preview"
        placement="right"
        width={480}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      >
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Live mockup of how customers and retailers see the Help & Support page on the mobile/web storefront (`/help`).
            </Typography.Text>

            {/* Mock Header Card */}
            <div
              style={{
                background: 'linear-gradient(135deg, #14532d 0%, #166534 100%)',
                borderRadius: 16,
                padding: 20,
                color: '#fff',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 11, letterSpacing: '0.08em', opacity: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>
                SVV Balaji 24x7 Help Center
              </div>
              <h3 style={{ margin: '0 0 6px 0', color: '#fff', fontSize: 18, fontWeight: 800 }}>
                How can we assist you today?
              </h3>
              <p style={{ margin: 0, fontSize: 12, opacity: 0.9 }}>
                Quick answers, order tracking assistance, and direct helpline channels.
              </p>
            </div>

            {/* Quick Contact Buttons Mockup */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                <PhoneOutlined style={{ fontSize: 20, color: '#166534', marginBottom: 4 }} />
                <div style={{ fontSize: 12, fontWeight: 700, color: '#14532d' }}>Call Helpline</div>
                <div style={{ fontSize: 11, color: '#16a34a' }}>{draft.tollFreeNumber}</div>
              </div>

              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                <WhatsAppOutlined style={{ fontSize: 20, color: '#16a34a', marginBottom: 4 }} />
                <div style={{ fontSize: 12, fontWeight: 700, color: '#14532d' }}>WhatsApp Chat</div>
                <div style={{ fontSize: 11, color: '#16a34a' }}>{draft.whatsappNumber}</div>
              </div>
            </div>

            {/* Sample FAQs */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#334155' }}>
                Customer Questions ({draft.customerFaqs.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {draft.customerFaqs.slice(0, 3).map((faq, idx) => (
                  <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', marginBottom: 3 }}>
                      {faq.question || 'Question'}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      {faq.answer || 'Answer'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
