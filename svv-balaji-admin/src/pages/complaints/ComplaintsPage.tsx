import {
  AlertOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
  FileProtectOutlined,
  FilterOutlined,
  PictureOutlined,
  PlusOutlined,
  ReloadOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  ShoppingOutlined,
  SyncOutlined,
  UserOutlined,
  WarningOutlined,
  SwapOutlined,
  BarcodeOutlined,
  DollarOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Can } from '../../components/Can';
import { PageHeader } from '../../components/PageHeader';
import { formatCurrency } from '../../utils/format';

const { Text, Title, Paragraph } = Typography;

export interface ComplaintTicket {
  id: string;
  channel: 'B2C' | 'B2B';
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  companyName?: string;
  gstin?: string;
  category: 'DAMAGED_PACKAGING' | 'QUALITY_DEFECT' | 'SHORTAGE' | 'RATE_DISCREPANCY' | 'LATE_DELIVERY' | 'WRONG_ITEM';
  categoryLabel: string;
  subType: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  slaRemainingHours: number;
  orderId: string;
  orderAmount: number;
  orderDate: string;
  status: 'NEW_OPEN' | 'UNDER_INSPECTION' | 'ACTION_REQUIRED' | 'REPLACEMENT_DISPATCHED' | 'REFUND_APPROVED' | 'REJECTED';
  description: string;
  evidenceImages: string[];
  fgBatchId: string;
  rmLotId: string;
  warehouseNode: string;
  farmOrigin: string;
  createdAt: string;
  resolutionNote?: string;
}

export const MOCK_COMPLAINTS: ComplaintTicket[] = [
  {
    id: 'TKT-B2C-9041',
    channel: 'B2C',
    customerName: 'Ananya Sharma',
    customerPhone: '+91 98765 43210',
    customerEmail: 'ananya.sharma@gmail.com',
    category: 'DAMAGED_PACKAGING',
    categoryLabel: 'Damaged Packaging',
    subType: 'Torn 10KG Bag & Spillage',
    priority: 'HIGH',
    slaRemainingHours: 3.5,
    orderId: '#B2C-10941',
    orderAmount: 850,
    orderDate: '15 Sept 2026',
    status: 'NEW_OPEN',
    description: 'The 10KG Sharbati Atta bag arrived with a side tear, causing around 2kg flour spillage inside outer delivery box.',
    evidenceImages: [
      'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=600',
      'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&q=80&w=600',
    ],
    fgBatchId: 'FG-ATT-20260912-04',
    rmLotId: 'RM-20260810-FARM-012',
    warehouseNode: 'Patna Central Processing Hub (WH-PAT-01)',
    farmOrigin: 'M/s MP Organic Wheat Farmers Co-Op (FRM-MP-8812)',
    createdAt: '16 Sept 2026 14:30',
  },
  {
    id: 'TKT-B2B-1102',
    channel: 'B2B',
    customerName: 'Rajesh Kumar (Purchase Mgr)',
    customerPhone: '+91 99887 66554',
    customerEmail: 'purchase@balajikirana.com',
    companyName: 'Balaji Supermart Pvt Ltd',
    gstin: '10AAACB1234F1Z8',
    category: 'SHORTAGE',
    categoryLabel: 'Shortage in Master Carton',
    subType: 'Missing 2 Units in Crates',
    priority: 'CRITICAL',
    slaRemainingHours: -1.5,
    orderId: '#B2B-PO-8812',
    orderAmount: 48500,
    orderDate: '14 Sept 2026',
    status: 'ACTION_REQUIRED',
    description: 'Out of 20 Master Cartons of 1L Desi Ghee Jars, 2 jars were missing in Carton #04 upon warehouse seal verification.',
    evidenceImages: [
      'https://images.unsplash.com/photo-1589927986076-2d5f07d5c181?auto=format&fit=crop&q=80&w=600',
    ],
    fgBatchId: 'FG-GHE-20260910-02',
    rmLotId: 'RM-20260805-GIR-008',
    warehouseNode: 'Regional Depot - Varanasi Hub (WH-VNS-02)',
    farmOrigin: 'Gir Cow Dairy Cluster, Gujarat (FRM-GIR-9910)',
    createdAt: '15 Sept 2026 09:15',
  },
  {
    id: 'TKT-B2C-9038',
    channel: 'B2C',
    customerName: 'Vikram Singh',
    customerPhone: '+91 91234 56789',
    customerEmail: 'vikram.vns@yahoo.com',
    category: 'QUALITY_DEFECT',
    categoryLabel: 'Quality Grade Issue',
    subType: 'Aroma & Color Variation',
    priority: 'MEDIUM',
    slaRemainingHours: 14.0,
    orderId: '#B2C-10892',
    orderAmount: 1420,
    orderDate: '13 Sept 2026',
    status: 'UNDER_INSPECTION',
    description: 'Kachi Ghani Mustard Oil has darker shade than previous batch order. Request QA lab test verification.',
    evidenceImages: [
      'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&q=80&w=600',
    ],
    fgBatchId: 'FG-OIL-20260908-01',
    rmLotId: 'RM-20260812-MUSTARD-03',
    warehouseNode: 'Patna Central Processing Hub (WH-PAT-01)',
    farmOrigin: 'Rajasthan Mustard Farmers Cluster (FRM-RAJ-4410)',
    createdAt: '16 Sept 2026 11:20',
  },
  {
    id: 'TKT-B2B-1095',
    channel: 'B2B',
    customerName: 'Sanjay Verma (Store Manager)',
    customerPhone: '+91 94567 12345',
    customerEmail: 'sanjay@vermahypershop.com',
    companyName: 'Verma Wholesale Hypermarket',
    gstin: '09AAACV5678G1Z2',
    category: 'RATE_DISCREPANCY',
    categoryLabel: 'Invoice Rate Mismatch',
    subType: 'B2B Wholesale Tier Discrepancy',
    priority: 'HIGH',
    slaRemainingHours: 6.0,
    orderId: '#B2B-PO-8790',
    orderAmount: 125000,
    orderDate: '12 Sept 2026',
    status: 'REFUND_APPROVED',
    description: 'Contract agreed tier rate was ₹82/kg for 1121 Basmati Rice, but invoice billed MSRP at ₹88/kg. Request Credit Note for difference of ₹6,000.',
    evidenceImages: [
      'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=600',
    ],
    fgBatchId: 'FG-RCE-20260905-09',
    rmLotId: 'RM-20260801-PUNJAB-11',
    warehouseNode: 'North Regional Distribution Center (WH-DEL-01)',
    farmOrigin: 'Punjab Paddy Farmers Cooperative (FRM-PUN-1002)',
    createdAt: '14 Sept 2026 16:45',
    resolutionNote: 'Credit Note #CN-2026-901 of ₹6,000 approved & issued to B2B wallet balance.',
  },
  {
    id: 'TKT-B2C-9022',
    channel: 'B2C',
    customerName: 'Pooja Mehta',
    customerPhone: '+91 97654 32109',
    customerEmail: 'pooja.mehta@outlook.com',
    category: 'WRONG_ITEM',
    categoryLabel: 'Wrong Item Shipped',
    subType: 'Variant Mis-shipment',
    priority: 'LOW',
    slaRemainingHours: 28.0,
    orderId: '#B2C-10740',
    orderAmount: 490,
    orderDate: '10 Sept 2026',
    status: 'REPLACEMENT_DISPATCHED',
    description: 'Ordered 500g Lakadong Turmeric Powder but received 500g Red Chilli Powder packet.',
    evidenceImages: [
      'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&q=80&w=600',
    ],
    fgBatchId: 'FG-SPC-20260901-05',
    rmLotId: 'RM-20260728-MEGHALAYA-01',
    warehouseNode: 'Patna Central Processing Hub (WH-PAT-01)',
    farmOrigin: 'Meghalaya Lakadong Farmers Society (FRM-MEG-0012)',
    createdAt: '11 Sept 2026 10:00',
    resolutionNote: 'Free replacement order #B2C-REP-9022 dispatched via Bluedart express (AWB: 9940129384).',
  },
];

/**
 * Slide-Out Inspection Drawer Component
 */
function ComplaintInspectionDrawer({
  open,
  complaint,
  onClose,
  onResolveAction,
}: {
  open: boolean;
  complaint: ComplaintTicket | null;
  onClose: () => void;
  onResolveAction: (ticketId: string, actionType: string, note: string) => void;
}) {
  const [actionModalType, setActionModalType] = useState<'REFUND' | 'REPLACEMENT' | 'REVERSE_PICKUP' | 'REJECT' | null>(null);
  const [resolutionNoteInput, setResolutionNoteInput] = useState('');
  const [creditAmount, setCreditAmount] = useState<number>(complaint?.orderAmount || 500);

  if (!complaint) return null;

  const handleConfirmAction = () => {
    if (!actionModalType) return;
    let typeName = '';
    if (actionModalType === 'REFUND') typeName = `Approve Refund / Credit Note of ₹${creditAmount}`;
    if (actionModalType === 'REPLACEMENT') typeName = 'Dispatch Replacement Order';
    if (actionModalType === 'REVERSE_PICKUP') typeName = 'Assign Logistics Reverse Pickup';
    if (actionModalType === 'REJECT') typeName = 'Reject Grievance Ticket';

    onResolveAction(complaint.id, actionModalType, resolutionNoteInput || typeName);
    setActionModalType(null);
    setResolutionNoteInput('');
  };

  return (
    <>
      <Drawer
        title={
          <Space align="center" size={12}>
            <FileProtectOutlined style={{ color: '#1677ff', fontSize: 18 }} />
            <span>Inspection & Grievance Vault: {complaint.id}</span>
            <Tag color={complaint.channel === 'B2B' ? 'purple' : 'blue'}>
              {complaint.channel === 'B2B' ? 'B2B Wholesale Dispute' : 'B2C Shopper Complaint'}
            </Tag>
          </Space>
        }
        width={780}
        open={open}
        onClose={onClose}
        extra={
          <Button onClick={onClose}>Close Vault</Button>
        }
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {/* Header Priority & Status Banner */}
          <Card
            size="small"
            style={{
              borderRadius: 12,
              background: complaint.priority === 'CRITICAL' ? '#fff1f0' : complaint.priority === 'HIGH' ? '#fff7e6' : '#f6ffed',
              borderColor: complaint.priority === 'CRITICAL' ? '#ffa39e' : complaint.priority === 'HIGH' ? '#ffd591' : '#b7eb8f',
            }}
          >
            <Row justify="space-between" align="middle">
              <Col>
                <Space size={8}>
                  <Tag color={complaint.priority === 'CRITICAL' ? 'red' : complaint.priority === 'HIGH' ? 'orange' : 'blue'}>
                    {complaint.priority} PRIORITY
                  </Tag>
                  <Tag color="volcano">{complaint.categoryLabel}</Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Sub-type: <strong>{complaint.subType}</strong>
                  </Text>
                </Space>
              </Col>
              <Col>
                <Space size={6}>
                  <ClockCircleOutlined style={{ color: complaint.slaRemainingHours < 0 ? '#ff4d4f' : '#fa8c16' }} />
                  <Text strong style={{ color: complaint.slaRemainingHours < 0 ? '#ff4d4f' : '#fa8c16', fontSize: 13 }}>
                    {complaint.slaRemainingHours < 0
                      ? `SLA BREACHED (${Math.abs(complaint.slaRemainingHours)}h overdue)`
                      : `SLA Remaining: ${complaint.slaRemainingHours}h`}
                  </Text>
                </Space>
              </Col>
            </Row>
          </Card>

          {/* Complainant & Order Summary Card */}
          <Card size="small" title="1. Complainant Profile & Linked Order Summary" style={{ borderRadius: 8 }}>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Complainant Name">{complaint.customerName}</Descriptions.Item>
              <Descriptions.Item label="Contact Phone">{complaint.customerPhone}</Descriptions.Item>
              <Descriptions.Item label="Email Address">{complaint.customerEmail}</Descriptions.Item>
              <Descriptions.Item label="Channel Type">
                <Tag color={complaint.channel === 'B2B' ? 'purple' : 'cyan'}>
                  {complaint.channel === 'B2B' ? `B2B Retailer (${complaint.companyName || 'Corporate'})` : 'B2C Shopper'}
                </Tag>
              </Descriptions.Item>
              {complaint.gstin && (
                <Descriptions.Item label="GSTIN Number">
                  <Text code>{complaint.gstin}</Text>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Linked Order Reference">
                <Tag color="geekblue" style={{ cursor: 'pointer' }}>
                  {complaint.orderId} ({formatCurrency(complaint.orderAmount)})
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Order Date">{complaint.orderDate}</Descriptions.Item>
              <Descriptions.Item label="Ticket Lodged At">{complaint.createdAt}</Descriptions.Item>
            </Descriptions>
          </Card>

          {/* Evidence Vault */}
          <Card size="small" title="2. Evidence Vault: Uploaded Proofs & Statement" style={{ borderRadius: 8 }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <div>
                <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
                  Grievance Description / Customer Statement:
                </Text>
                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
                  "{complaint.description}"
                </div>
              </div>

              <div>
                <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                  Uploaded Damage Photo / Video Proofs ({complaint.evidenceImages.length}):
                </Text>
                <Image.PreviewGroup>
                  <Space size={12} wrap>
                    {complaint.evidenceImages.map((imgUrl, idx) => (
                      <div
                        key={idx}
                        style={{
                          width: 120,
                          height: 100,
                          borderRadius: 8,
                          overflow: 'hidden',
                          border: '1px solid #d9d9d9',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                        }}
                      >
                        <Image src={imgUrl} width="100%" height="100%" style={{ objectFit: 'cover' }} />
                      </div>
                    ))}
                  </Space>
                </Image.PreviewGroup>
              </div>
            </Space>
          </Card>

          {/* Linked Batch ID & Traceability Reference Badge */}
          <Card
            size="small"
            title={
              <Space>
                <BarcodeOutlined style={{ color: '#1677ff' }} />
                <span>3. Farm-to-Fork Batch Traceability Audit Reference</span>
              </Space>
            }
            style={{ borderRadius: 8, background: '#f6ffed', borderColor: '#b7eb8f' }}
          >
            <Descriptions size="small" column={2} layout="vertical">
              <Descriptions.Item label="Finished Goods Batch ID">
                <Tag color="green" style={{ fontSize: 12, fontWeight: 700 }}>
                  {complaint.fgBatchId}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Upstream RM Procurement Lot">
                <Tag color="cyan" style={{ fontSize: 12 }}>
                  {complaint.rmLotId}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Fulfilling Warehouse Node">
                <Text style={{ fontSize: 12 }}>{complaint.warehouseNode}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Farmer / Supplier Cluster Origin">
                <Text style={{ fontSize: 12 }}>{complaint.farmOrigin}</Text>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {/* Previous Resolution Note if available */}
          {complaint.resolutionNote && (
            <Alert
              type="success"
              showIcon
              message="Resolution Logged"
              description={complaint.resolutionNote}
            />
          )}

          {/* Resolution Action Button Suite */}
          <Divider orientation="left" plain>
            Operational Decision & Resolution Actions
          </Divider>

          <Row gutter={[12, 12]}>
            <Col span={12}>
              <Button
                type="primary"
                block
                style={{ background: '#52c41a', borderColor: '#52c41a', borderRadius: 8, height: 42, fontWeight: 700 }}
                icon={<DollarOutlined />}
                onClick={() => {
                  setActionModalType('REFUND');
                  setCreditAmount(complaint.orderAmount);
                }}
              >
                Approve Refund / Credit Note
              </Button>
            </Col>

            <Col span={12}>
              <Button
                type="primary"
                block
                style={{ background: '#1677ff', borderColor: '#1677ff', borderRadius: 8, height: 42, fontWeight: 700 }}
                icon={<RocketOutlined />}
                onClick={() => setActionModalType('REPLACEMENT')}
              >
                Dispatch Replacement Order
              </Button>
            </Col>

            <Col span={12}>
              <Button
                block
                style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff', borderRadius: 8, height: 42, fontWeight: 700 }}
                icon={<SyncOutlined />}
                onClick={() => setActionModalType('REVERSE_PICKUP')}
              >
                Assign Reverse Pickup
              </Button>
            </Col>

            <Col span={12}>
              <Button
                danger
                block
                style={{ borderRadius: 8, height: 42, fontWeight: 700 }}
                icon={<CloseCircleOutlined />}
                onClick={() => setActionModalType('REJECT')}
              >
                Reject Grievance with Note
              </Button>
            </Col>
          </Row>
        </Space>
      </Drawer>

      {/* Decision Action Modal */}
      <Modal
        title={
          actionModalType === 'REFUND'
            ? '💳 Issue Refund / Credit Note'
            : actionModalType === 'REPLACEMENT'
            ? '🚚 Dispatch Replacement Item Order'
            : actionModalType === 'REVERSE_PICKUP'
            ? '🔄 Assign Reverse Pickup Logistics'
            : '❌ Reject Complaint Ticket'
        }
        open={Boolean(actionModalType)}
        onOk={handleConfirmAction}
        onCancel={() => setActionModalType(null)}
        okText="Confirm Action"
        okButtonProps={{ danger: actionModalType === 'REJECT' }}
      >
        <Space direction="vertical" style={{ width: '100%', marginTop: 12 }} size={16}>
          <Alert
            type={actionModalType === 'REJECT' ? 'error' : 'info'}
            message={`Ticket ID: ${complaint.id} (${complaint.customerName})`}
            description={`Linked Order: ${complaint.orderId} · Amount: ₹${complaint.orderAmount}`}
          />

          {actionModalType === 'REFUND' && (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 4 }}>
                Refund / Credit Note Amount (₹):
              </Text>
              <InputNumber
                style={{ width: '100%' }}
                min={1}
                max={complaint.orderAmount}
                value={creditAmount}
                onChange={(val) => setCreditAmount(val || 0)}
                prefix="₹"
              />
            </div>
          )}

          <div>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>
              Internal Audit Resolution Note / Justification:
            </Text>
            <Input.TextArea
              rows={3}
              placeholder="Provide explicit reason for compliance logs (e.g. Damage verified from photo proof, Credit Note #CN-9041 issued)..."
              value={resolutionNoteInput}
              onChange={(e) => setResolutionNoteInput(e.target.value)}
            />
          </div>
        </Space>
      </Modal>
    </>
  );
}

/**
 * Complaints & Grievances Super Admin Console Page (`/complaints`)
 */
export function ComplaintsPage() {
  const [searchParams] = useSearchParams();
  const { message } = AntApp.useApp();
  const [complaints, setComplaints] = useState<ComplaintTicket[]>(MOCK_COMPLAINTS);
  const [activeChannelTab, setActiveChannelTab] = useState<'ALL' | 'B2C' | 'B2B'>('B2C');

  // Filters
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') ?? '');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');

  // Drawer state
  const [selectedTicket, setSelectedTicket] = useState<ComplaintTicket | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleOpenInspection = (ticket: ComplaintTicket) => {
    setSelectedTicket(ticket);
    setDrawerOpen(true);
  };

  const handleResolveAction = (ticketId: string, actionType: string, note: string) => {
    setComplaints((prev) =>
      prev.map((item) => {
        if (item.id === ticketId) {
          let newStatus = item.status;
          if (actionType === 'REFUND') newStatus = 'REFUND_APPROVED';
          if (actionType === 'REPLACEMENT') newStatus = 'REPLACEMENT_DISPATCHED';
          if (actionType === 'REVERSE_PICKUP') newStatus = 'ACTION_REQUIRED';
          if (actionType === 'REJECT') newStatus = 'REJECTED';
          return { ...item, status: newStatus, resolutionNote: note };
        }
        return item;
      })
    );
    message.success(`Ticket ${ticketId} status updated successfully`);
  };

  // Compute metrics
  const metrics = useMemo(() => {
    const totalOpen = complaints.filter((c) => c.status === 'NEW_OPEN' || c.status === 'UNDER_INSPECTION' || c.status === 'ACTION_REQUIRED').length;
    const criticalSLA = complaints.filter((c) => c.slaRemainingHours <= 4 && (c.status === 'NEW_OPEN' || c.status === 'UNDER_INSPECTION')).length;
    const b2bDisputes = complaints.filter((c) => c.channel === 'B2B' && c.status !== 'REFUND_APPROVED' && c.status !== 'REJECTED').length;
    const resolvedToday = complaints.filter((c) => c.status === 'REFUND_APPROVED' || c.status === 'REPLACEMENT_DISPATCHED').length;

    return { totalOpen, criticalSLA, b2bDisputes, resolvedToday };
  }, [complaints]);

  // Filtered rows
  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      // Channel tab
      if (activeChannelTab !== 'ALL' && c.channel !== activeChannelTab) return false;

      // Search query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesId = c.id.toLowerCase().includes(q);
        const matchesName = c.customerName.toLowerCase().includes(q);
        const matchesOrder = c.orderId.toLowerCase().includes(q);
        const matchesBatch = c.fgBatchId.toLowerCase().includes(q);
        if (!matchesId && !matchesName && !matchesOrder && !matchesBatch) return false;
      }

      // Status filter
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;

      // Priority filter
      if (priorityFilter !== 'ALL' && c.priority !== priorityFilter) return false;

      return true;
    });
  }, [complaints, activeChannelTab, searchQuery, statusFilter, priorityFilter]);

  const columns: ColumnsType<ComplaintTicket> = [
    {
      title: 'Ticket ID & Date',
      key: 'ticket',
      width: 170,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ fontSize: 13, color: '#1677ff' }}>
            {record.id}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {record.createdAt}
          </Text>
        </Space>
      ),
      sorter: (a, b) => a.id.localeCompare(b.id),
    },
    {
      title: 'Complainant Profile',
      key: 'complainant',
      width: 220,
      render: (_, record) => (
        <Space align="start" size={10}>
          <Avatar
            style={{
              backgroundColor: record.channel === 'B2B' ? '#722ed1' : '#1677ff',
              flexShrink: 0,
            }}
            icon={<UserOutlined />}
          />
          <Space direction="vertical" size={0}>
            <Text strong style={{ fontSize: 13 }}>
              {record.customerName}
            </Text>
            {record.companyName && (
              <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>
                🏢 {record.companyName}
              </Text>
            )}
            <Text type="secondary" style={{ fontSize: 11 }}>
              {record.customerPhone}
            </Text>
          </Space>
        </Space>
      ),
    },
    {
      title: 'Category & Sub-Type',
      key: 'category',
      width: 200,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Tag color={record.category === 'DAMAGED_PACKAGING' ? 'orange' : record.category === 'QUALITY_DEFECT' ? 'red' : record.category === 'SHORTAGE' ? 'purple' : 'blue'}>
            {record.categoryLabel}
          </Tag>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {record.subType}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Priority',
      key: 'priority',
      width: 110,
      render: (_, record) => (
        <Tag color={record.priority === 'CRITICAL' ? 'red' : record.priority === 'HIGH' ? 'volcano' : record.priority === 'MEDIUM' ? 'gold' : 'blue'}>
          {record.priority}
        </Tag>
      ),
    },
    {
      title: 'SLA Counter',
      key: 'sla',
      width: 140,
      render: (_, record) => {
        const isBreached = record.slaRemainingHours <= 0;
        return (
          <Space size={4}>
            <ClockCircleOutlined style={{ color: isBreached ? '#ff4d4f' : '#fa8c16' }} />
            <Text style={{ fontSize: 12, fontWeight: 600, color: isBreached ? '#ff4d4f' : '#fa8c16' }}>
              {isBreached ? `Overdue by ${Math.abs(record.slaRemainingHours)}h` : `${record.slaRemainingHours}h Left`}
            </Text>
          </Space>
        );
      },
      sorter: (a, b) => a.slaRemainingHours - b.slaRemainingHours,
    },
    {
      title: 'Linked Order',
      key: 'order',
      width: 130,
      render: (_, record) => (
        <Tag color="geekblue" style={{ fontSize: 11, cursor: 'pointer' }}>
          {record.orderId}
        </Tag>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 160,
      render: (_, record) => {
        const s = record.status;
        return (
          <Tag
            color={
              s === 'NEW_OPEN'
                ? 'blue'
                : s === 'UNDER_INSPECTION'
                ? 'gold'
                : s === 'ACTION_REQUIRED'
                ? 'volcano'
                : s === 'REFUND_APPROVED'
                ? 'green'
                : s === 'REPLACEMENT_DISPATCHED'
                ? 'cyan'
                : 'default'
            }
          >
            {s.replace(/_/g, ' ')}
          </Tag>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      fixed: 'right',
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => handleOpenInspection(record)}
          style={{ borderRadius: 6 }}
        >
          Inspect Vault
        </Button>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* Page Header */}
      <PageHeader
        title="Complaints & Grievances Console"
        subtitle="Super Admin Operations Desk: Inspect customer product complaints, B2B wholesale disputes, photo evidence vault, batch traceability, and process refunds/replacements."
      />

      {/* KPI Metrics Summary Cards */}
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Total Open Grievances"
              value={metrics.totalOpen}
              prefix={<ExclamationCircleOutlined style={{ color: '#1677ff', fontSize: 18 }} />}
              valueStyle={{ fontSize: 22, fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Critical SLA Warnings"
              value={metrics.criticalSLA}
              prefix={<WarningOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />}
              valueStyle={{ color: metrics.criticalSLA > 0 ? '#ff4d4f' : '#52c41a', fontSize: 22, fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="B2B Wholesale Disputes"
              value={metrics.b2bDisputes}
              prefix={<ShoppingOutlined style={{ color: '#722ed1', fontSize: 18 }} />}
              valueStyle={{ color: '#722ed1', fontSize: 22, fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Resolved Today"
              value={metrics.resolvedToday}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />}
              valueStyle={{ color: '#52c41a', fontSize: 22, fontWeight: 700 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Main Table Card */}
      <Card bodyStyle={{ padding: 16 }} style={{ borderRadius: 8 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {/* Segmented Channel Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <Radio.Group
              value={activeChannelTab}
              onChange={(e) => setActiveChannelTab(e.target.value)}
              buttonStyle="solid"
              size="middle"
            >
              <Radio.Button value="B2C">
                🛒 B2C Customer Complaints ({complaints.filter((c) => c.channel === 'B2C').length})
              </Radio.Button>
              <Radio.Button value="B2B">
                🏬 B2B Retailer & Franchise Disputes ({complaints.filter((c) => c.channel === 'B2B').length})
              </Radio.Button>
              <Radio.Button value="ALL">
                All Channels ({complaints.length})
              </Radio.Button>
            </Radio.Group>
          </div>

          {/* Multi-Attribute Filters */}
          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} md={9}>
              <Input
                placeholder="Search Ticket ID, Customer Name, Order ID (#B2C/PO), or Batch ID..."
                prefix={<SearchOutlined />}
                allowClear
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </Col>
            <Col xs={12} md={7}>
              <Select
                style={{ width: '100%' }}
                value={statusFilter}
                onChange={(val) => setStatusFilter(val)}
                options={[
                  { value: 'ALL', label: 'All Statuses' },
                  { value: 'NEW_OPEN', label: 'New Open' },
                  { value: 'UNDER_INSPECTION', label: 'Under Inspection' },
                  { value: 'ACTION_REQUIRED', label: 'Action Required' },
                  { value: 'REFUND_APPROVED', label: 'Refund Approved' },
                  { value: 'REPLACEMENT_DISPATCHED', label: 'Replacement Dispatched' },
                  { value: 'REJECTED', label: 'Rejected' },
                ]}
              />
            </Col>
            <Col xs={12} md={8}>
              <Select
                style={{ width: '100%' }}
                value={priorityFilter}
                onChange={(val) => setPriorityFilter(val)}
                options={[
                  { value: 'ALL', label: 'All Priorities' },
                  { value: 'CRITICAL', label: 'Critical Priority Only' },
                  { value: 'HIGH', label: 'High Priority Only' },
                  { value: 'MEDIUM', label: 'Medium Priority Only' },
                  { value: 'LOW', label: 'Low Priority Only' },
                ]}
              />
            </Col>
          </Row>

          {/* Table View */}
          <Table<ComplaintTicket>
            columns={columns}
            dataSource={filteredComplaints}
            rowKey="id"
            pagination={{ pageSize: 10, showSizeChanger: true }}
            size="middle"
            scroll={{ x: 1100 }}
          />
        </Space>
      </Card>

      {/* Slide-Out Inspection Drawer */}
      <ComplaintInspectionDrawer
        open={drawerOpen}
        complaint={selectedTicket}
        onClose={() => setDrawerOpen(false)}
        onResolveAction={handleResolveAction}
      />
    </Space>
  );
}
