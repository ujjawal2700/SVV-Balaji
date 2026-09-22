import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  MailOutlined,
  MessageOutlined,
  PhoneOutlined,
  QuestionCircleOutlined,
  RightOutlined,
  SendOutlined,
  ShopOutlined,
  ShoppingOutlined,
  UserOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import {
  App as AntApp,
  Badge,
  Button,
  Card,
  Col,
  Collapse,
  Empty,
  Input,
  Modal,
  Row,
  Select,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { useStorefrontSupport } from '@shared/hooks/useSupportSettings';
import type { SupportFaqItem } from '@shared/api/types';

const { Title, Text, Paragraph } = Typography;

export function HelpSupportPage() {
  const navigate = useNavigate();
  const { role, customerProfile, retailerProfile } = useCustomerAuth();
  const { message } = AntApp.useApp();

  const isUserRetailer = role === 'RETAILER';
  const activeRole: 'CUSTOMER' | 'RETAILER' = isUserRetailer ? 'RETAILER' : 'CUSTOMER';

  const { data: supportData, isLoading } = useStorefrontSupport(activeRole);

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    subject: '',
    orderNumber: '',
    category: 'ORDER_ISSUE',
    description: '',
  });
  const [submittingTicket, setSubmittingTicket] = useState(false);

  // Active FAQs based on user's role
  const activeFaqs: SupportFaqItem[] = useMemo(() => {
    if (!supportData) return [];
    const list = isUserRetailer ? supportData.retailerFaqs : supportData.customerFaqs;
    return list || [];
  }, [supportData, isUserRetailer]);

  // Categories list
  const categories = useMemo(() => {
    const cats = new Set<string>();
    activeFaqs.forEach((f) => {
      if (f.category) cats.add(f.category);
    });
    return Array.from(cats);
  }, [activeFaqs]);

  // Filtered FAQs based on category
  const filteredFaqs = useMemo(() => {
    return activeFaqs.filter((faq) => {
      return selectedCategory === 'ALL' || faq.category === selectedCategory;
    });
  }, [activeFaqs, selectedCategory]);

  const handleCall = () => {
    const phone = supportData?.tollFreeNumber || '1800-209-3374';
    window.location.href = `tel:${phone.replace(/[^0-9+]/g, '')}`;
  };

  const handleWhatsApp = () => {
    const rawNumber = supportData?.whatsappNumber || '+919876543210';
    const cleanNumber = rawNumber.replace(/[^0-9]/g, '');
    const text = encodeURIComponent(
      `Hello SVV Balaji Support Team, I need assistance with my ${
        isUserRetailer ? 'Wholesale Store Account' : 'Customer Grocery Order'
      }.`,
    );
    window.open(`https://wa.me/${cleanNumber}?text=${text}`, '_blank');
  };

  const handleEmail = () => {
    const email = supportData?.supportEmail || 'support@svvbalaji.com';
    const activePhone = isUserRetailer ? retailerProfile?.phone : customerProfile?.phone;
    const subject = encodeURIComponent(
      `Support Request - ${activePhone ? `Account ${activePhone}` : 'SVV Balaji App'}`,
    );
    window.location.href = `mailto:${email}?subject=${subject}`;
  };

  const handleTicketSubmit = () => {
    if (!ticketForm.subject.trim() || !ticketForm.description.trim()) {
      message.warning('Please fill in both subject and description');
      return;
    }
    setSubmittingTicket(true);
    setTimeout(() => {
      setSubmittingTicket(false);
      setTicketModalOpen(false);
      message.success('Your support ticket has been submitted. Our executive will reach out shortly!');
      setTicketForm({ subject: '', orderNumber: '', category: 'ORDER_ISSUE', description: '' });
    }, 800);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: 80 }}>
      {/* Sticky Top Header Bar - Optimized for 320px Mobile S */}
      <header
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          padding: '10px 12px',
          position: 'sticky',
          top: 0,
          zIndex: 90,
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
            <button
              onClick={() => navigate(-1)}
              style={{
                background: '#f1f5f9',
                border: 'none',
                borderRadius: 8,
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#334155',
                flexShrink: 0,
              }}
              title="Back"
            >
              <ArrowLeftOutlined style={{ fontSize: 14 }} />
            </button>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                  Help & Support
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 8,
                    background: isUserRetailer ? '#dbeafe' : '#dcfce7',
                    color: isUserRetailer ? '#1e40af' : '#15803d',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {isUserRetailer ? 'B2B' : 'Care'}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#22c55e',
                boxShadow: '0 0 0 2px rgba(34, 197, 94, 0.25)',
                display: 'inline-block',
              }}
            />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#15803d', whiteSpace: 'nowrap' }}>
              Online
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '12px 12px 40px 12px' }}>
        {/* Integrated Brand Hero Card */}
        <div
          style={{
            background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)',
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow: '0 4px 14px -4px rgba(6, 78, 59, 0.25)',
            marginBottom: 12,
          }}
        >
          <div style={{ padding: '16px 14px 12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  color: '#ffffff',
                  fontSize: 9.5,
                  fontWeight: 800,
                  padding: '1px 8px',
                  borderRadius: 8,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                SVV BALAJI
              </span>
              <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.8)' }}>
                Helpdesk 24x7
              </span>
            </div>

            <Title
              level={4}
              style={{
                color: '#ffffff',
                margin: '0 0 4px 0',
                fontSize: 16.5,
                fontWeight: 700,
              }}
            >
              How can we help you today?
            </Title>
            <Paragraph
              style={{
                color: 'rgba(255, 255, 255, 0.88)',
                margin: 0,
                fontSize: 12,
                lineHeight: 1.4,
              }}
            >
              Connect with our live helpline, chat on WhatsApp, or browse FAQs below.
            </Paragraph>
          </div>

          {/* Integrated Status Strip */}
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.18)',
              borderTop: '1px solid rgba(255, 255, 255, 0.12)',
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 4,
              fontSize: 11,
              color: 'rgba(255, 255, 255, 0.92)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {isUserRetailer ? (
                <>
                  <ShopOutlined style={{ color: '#93c5fd' }} />
                  <span style={{ fontWeight: 600 }}>
                    B2B Store Partner Desk {retailerProfile?.storeName ? `(${retailerProfile.storeName})` : ''}
                  </span>
                </>
              ) : (
                <>
                  <UserOutlined style={{ color: '#86efac' }} />
                  <span style={{ fontWeight: 600 }}>Personal Shopper Desk</span>
                </>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255, 255, 255, 0.8)' }}>
              <ClockCircleOutlined style={{ color: '#86efac' }} />
              <span>{supportData?.operatingHours || 'Mon - Sat: 8 AM - 9 PM'}</span>
            </div>
          </div>
        </div>

        {/* Quick Order Help Shortcut Banner */}
        <div
          onClick={() => navigate('/orders')}
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '10px 12px',
            marginBottom: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#fef3c7',
                color: '#d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                flexShrink: 0,
              }}
            >
              <ShoppingOutlined />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                Need help with an order?
              </div>
              <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Track delivery, missing items, or returns
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#059669', fontWeight: 600, fontSize: 12, flexShrink: 0 }}>
            <span>Orders</span>
            <RightOutlined style={{ fontSize: 10 }} />
          </div>
        </div>

        {/* Direct Contact Channels - Sleek Compact Mobile Rows */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
            Direct Contact Channels
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Helpline Calling */}
            <div
              onClick={handleCall}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: '#eff6ff',
                    color: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 17,
                    flexShrink: 0,
                  }}
                >
                  <PhoneOutlined />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                      Helpline Calling
                    </span>
                    <Tag color="blue" style={{ margin: 0, fontSize: 9.5, padding: '0 4px', lineHeight: '16px', borderRadius: 4 }}>
                      Toll-Free
                    </Tag>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#2563eb', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {supportData?.tollFreeNumber || '1800-209-DESI'}
                  </div>
                </div>
              </div>

              <Button
                type="primary"
                ghost
                size="small"
                icon={<PhoneOutlined />}
                style={{
                  borderRadius: 8,
                  borderColor: '#93c5fd',
                  color: '#1d4ed8',
                  fontWeight: 600,
                  fontSize: 11.5,
                  height: 30,
                  padding: '0 10px',
                  flexShrink: 0,
                }}
              >
                Call
              </Button>
            </div>

            {/* WhatsApp Support Desk */}
            <div
              onClick={handleWhatsApp}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: '#ecfdf5',
                    color: '#059669',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  <WhatsAppOutlined />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                      WhatsApp Desk
                    </span>
                    <Tag color="green" style={{ margin: 0, fontSize: 9.5, padding: '0 4px', lineHeight: '16px', borderRadius: 4 }}>
                      Fast 5m
                    </Tag>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#059669', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {supportData?.whatsappNumber || '+91 98765 43210'}
                  </div>
                </div>
              </div>

              <Button
                type="primary"
                size="small"
                icon={<WhatsAppOutlined />}
                style={{
                  borderRadius: 8,
                  background: '#059669',
                  borderColor: '#059669',
                  fontWeight: 600,
                  fontSize: 11.5,
                  height: 30,
                  padding: '0 10px',
                  flexShrink: 0,
                }}
              >
                Chat
              </Button>
            </div>

            {/* Submit Support Ticket */}
            <div
              onClick={() => setTicketModalOpen(true)}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: '#fef3c7',
                    color: '#d97706',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 17,
                    flexShrink: 0,
                  }}
                >
                  <FileTextOutlined />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                      Submit Ticket
                    </span>
                    <Tag color="gold" style={{ margin: 0, fontSize: 9.5, padding: '0 4px', lineHeight: '16px', borderRadius: 4 }}>
                      Ticket
                    </Tag>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#b45309', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {supportData?.supportEmail || 'support@svvbalaji.com'}
                  </div>
                </div>
              </div>

              <Button
                type="default"
                size="small"
                icon={<FileTextOutlined />}
                style={{
                  borderRadius: 8,
                  borderColor: '#fcd34d',
                  color: '#b45309',
                  fontWeight: 600,
                  fontSize: 11.5,
                  height: 30,
                  padding: '0 10px',
                  flexShrink: 0,
                }}
              >
                Raise
              </Button>
            </div>
          </div>
        </div>

        {/* Category Filter Chips */}
        {categories.length > 0 && (
          <div
            className="no-scrollbar"
            style={{
              marginBottom: 18,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              overflowX: 'auto',
              whiteSpace: 'nowrap',
              paddingBottom: 4,
              paddingTop: 2,
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <button
              onClick={() => setSelectedCategory('ALL')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                flexShrink: 0,
                whiteSpace: 'nowrap',
                height: 34,
                borderRadius: 8,
                padding: '0 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                border: '1px solid',
                borderColor: selectedCategory === 'ALL' ? '#059669' : '#e2e8f0',
                background: selectedCategory === 'ALL' ? '#059669' : '#ffffff',
                color: selectedCategory === 'ALL' ? '#ffffff' : '#334155',
                boxShadow: selectedCategory === 'ALL' ? '0 1px 4px rgba(5, 150, 105, 0.2)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              All Topics ({activeFaqs.length})
            </button>

            {categories.map((cat) => {
              const isSelected = selectedCategory === cat;
              const count = activeFaqs.filter((f) => f.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    height: 34,
                    borderRadius: 8,
                    padding: '0 14px',
                    fontSize: 13,
                    fontWeight: isSelected ? 600 : 500,
                    cursor: 'pointer',
                    border: '1px solid',
                    borderColor: isSelected ? '#059669' : '#e2e8f0',
                    background: isSelected ? '#059669' : '#ffffff',
                    color: isSelected ? '#ffffff' : '#475569',
                    boxShadow: isSelected ? '0 1px 4px rgba(5, 150, 105, 0.2)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{cat}</span>
                  <span
                    style={{
                      fontSize: 11,
                      padding: '1px 6px',
                      borderRadius: 10,
                      background: isSelected ? 'rgba(255, 255, 255, 0.25)' : '#f1f5f9',
                      color: isSelected ? '#ffffff' : '#64748b',
                      fontWeight: 600,
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Dynamic FAQs Accordion Section */}
        <Card
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <QuestionCircleOutlined style={{ color: '#059669', fontSize: 18 }} />
              <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>
                {isUserRetailer ? 'Retailer & Wholesale FAQs' : 'Frequently Asked Questions'}
              </span>
            </div>
          }
          extra={
            <Tag color="green" style={{ borderRadius: 8, fontWeight: 600, fontSize: 11 }}>
              {filteredFaqs.length} Answers
            </Tag>
          }
          style={{
            borderRadius: 14,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            marginBottom: 20,
          }}
          bodyStyle={{ padding: filteredFaqs.length === 0 ? 24 : '8px 16px 16px 16px' }}
        >
          {isLoading ? (
            <Skeleton active paragraph={{ rows: 5 }} />
          ) : filteredFaqs.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <span style={{ color: '#64748b', fontSize: 13 }}>
                  No questions available under this topic. Feel free to contact our support team.
                </span>
              }
            >
              <Button
                type="primary"
                size="small"
                onClick={handleWhatsApp}
                style={{ borderRadius: 6, background: '#059669', borderColor: '#059669' }}
              >
                Ask on WhatsApp
              </Button>
            </Empty>
          ) : (
            <Collapse
              bordered={false}
              defaultActiveKey={['0']}
              expandIconPosition="end"
              style={{ background: 'transparent' }}
              items={filteredFaqs.map((faq, idx) => ({
                key: String(idx),
                label: (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span
                      style={{
                        background: '#f1f5f9',
                        color: '#475569',
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: 6,
                        marginTop: 1,
                        flexShrink: 0,
                      }}
                    >
                      Q{idx + 1}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 13.5, color: '#1e293b', lineHeight: 1.4 }}>
                      {faq.question}
                    </span>
                  </div>
                ),
                children: (
                  <div style={{ padding: '0 8px 12px 36px', color: '#475569', fontSize: 13, lineHeight: 1.6 }}>
                    {faq.answer}
                    {faq.category && (
                      <div style={{ marginTop: 8 }}>
                        <Tag style={{ fontSize: 10.5, borderRadius: 6, background: '#f8fafc', borderColor: '#e2e8f0' }}>
                          📁 {faq.category}
                        </Tag>
                      </div>
                    )}
                  </div>
                ),
              }))}
            />
          )}
        </Card>

        {/* Office & Registered Facility Card */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#f1f5f9',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                flexShrink: 0,
              }}
            >
              <EnvironmentOutlined />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                SVV Balaji Registered Facility
              </div>
              <div style={{ fontSize: 11.5, color: '#64748b', lineHeight: 1.4 }}>
                {supportData?.officeAddress || 'SVV Balaji Corporate Mandi Complex, Hyderabad, Telangana, India'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              size="small"
              icon={<WhatsAppOutlined />}
              onClick={handleWhatsApp}
              style={{ borderRadius: 8, borderColor: '#059669', color: '#059669', fontWeight: 600, fontSize: 12, flex: 1, height: 32 }}
            >
              WhatsApp
            </Button>
            <Button
              type="primary"
              size="small"
              icon={<MailOutlined />}
              onClick={handleEmail}
              style={{ borderRadius: 8, background: '#059669', borderColor: '#059669', fontWeight: 600, fontSize: 12, flex: 1, height: 32 }}
            >
              Email Us
            </Button>
          </div>
        </div>
      </div>

      {/* Raise a Support Ticket Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileTextOutlined style={{ color: '#059669' }} />
            <span style={{ fontWeight: 700 }}>Submit Support Request</span>
          </div>
        }
        open={ticketModalOpen}
        onCancel={() => setTicketModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setTicketModalOpen(false)} style={{ borderRadius: 8 }}>
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            icon={<SendOutlined />}
            loading={submittingTicket}
            onClick={handleTicketSubmit}
            style={{ borderRadius: 8, background: '#059669', borderColor: '#059669', fontWeight: 600 }}
          >
            Submit Request
          </Button>,
        ]}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          <div>
            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
              Issue Category:
            </Text>
            <Select
              value={ticketForm.category}
              onChange={(val) => setTicketForm((f) => ({ ...f, category: val }))}
              style={{ width: '100%' }}
              options={[
                { value: 'ORDER_ISSUE', label: '📦 Order Issue / Missing Items' },
                { value: 'PAYMENT_REFUND', label: '💳 Payment & Refund Inquiry' },
                { value: 'DELIVERY_DELAY', label: '🚚 Delivery Tracking Delay' },
                { value: 'ACCOUNT_GST', label: '🏢 GST Billing & Account Details' },
                { value: 'OTHER', label: '💬 Other Question' },
              ]}
            />
          </div>

          <div>
            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
              Subject:
            </Text>
            <Input
              placeholder="e.g., Damaged item in order or GST credit query"
              value={ticketForm.subject}
              onChange={(e) => setTicketForm((f) => ({ ...f, subject: e.target.value }))}
              style={{ borderRadius: 8 }}
            />
          </div>

          <div>
            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
              Order Number (Optional):
            </Text>
            <Input
              placeholder="e.g., SO-20260921-151"
              value={ticketForm.orderNumber}
              onChange={(e) => setTicketForm((f) => ({ ...f, orderNumber: e.target.value }))}
              style={{ borderRadius: 8 }}
            />
          </div>

          <div>
            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
              Description:
            </Text>
            <Input.TextArea
              rows={4}
              placeholder="Please describe the issue in detail so our support executive can resolve it promptly..."
              value={ticketForm.description}
              onChange={(e) => setTicketForm((f) => ({ ...f, description: e.target.value }))}
              style={{ borderRadius: 8 }}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
