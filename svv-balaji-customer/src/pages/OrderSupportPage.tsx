import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  CustomerServiceOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  MessageOutlined,
  RedoOutlined,
  RightOutlined,
  SendOutlined,
  ShoppingOutlined,
  SmileOutlined,
  SyncOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Skeleton, Typography, message } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { checkoutApi, type OrderDetail, type OrderSummaryRow } from '../api/checkout';
import type { SupportTicketCategory } from '../api/supportTickets';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { useCreateSupportTicket } from '../hooks/useSupportTickets';
import { formatInr } from '../utils/money';

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  senderName?: string;
  text: string;
  orderInfo?: {
    date: string;
    itemsText: string;
  };
  options?: Array<{
    id: string;
    text: string;
    boldWords?: string[];
    action: () => void;
  }>;
  timestamp: string;
}

const getCurrentTimeStr = () =>
  new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

export function OrderSupportPage() {
  const navigate = useNavigate();
  const { orderId: paramOrderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const queryOrderId = searchParams.get('orderId');
  const activeOrderNumber = paramOrderId || queryOrderId;

  const { isLoggedIn, customerProfile } = useCustomerAuth();
  const createTicket = useCreateSupportTicket();

  // Fetch orders list if no active order is selected or for order picker
  const ordersQuery = useQuery({
    queryKey: ['storefront', 'orders'],
    queryFn: checkoutApi.orders,
    enabled: isLoggedIn,
  });

  // Fetch single order details if orderNumber present
  const orderDetailsQuery = useQuery({
    queryKey: ['storefront', 'orders', activeOrderNumber],
    queryFn: () => checkoutApi.order(activeOrderNumber as string),
    enabled: Boolean(activeOrderNumber),
  });

  const activeOrder: OrderDetail | undefined = orderDetailsQuery.data;
  const recentOrders: OrderSummaryRow[] = ordersQuery.data ?? [];

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Helper to format date
  const formatOrderDate = (isoString?: string) => {
    if (!isoString) return 'Recent Order';
    const d = new Date(isoString);
    return d.toLocaleDateString('en-IN', { month: 'long', day: 'numeric' }) + ', ' + d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  };

  // Build items summary string
  const getItemsSummary = (order?: OrderDetail) => {
    if (!order || !order.items || order.items.length === 0) return 'Various Grocery Items';
    return order.items.map((i) => `${i.name || 'Item'} (×${i.quantity})`).join(', ');
  };

  // Initialize Conversation
  useEffect(() => {
    if (activeOrderNumber && orderDetailsQuery.isLoading) return;

    const targetOrder = activeOrder || (recentOrders.length > 0 ? recentOrders[0] : null);
    const orderDate = targetOrder ? formatOrderDate((targetOrder as any).placedAt || (targetOrder as any).createdAt) : 'Recent Order';
    const itemsText = activeOrder ? getItemsSummary(activeOrder) : targetOrder ? (targetOrder as any).lines?.map((l: any) => l.name).join(', ') || 'Items' : 'Items';

    const initialMsgs: ChatMessage[] = [
      {
        id: 'msg-1',
        sender: 'bot',
        senderName: 'DesiTokri Buddy',
        text: targetOrder
          ? `Hi, we're happy to assist you for order #${targetOrder.orderNumber} placed on ${orderDate}`
          : `Hi, we're happy to assist you with your Desi Tokri orders!`,
        orderInfo: {
          date: orderDate,
          itemsText: itemsText,
        },
        timestamp: getCurrentTimeStr(),
      },
      {
        id: 'msg-2',
        sender: 'bot',
        senderName: 'DesiTokri Buddy',
        text: 'How may I help you today?',
        timestamp: getCurrentTimeStr(),
        options: getMainOptions(targetOrder?.orderNumber),
      },
    ];

    setMessages(initialMsgs);
  }, [activeOrderNumber, orderDetailsQuery.isLoading, ordersQuery.isLoading]);

  // Generate Main Options
  const getMainOptions = (ordNo?: string) => {
    return [
      {
        id: 'opt-item-issue',
        text: 'I have an issue with the ordered item(s)',
        boldWords: ['issue', 'ordered item(s)'],
        action: () => handleSelectOption('I have an issue with the ordered item(s)', 'item-issue'),
      },
      {
        id: 'opt-delivery-misconduct',
        text: 'I want to report delivery partner misconduct',
        action: () => handleSelectOption('I want to report delivery partner misconduct', 'delivery-misconduct'),
      },
      {
        id: 'opt-other-issue',
        text: 'I have another issue with my order',
        boldWords: ['another issue'],
        action: () => handleSelectOption('I have another issue with my order', 'other-issue'),
      },
      {
        id: 'opt-main-menu',
        text: 'Go back to main menu',
        action: () => handleSelectOption('Go back to main menu', 'main-menu'),
      },
    ];
  };

  // Add User message and trigger bot response
  const addUserMessage = (text: string) => {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: getCurrentTimeStr(),
    };
    setMessages((prev) => [...prev, userMsg]);
  };

  const addBotMessage = (text: string, options?: ChatMessage['options']) => {
    setTimeout(() => {
      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        senderName: 'DesiTokri Buddy',
        text,
        timestamp: getCurrentTimeStr(),
        options,
      };
      setMessages((prev) => [...prev, botMsg]);
    }, 400);
  };

  // Flow Handlers
  const handleSelectOption = (userLabel: string, flowKey: string) => {
    addUserMessage(userLabel);

    if (flowKey === 'main-menu') {
      addBotMessage('Here is the main menu. How else can I assist you?', getMainOptions(activeOrderNumber));
      return;
    }

    if (flowKey === 'item-issue') {
      if (activeOrder && activeOrder.items.length > 0) {
        const itemOptions = activeOrder.items.map((item) => ({
          id: `item-${item.productId}`,
          text: `Problem with ${item.name || 'Product'} (×${item.quantity})`,
          action: () => handleItemProblemSelect(item.name || 'Product'),
        }));
        itemOptions.push({
          id: 'item-all',
          text: 'Problem with multiple / all items',
          action: () => handleItemProblemSelect('Multiple items'),
        });
        itemOptions.push({
          id: 'item-back',
          text: 'Go back to main menu',
          action: () => handleSelectOption('Go back to main menu', 'main-menu'),
        });

        addBotMessage('Please select the item you are facing an issue with:', itemOptions);
      } else {
        addBotMessage('What problem are you facing with your item(s)?', [
          {
            id: 'prob-damaged',
            text: 'Damaged or spoiled product received',
            action: () => handleIssueTypeSelect('ORDER_ISSUE', 'Damaged / Spoiled product'),
          },
          {
            id: 'prob-missing',
            text: 'Item missing from package',
            action: () => handleIssueTypeSelect('ORDER_ISSUE', 'Missing item from package'),
          },
          {
            id: 'prob-wrong',
            text: 'Received wrong product',
            action: () => handleIssueTypeSelect('ORDER_ISSUE', 'Wrong item received'),
          },
          {
            id: 'prob-quality',
            text: 'Quality / Expiry date concern',
            action: () => handleIssueTypeSelect('ORDER_ISSUE', 'Quality / Expiry concern'),
          },
          {
            id: 'prob-back',
            text: 'Go back to main menu',
            action: () => handleSelectOption('Go back to main menu', 'main-menu'),
          },
        ]);
      }
    } else if (flowKey === 'delivery-misconduct') {
      addBotMessage('We take delivery partner misconduct very seriously. Please specify what happened:', [
        {
          id: 'del-rude',
          text: 'Delivery partner was rude / unprofessional',
          action: () => handleIssueTypeSelect('DELIVERY_DELAY', 'Delivery partner rude / unprofessional'),
        },
        {
          id: 'del-extra-cash',
          text: 'Demanded extra cash or fee',
          action: () => handleIssueTypeSelect('DELIVERY_DELAY', 'Demanded extra cash / fee'),
        },
        {
          id: 'del-careless',
          text: 'Handled parcel carelessly / dropped bag',
          action: () => handleIssueTypeSelect('DELIVERY_DELAY', 'Handled parcel carelessly'),
        },
        {
          id: 'del-back',
          text: 'Go back to main menu',
          action: () => handleSelectOption('Go back to main menu', 'main-menu'),
        },
      ]);
    } else if (flowKey === 'other-issue') {
      addBotMessage('Please select your query category:', [
        {
          id: 'oth-delay',
          text: 'Order is delayed / Not delivered yet',
          action: () => handleIssueTypeSelect('DELIVERY_DELAY', 'Order delivery delayed'),
        },
        {
          id: 'oth-payment',
          text: 'Payment / Refund inquiry',
          action: () => handleIssueTypeSelect('PAYMENT_REFUND', 'Payment or Refund inquiry'),
        },
        {
          id: 'oth-invoice',
          text: 'Need GST invoice copy',
          action: () => handleIssueTypeSelect('ACCOUNT_GST', 'GST Invoice request'),
        },
        {
          id: 'oth-back',
          text: 'Go back to main menu',
          action: () => handleSelectOption('Go back to main menu', 'main-menu'),
        },
      ]);
    }
  };

  const handleItemProblemSelect = (itemName: string) => {
    addUserMessage(`Issue with ${itemName}`);
    addBotMessage(`What is the specific issue with ${itemName}?`, [
      {
        id: 'spec-damaged',
        text: 'Item is damaged or spoiled',
        action: () => handleResolutionOffer(itemName, 'Damaged / Spoiled'),
      },
      {
        id: 'spec-missing',
        text: 'Item was missing in the bag',
        action: () => handleResolutionOffer(itemName, 'Missing from bag'),
      },
      {
        id: 'spec-wrong',
        text: 'Wrong item delivered',
        action: () => handleResolutionOffer(itemName, 'Wrong item delivered'),
      },
      {
        id: 'spec-back',
        text: 'Go back to main menu',
        action: () => handleSelectOption('Go back to main menu', 'main-menu'),
      },
    ]);
  };

  const handleResolutionOffer = (itemName: string, problemType: string) => {
    addUserMessage(`${problemType}`);
    addBotMessage(
      `We're sincerely sorry for the trouble with ${itemName}. How would you like us to resolve this for you?`,
      [
        {
          id: 'res-wallet',
          text: 'Instant Refund to Desi Tokri Wallet',
          boldWords: ['Instant Refund', 'Desi Tokri Wallet'],
          action: () => submitTicketAndFinalize('ORDER_ISSUE', `Refund request for ${itemName} (${problemType})`, 'Refund to Wallet'),
        },
        {
          id: 'res-replace',
          text: 'Request Replacement Item Delivery',
          boldWords: ['Replacement Item'],
          action: () => submitTicketAndFinalize('ORDER_ISSUE', `Replacement request for ${itemName} (${problemType})`, 'Replacement Delivery'),
        },
        {
          id: 'res-exec',
          text: 'Speak with Support Manager',
          action: () => submitTicketAndFinalize('ORDER_ISSUE', `Callback request for ${itemName} (${problemType})`, 'Support Manager Call'),
        },
      ],
    );
  };

  const handleIssueTypeSelect = (category: SupportTicketCategory, issueSubject: string) => {
    addUserMessage(issueSubject);
    submitTicketAndFinalize(category, issueSubject, 'Logged Ticket');
  };

  const submitTicketAndFinalize = (category: SupportTicketCategory, subject: string, resolutionChoice: string) => {
    createTicket.mutate(
      {
        category,
        subject: `[DesiTokri Support] ${subject}`,
        description: `Customer selected resolution: ${resolutionChoice}. Order Number: ${activeOrderNumber || 'N/A'}.`,
        orderNumber: activeOrderNumber || undefined,
      },
      {
        onSuccess: (ticket) => {
          addBotMessage(
            `✅ Ticket #${ticket.ticketNumber || 'TK-1042'} has been created! Our Desi Tokri support executive is processing your ${resolutionChoice.toLowerCase()}. You will receive updates via SMS and WhatsApp.`,
            [
              {
                id: 'fin-orders',
                text: 'View My Orders',
                action: () => navigate('/orders'),
              },
              {
                id: 'fin-menu',
                text: 'Go back to main menu',
                action: () => handleSelectOption('Go back to main menu', 'main-menu'),
              },
            ],
          );
        },
        onError: () => {
          addBotMessage(`Your request for "${subject}" has been logged. Our Desi Tokri team will contact you within 15 minutes!`, [
            {
              id: 'err-menu',
              text: 'Go back to main menu',
              action: () => handleSelectOption('Go back to main menu', 'main-menu'),
            },
          ]);
        },
      },
    );
  };

  // Custom User Typing Send
  const handleSendCustomText = () => {
    if (!inputText.trim()) return;
    const txt = inputText.trim();
    setInputText('');
    addUserMessage(txt);
    submitTicketAndFinalize('OTHER', txt, 'Custom Query');
  };

  const handleEndChat = () => {
    message.info('Support chat ended');
    if (activeOrderNumber) {
      navigate(`/orders/${activeOrderNumber}`);
    } else {
      navigate('/orders');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      {/* Header Bar - Matching Blinkit Support Header */}
      <header
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          padding: '12px 16px',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              color: '#0f172a',
            }}
          >
            <ArrowLeftOutlined style={{ fontSize: 18 }} />
          </button>
          <div>
            <Typography.Text strong style={{ fontSize: 16, color: '#0f172a', display: 'block', lineHeight: 1.2 }}>
              Desi Tokri Support
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12.5, color: '#64748b' }}>
              Your personal virtual assistant
            </Typography.Text>
          </div>
        </div>

        <button
          onClick={handleEndChat}
          style={{
            background: 'none',
            border: 'none',
            color: '#16a34a',
            fontSize: 14.5,
            fontWeight: 600,
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          End chat
        </button>
      </header>

      {/* Main Chat Stream Container */}
      <div
        style={{
          flex: 1,
          maxWidth: 580,
          width: '100%',
          margin: '0 auto',
          padding: '16px 12px 100px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Date Divider */}
        <div style={{ textAlign: 'center', margin: '4px 0 8px' }}>
          <span
            style={{
              fontSize: 12.5,
              color: '#64748b',
              fontWeight: 500,
              background: '#e2e8f0',
              padding: '3px 12px',
              borderRadius: 12,
            }}
          >
            Today
          </span>
        </div>

        {/* Message List */}
        {messages.map((msg) => (
          <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start' }}>
            {/* Sender Name if Bot */}
            {msg.sender === 'bot' ? (
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a', marginBottom: 4, marginLeft: 2 }}>
                {msg.senderName || 'DesiTokri Buddy'}
              </span>
            ) : null}

            {/* Bubble Card */}
            <div
              style={{
                maxWidth: '86%',
                background: msg.sender === 'user' ? '#16a34a' : '#eff6ff',
                color: msg.sender === 'user' ? '#ffffff' : '#1e293b',
                borderRadius: msg.sender === 'user' ? '18px 18px 2px 18px' : '18px 18px 18px 2px',
                padding: '12px 16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                fontSize: 14.5,
                lineHeight: 1.5,
                border: msg.sender === 'user' ? 'none' : '1px solid #dbeafe',
                position: 'relative',
              }}
            >
              <div>{msg.text}</div>

              {/* Order Contents detail box if provided */}
              {msg.orderInfo ? (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #cbd5e1', fontSize: 13.5, color: '#334155' }}>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>Order Contents: </span>
                  {msg.orderInfo.itemsText}
                </div>
              ) : null}

              {/* Message Timestamp */}
              <div
                style={{
                  textAlign: 'right',
                  fontSize: 11,
                  color: msg.sender === 'user' ? 'rgba(255,255,255,0.85)' : '#64748b',
                  marginTop: 6,
                }}
              >
                {msg.timestamp}
              </div>
            </div>

            {/* Interactive Options list card attached to Bot message */}
            {msg.options && msg.options.length > 0 ? (
              <div
                style={{
                  maxWidth: '86%',
                  width: '100%',
                  marginTop: 8,
                  background: '#ffffff',
                  borderRadius: 16,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  overflow: 'hidden',
                }}
              >
                {msg.options.map((opt, idx) => (
                  <button
                    key={opt.id}
                    onClick={opt.action}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      borderBottom: idx < msg.options!.length - 1 ? '1px solid #f1f5f9' : 'none',
                      padding: '13px 16px',
                      cursor: 'pointer',
                      fontSize: 14,
                      color: '#2563eb',
                      fontWeight: 500,
                      lineHeight: 1.45,
                      transition: 'background 0.2s',
                    }}
                    onMouseDown={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseUp={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    {renderOptionText(opt.text, opt.boldWords)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Bottom Sticky Typing Bar */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: '#ffffff',
          borderTop: '1px solid #e2e8f0',
          padding: '10px 14px',
          zIndex: 100,
          boxShadow: '0 -2px 10px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ maxWidth: 580, margin: '0 auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          <Input
            placeholder="Type your message here..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onPressEnter={handleSendCustomText}
            style={{
              borderRadius: 24,
              padding: '8px 16px',
              fontSize: 14.5,
              borderColor: '#cbd5e1',
            }}
          />
          <Button
            type="primary"
            shape="circle"
            icon={<SendOutlined />}
            onClick={handleSendCustomText}
            disabled={!inputText.trim()}
            style={{
              background: inputText.trim() ? '#16a34a' : '#cbd5e1',
              borderColor: inputText.trim() ? '#16a34a' : '#cbd5e1',
              flexShrink: 0,
              width: 40,
              height: 40,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// Helper to bold specific keywords in option text
function renderOptionText(text: string, boldWords?: string[]) {
  if (!boldWords || boldWords.length === 0) return text;
  let result = text;
  // Simple check for key words like issue, ordered item(s), etc.
  if (text.includes('issue') && text.includes('ordered item(s)')) {
    return (
      <span>
        I have an <strong style={{ fontWeight: 700 }}>issue</strong> with the{' '}
        <strong style={{ fontWeight: 700 }}>ordered item(s)</strong>
      </span>
    );
  }
  if (text.includes('another issue')) {
    return (
      <span>
        I have <strong style={{ fontWeight: 700 }}>another issue</strong> with my order
      </span>
    );
  }
  if (text.includes('Instant Refund') || text.includes('Desi Tokri Wallet')) {
    return (
      <span>
        <strong style={{ fontWeight: 700 }}>Instant Refund</strong> to{' '}
        <strong style={{ fontWeight: 700 }}>Desi Tokri Wallet</strong>
      </span>
    );
  }
  return text;
}
