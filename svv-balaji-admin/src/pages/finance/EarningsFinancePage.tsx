import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  BankOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CreditCardOutlined,
  DollarOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  FilterOutlined,
  LockOutlined,
  PieChartOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SendOutlined,
  ShopOutlined,
  ShoppingOutlined,
  TeamOutlined,
  UnlockOutlined,
  WalletOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Radio,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { Can } from '../../components/Can';
import { PageHeader } from '../../components/PageHeader';
import { formatCurrency } from '../../utils/format';
import { downloadOrderBill } from '../../utils/invoiceGenerator';

const { Text, Title, Paragraph } = Typography;
const { RangePicker } = DatePicker;

// --- Data Types ---

export interface ChannelRevenueBreakdown {
  key: string;
  channel: string;
  sharePercent: number;
  totalInvoiced: number;
  realizedPaid: number;
  pendingCredit: number;
  returnsRefunds: number;
  orderCount: number;
  avgOrderValue: number;
  badgeColor: string;
}

export interface DebtorRecord {
  id: string;
  businessName: string;
  tradeType: 'RETAILER' | 'FRANCHISE';
  contactPerson: string;
  phone: string;
  city: string;
  state: string;
  gstin: string;
  creditLimit: number;
  outstandingBalance: number;
  overdueDays: number;
  agingBucket: 'CURRENT' | 'DUE_SOON' | 'OVERDUE' | 'CRITICAL';
  accountStatus: 'ACTIVE' | 'FROZEN' | 'UNDER_REVIEW';
  lastPaymentDate: string;
  lastPaymentAmount: number;
}

export interface TransactionRecord {
  id: string;
  transactionId: string;
  utrNumber: string;
  date: string;
  payerName: string;
  payerType: 'B2C' | 'B2B_RETAILER' | 'B2B_FRANCHISE' | 'OUTLET_POS';
  linkedInvoiceId: string;
  paymentMode: 'UPI' | 'CARD' | 'NEFT' | 'CHEQUE' | 'COD' | 'CREDIT_ADJ' | 'CASH';
  amount: number;
  taxGst: number;
  status: 'SETTLED' | 'PENDING_CLEARANCE' | 'FAILED' | 'REFUNDED';
  state: string;
  notes?: string;
}

// --- Initial Mock Data for High-Precision MIS ---

const MOCK_CHANNEL_BREAKDOWNS: ChannelRevenueBreakdown[] = [
  {
    key: 'b2c',
    channel: 'B2C Consumer App (Desi Tokri)',
    sharePercent: 25,
    totalInvoiced: 650000,
    realizedPaid: 635000,
    pendingCredit: 0,
    returnsRefunds: 15000,
    orderCount: 1420,
    avgOrderValue: 457,
    badgeColor: 'blue',
  },
  {
    key: 'b2b_retail',
    channel: 'B2B Retailers (Wholesale)',
    sharePercent: 45,
    totalInvoiced: 1180000,
    realizedPaid: 720000,
    pendingCredit: 460000,
    returnsRefunds: 0,
    orderCount: 68,
    avgOrderValue: 17352,
    badgeColor: 'purple',
  },
  {
    key: 'b2b_franchise',
    channel: 'B2B Franchises (Bulk Supply)',
    sharePercent: 20,
    totalInvoiced: 520000,
    realizedPaid: 450000,
    pendingCredit: 70000,
    returnsRefunds: 0,
    orderCount: 22,
    avgOrderValue: 23636,
    badgeColor: 'geekblue',
  },
  {
    key: 'pos_outlet',
    channel: 'Physical Outlets POS (Counter Sales)',
    sharePercent: 10,
    totalInvoiced: 260000,
    realizedPaid: 260000,
    pendingCredit: 0,
    returnsRefunds: 0,
    orderCount: 480,
    avgOrderValue: 541,
    badgeColor: 'green',
  },
];

const MOCK_DEBTORS: DebtorRecord[] = [
  {
    id: 'deb-1',
    businessName: 'Gupta Kirana Superstore',
    tradeType: 'RETAILER',
    contactPerson: 'Manoj Gupta',
    phone: '9835012450',
    city: 'Patna',
    state: 'Bihar',
    gstin: '10AABCG1234F1Z1',
    creditLimit: 250000,
    outstandingBalance: 185000,
    overdueDays: 42,
    agingBucket: 'OVERDUE',
    accountStatus: 'FROZEN',
    lastPaymentDate: '2026-08-04',
    lastPaymentAmount: 45000,
  },
  {
    id: 'deb-2',
    businessName: 'Balaji Express Franchise Outlet #02',
    tradeType: 'FRANCHISE',
    contactPerson: 'Sanjay Verma',
    phone: '9431098220',
    city: 'Ranchi',
    state: 'Jharkhand',
    gstin: '20AACPV9921E1Z4',
    creditLimit: 150000,
    outstandingBalance: 70000,
    overdueDays: 14,
    agingBucket: 'CURRENT',
    accountStatus: 'ACTIVE',
    lastPaymentDate: '2026-09-02',
    lastPaymentAmount: 30000,
  },
  {
    id: 'deb-3',
    businessName: 'Maa Annapurna Wholesale Traders',
    tradeType: 'RETAILER',
    contactPerson: 'Kishan Agarwal',
    phone: '9122334455',
    city: 'Muzaffarpur',
    state: 'Bihar',
    gstin: '10AAACA9940K1Z9',
    creditLimit: 300000,
    outstandingBalance: 145000,
    overdueDays: 24,
    agingBucket: 'DUE_SOON',
    accountStatus: 'ACTIVE',
    lastPaymentDate: '2026-08-25',
    lastPaymentAmount: 55000,
  },
  {
    id: 'deb-4',
    businessName: 'Shree Krishna Provisions & Grains',
    tradeType: 'RETAILER',
    contactPerson: 'Vinod Tiwari',
    phone: '9771122334',
    city: 'Gaya',
    state: 'Bihar',
    gstin: '10AACST5512B1Z6',
    creditLimit: 200000,
    outstandingBalance: 95000,
    overdueDays: 68,
    agingBucket: 'CRITICAL',
    accountStatus: 'FROZEN',
    lastPaymentDate: '2026-07-10',
    lastPaymentAmount: 20000,
  },
  {
    id: 'deb-5',
    businessName: 'Vighnaharta Mart Franchise',
    tradeType: 'FRANCHISE',
    contactPerson: 'Alok Pandey',
    phone: '9835990011',
    city: 'Indore',
    state: 'Madhya Pradesh',
    gstin: '23AACPV8812C1Z8',
    creditLimit: 150000,
    outstandingBalance: 35000,
    overdueDays: 8,
    agingBucket: 'CURRENT',
    accountStatus: 'ACTIVE',
    lastPaymentDate: '2026-09-10',
    lastPaymentAmount: 65000,
  },
];

const MOCK_TRANSACTIONS: TransactionRecord[] = [
  {
    id: 'tx-101',
    transactionId: 'TXN-20260918-0912',
    utrNumber: 'UTR-HDFC-991208',
    date: '18 Sept 2026, 14:15 PM',
    payerName: 'Gupta Kirana Superstore',
    payerType: 'B2B_RETAILER',
    linkedInvoiceId: 'INV-B2B-94021',
    paymentMode: 'NEFT',
    amount: 75000,
    taxGst: 3750,
    status: 'SETTLED',
    state: 'Bihar',
    notes: 'Partial settlement against 30-day invoice',
  },
  {
    id: 'tx-102',
    transactionId: 'TXN-20260918-1234',
    utrNumber: 'UPI-RAZOR-441920',
    date: '18 Sept 2026, 13:40 PM',
    payerName: 'Sunil Kumar (Desi Tokri App)',
    payerType: 'B2C',
    linkedInvoiceId: 'INV-DT-ORD-94025',
    paymentMode: 'UPI',
    amount: 1850,
    taxGst: 92,
    status: 'SETTLED',
    state: 'Bihar',
    notes: 'Online prepaid checkout capture',
  },
  {
    id: 'tx-103',
    transactionId: 'TXN-20260918-1120',
    utrNumber: 'POS-CASH-7712',
    date: '18 Sept 2026, 12:10 PM',
    payerName: 'Ramesh Sharma (Store Walk-in)',
    payerType: 'OUTLET_POS',
    linkedInvoiceId: 'POS-20260918-101',
    paymentMode: 'CASH',
    amount: 2139,
    taxGst: 104,
    status: 'SETTLED',
    state: 'Bihar',
    notes: 'Patna City Outlet Shift #A',
  },
  {
    id: 'tx-104',
    transactionId: 'TXN-20260917-8812',
    utrNumber: 'UTR-ICICI-551209',
    date: '17 Sept 2026, 16:50 PM',
    payerName: 'Maa Annapurna Wholesale Traders',
    payerType: 'B2B_RETAILER',
    linkedInvoiceId: 'INV-B2B-94018',
    paymentMode: 'NEFT',
    amount: 120000,
    taxGst: 6000,
    status: 'PENDING_CLEARANCE',
    state: 'Bihar',
    notes: 'Bank clearance awaited in escrow',
  },
  {
    id: 'tx-105',
    transactionId: 'TXN-20260917-6612',
    utrNumber: 'UPI-GPAY-990112',
    date: '17 Sept 2026, 15:10 PM',
    payerName: 'Anita Gupta (Desi Tokri App)',
    payerType: 'B2C',
    linkedInvoiceId: 'INV-DT-ORD-94019',
    paymentMode: 'UPI',
    amount: 950,
    taxGst: 47,
    status: 'SETTLED',
    state: 'Bihar',
  },
  {
    id: 'tx-106',
    transactionId: 'TXN-20260916-4412',
    utrNumber: 'REF-RAZOR-110293',
    date: '16 Sept 2026, 18:20 PM',
    payerName: 'Rahul Verma',
    payerType: 'B2C',
    linkedInvoiceId: 'INV-DT-ORD-94010',
    paymentMode: 'CARD',
    amount: 1250,
    taxGst: 62,
    status: 'REFUNDED',
    state: 'Jharkhand',
    notes: 'Returned before dispatch by customer',
  },
  {
    id: 'tx-107',
    transactionId: 'TXN-20260916-2210',
    utrNumber: 'UTR-SBIN-771920',
    date: '16 Sept 2026, 11:30 AM',
    payerName: 'Balaji Express Franchise Outlet #02',
    payerType: 'B2B_FRANCHISE',
    linkedInvoiceId: 'INV-B2B-94012',
    paymentMode: 'NEFT',
    amount: 85000,
    taxGst: 4250,
    status: 'SETTLED',
    state: 'Jharkhand',
    notes: 'Weekly bulk replenishment settlement',
  },
];

export function EarningsFinancePage() {
  const { message, modal } = AntApp.useApp();

  // State Filters
  const [selectedState, setSelectedState] = useState<string>('ALL');
  const [selectedChannel, setSelectedChannel] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ]);

  // Dynamic state for debtors and settlement recording
  const [debtors, setDebtors] = useState<DebtorRecord[]>(MOCK_DEBTORS);
  const [transactions, setTransactions] = useState<TransactionRecord[]>(MOCK_TRANSACTIONS);

  // Settlement Recording Modal
  const [settlementModalOpen, setSettlementModalOpen] = useState(false);
  const [settlementTarget, setSettlementTarget] = useState<DebtorRecord | null>(null);
  const [settlementForm] = Form.useForm<{ amount: number; paymentMode: string; utrNumber: string; notes: string }>();

  // Payment Gateway Escrow State
  const [gatewayEscrow, setGatewayEscrow] = useState({
    escrowBalance: 142850,
    nextPayoutDate: 'Tomorrow, 07:00 AM (T+1)',
    estimatedPayoutAmount: 140278,
    gatewayFeeRate: '1.8% + GST',
    pendingOrdersCount: 84,
  });

  // Calculate High-level Aggregates
  const financialTotals = useMemo(() => {
    const grossInvoiced = MOCK_CHANNEL_BREAKDOWNS.reduce((sum, c) => sum + c.totalInvoiced, 0);
    const realizedRevenue = MOCK_CHANNEL_BREAKDOWNS.reduce((sum, c) => sum + c.realizedPaid, 0);
    const totalPendingCredit = MOCK_CHANNEL_BREAKDOWNS.reduce((sum, c) => sum + c.pendingCredit, 0);
    const totalRefunds = MOCK_CHANNEL_BREAKDOWNS.reduce((sum, c) => sum + c.returnsRefunds, 0);

    const totalOverdueCredit = debtors
      .filter((d) => d.agingBucket === 'OVERDUE' || d.agingBucket === 'CRITICAL')
      .reduce((sum, d) => sum + d.outstandingBalance, 0);

    // GST Breakdown (5% on groceries: CGST 2.5% + SGST 2.5% or IGST 5%)
    const totalGst = Math.round(grossInvoiced * 0.05);
    const cgst = Math.round(totalGst * 0.45);
    const sgst = Math.round(totalGst * 0.45);
    const igst = totalGst - (cgst + sgst);

    return {
      grossInvoiced,
      realizedRevenue,
      totalPendingCredit,
      totalRefunds,
      totalOverdueCredit,
      totalGst,
      cgst,
      sgst,
      igst,
    };
  }, [debtors]);

  // Aging Buckets Totals
  const agingStats = useMemo(() => {
    const current = debtors.filter((d) => d.agingBucket === 'CURRENT').reduce((s, d) => s + d.outstandingBalance, 0);
    const dueSoon = debtors.filter((d) => d.agingBucket === 'DUE_SOON').reduce((s, d) => s + d.outstandingBalance, 0);
    const overdue = debtors.filter((d) => d.agingBucket === 'OVERDUE').reduce((s, d) => s + d.outstandingBalance, 0);
    const critical = debtors.filter((d) => d.agingBucket === 'CRITICAL').reduce((s, d) => s + d.outstandingBalance, 0);
    return { current, dueSoon, overdue, critical };
  }, [debtors]);

  // Filtered Transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const matchState = selectedState === 'ALL' || t.state === selectedState;
      const matchChannel = selectedChannel === 'ALL' || t.payerType === selectedChannel;
      const matchStatus = selectedStatus === 'ALL' || t.status === selectedStatus;
      const matchQuery =
        !searchKeyword.trim() ||
        t.transactionId.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        t.utrNumber.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        t.payerName.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        t.linkedInvoiceId.toLowerCase().includes(searchKeyword.toLowerCase());
      return matchState && matchChannel && matchStatus && matchQuery;
    });
  }, [transactions, selectedState, selectedChannel, selectedStatus, searchKeyword]);

  // Debtor Action Handlers
  const handleToggleAccountFreeze = (debtor: DebtorRecord) => {
    const nextStatus = debtor.accountStatus === 'FROZEN' ? 'ACTIVE' : 'FROZEN';
    setDebtors((prev) =>
      prev.map((d) => (d.id === debtor.id ? { ...d, accountStatus: nextStatus } : d)),
    );
    message.success(
      `${debtor.businessName} account has been ${nextStatus === 'FROZEN' ? 'FROZEN (New orders blocked)' : 'ACTIVATED'}.`,
    );
  };

  const handleSendReminder = (debtor: DebtorRecord) => {
    const cleanPhone = debtor.phone.replace(/[^0-9]/g, '');
    const msg = `Dear ${debtor.contactPerson}, Greetings from SVV Balaji Agro Producer Co. This is a gentle reminder that an outstanding payment of ${formatCurrency(debtor.outstandingBalance)} is pending for ${debtor.businessName}. Please settle at earliest to ensure uninterrupted dispatches.`;
    window.open(`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    message.success(`Payment reminder dispatch initiated for ${debtor.businessName}`);
  };

  const handleOpenSettlement = (debtor: DebtorRecord) => {
    setSettlementTarget(debtor);
    settlementForm.setFieldsValue({
      amount: debtor.outstandingBalance,
      paymentMode: 'NEFT',
      utrNumber: `UTR-MAN-${Math.floor(100000 + Math.random() * 900000)}`,
      notes: `Settlement received against overdue ledger balance`,
    });
    setSettlementModalOpen(true);
  };

  const handleSaveSettlement = async () => {
    if (!settlementTarget) return;
    const values = await settlementForm.validateFields();

    // Deduct from debtor
    setDebtors((prev) =>
      prev.map((d) => {
        if (d.id === settlementTarget.id) {
          const newBal = Math.max(0, d.outstandingBalance - values.amount);
          return {
            ...d,
            outstandingBalance: newBal,
            lastPaymentDate: dayjs().format('YYYY-MM-DD'),
            lastPaymentAmount: values.amount,
            agingBucket: newBal === 0 ? 'CURRENT' : d.agingBucket,
            accountStatus: newBal === 0 ? 'ACTIVE' : d.accountStatus,
          };
        }
        return d;
      }),
    );

    // Add to transaction log
    const newTx: TransactionRecord = {
      id: `tx-${Date.now()}`,
      transactionId: `TXN-${dayjs().format('YYYYMMDD')}-${Math.floor(1000 + Math.random() * 9000)}`,
      utrNumber: values.utrNumber,
      date: dayjs().format('DD MMM YYYY, HH:mm A'),
      payerName: settlementTarget.businessName,
      payerType: settlementTarget.tradeType === 'RETAILER' ? 'B2B_RETAILER' : 'B2B_FRANCHISE',
      linkedInvoiceId: `INV-LEDGER-${settlementTarget.id}`,
      paymentMode: values.paymentMode as any,
      amount: values.amount,
      taxGst: Math.round(values.amount * 0.05),
      status: 'SETTLED',
      state: settlementTarget.state,
      notes: values.notes,
    };
    setTransactions((prev) => [newTx, ...prev]);

    message.success(`Payment of ${formatCurrency(values.amount)} successfully credited to ledger!`);
    setSettlementModalOpen(false);
  };

  const handleInstantPayout = () => {
    modal.confirm({
      title: 'Request Instant Bank Escrow Payout',
      content: `Transfer ${formatCurrency(gatewayEscrow.escrowBalance)} from payment gateway escrow directly to SVV Balaji HDFC Current Account (A/c: 502000881920)? Estimated net transfer: ${formatCurrency(gatewayEscrow.estimatedPayoutAmount)}.`,
      okText: 'Confirm Instant Payout',
      onOk: () => {
        setGatewayEscrow((prev) => ({
          ...prev,
          escrowBalance: 0,
          estimatedPayoutAmount: 0,
          pendingOrdersCount: 0,
        }));
        message.success('Instant bank payout initiated! Funds will reflect in registered account in 15 minutes.');
      },
    });
  };

  // Export Reports Handlers
  const handleExportGstr1 = () => {
    const reportData = {
      gstin: '10AAACS9981P1Z5',
      fp: dayjs().format('MMYYYY'),
      grossTurnover: financialTotals.grossInvoiced,
      taxLiability: {
        cgst: financialTotals.cgst,
        sgst: financialTotals.sgst,
        igst: financialTotals.igst,
        totalGst: financialTotals.totalGst,
      },
      b2bInvoicesCount: MOCK_CHANNEL_BREAKDOWNS[1].orderCount + MOCK_CHANNEL_BREAKDOWNS[2].orderCount,
      b2cInvoicesCount: MOCK_CHANNEL_BREAKDOWNS[0].orderCount + MOCK_CHANNEL_BREAKDOWNS[3].orderCount,
      generatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GSTR1-SVV-Balaji-${dayjs().format('YYYY-MM')}.json`;
    a.click();
    message.success('GSTR-1 JSON Compliance file downloaded!');
  };

  const handleExportCsvLedger = () => {
    const headers = ['Transaction ID', 'UTR Number', 'Date', 'Payer Name', 'Channel', 'Invoice ID', 'Payment Mode', 'Amount', 'GST (5%)', 'Status', 'State'];
    const rows = filteredTransactions.map((t) => [
      t.transactionId,
      t.utrNumber,
      `"${t.date}"`,
      `"${t.payerName}"`,
      t.payerType,
      t.linkedInvoiceId,
      t.paymentMode,
      t.amount,
      t.taxGst,
      t.status,
      t.state,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SVV-Balaji-Financial-Ledger-${dayjs().format('YYYY-MM-DD')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success('Sales Ledger CSV downloaded for Tally/ERP import!');
  };

  const handleDownloadPnL = () => {
    const printWindow = window.open('', '_blank', 'width=850,height=900');
    if (!printWindow) {
      alert('Please allow pop-ups to print the P&L statement.');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Monthly Financial P&L Statement — SVV Balaji</title>
          <style>
            body { font-family: sans-serif; padding: 30px; color: #1e293b; }
            .header { border-bottom: 2px solid #065f46; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; }
            .title { font-size: 20px; font-weight: 800; color: #065f46; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px; text-align: left; }
            th { background: #f8fafc; }
            .right { text-align: right; }
            .bold { font-weight: 700; }
            .green { color: #059669; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">SVV BALAJI AGRO PRODUCER CO.</div>
              <div style="font-size: 11px; color: #64748b;">Monthly Financial P&L &amp; Channel Revenue MIS Report</div>
              <div style="font-size: 11px; color: #64748b;">Period: ${dayjs().subtract(30, 'day').format('DD MMM YYYY')} to ${dayjs().format('DD MMM YYYY')}</div>
            </div>
            <div class="right">
              <div style="font-size: 13px; font-weight: 700;">CONFIDENTIAL MIS</div>
              <div style="font-size: 11px;">GSTIN: 10AAACS9981P1Z5</div>
            </div>
          </div>

          <h3>1. Revenue by Channel Breakdown</h3>
          <table>
            <thead>
              <tr>
                <th>Stream</th>
                <th class="right">Share</th>
                <th class="right">Total Invoiced</th>
                <th class="right">Realized Cash</th>
                <th class="right">Pending Credit</th>
              </tr>
            </thead>
            <tbody>
              ${MOCK_CHANNEL_BREAKDOWNS.map((c) => `
                <tr>
                  <td><strong>${c.channel}</strong></td>
                  <td class="right">${c.sharePercent}%</td>
                  <td class="right">₹${c.totalInvoiced.toLocaleString('en-IN')}</td>
                  <td class="right green bold">₹${c.realizedPaid.toLocaleString('en-IN')}</td>
                  <td class="right">₹${c.pendingCredit.toLocaleString('en-IN')}</td>
                </tr>
              `).join('')}
              <tr style="background: #f1f5f9; font-weight: 800;">
                <td>TOTAL CONSOLIDATED</td>
                <td class="right">100%</td>
                <td class="right">₹${financialTotals.grossInvoiced.toLocaleString('en-IN')}</td>
                <td class="right green">₹${financialTotals.realizedRevenue.toLocaleString('en-IN')}</td>
                <td class="right">₹${financialTotals.totalPendingCredit.toLocaleString('en-IN')}</td>
              </tr>
            </tbody>
          </table>

          <h3 style="margin-top: 24px;">2. Tax &amp; Statutory Liability Breakdown</h3>
          <table>
            <tr><td>Gross Goods &amp; Services Tax (GST 5%)</td><td class="right bold">₹${financialTotals.totalGst.toLocaleString('en-IN')}</td></tr>
            <tr><td>Central GST (CGST 2.5%)</td><td class="right">₹${financialTotals.cgst.toLocaleString('en-IN')}</td></tr>
            <tr><td>State GST (SGST 2.5%)</td><td class="right">₹${financialTotals.sgst.toLocaleString('en-IN')}</td></tr>
            <tr><td>Integrated GST (IGST interstate)</td><td class="right">₹${financialTotals.igst.toLocaleString('en-IN')}</td></tr>
          </table>

          <div style="margin-top: 30px; border-top: 1px solid #cbd5e1; padding-top: 10px; font-size: 11px; text-align: center; color: #64748b;">
            System Generated Financial Statement · SVV Balaji MIS Cloud Platform
          </div>
          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Transaction Table Columns
  const transactionColumns: ColumnsType<TransactionRecord> = [
    {
      title: 'Transaction / UTR',
      key: 'tx',
      width: 190,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ fontSize: 13, color: '#1e293b' }}>
            {record.transactionId}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            UTR: <span style={{ fontFamily: 'monospace' }}>{record.utrNumber}</span>
          </Text>
        </Space>
      ),
    },
    {
      title: 'Date & Time',
      dataIndex: 'date',
      key: 'date',
      width: 160,
      render: (date: string) => <Text style={{ fontSize: 12 }}>{date}</Text>,
    },
    {
      title: 'Payer / Entity Name',
      key: 'payer',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ fontSize: 13 }}>{record.payerName}</Text>
          <Space size={4}>
            <Tag color={record.payerType === 'B2C' ? 'blue' : record.payerType === 'B2B_RETAILER' ? 'purple' : record.payerType === 'B2B_FRANCHISE' ? 'cyan' : 'green'} style={{ fontSize: 10 }}>
              {record.payerType.replace('_', ' ')}
            </Tag>
            <Text type="secondary" style={{ fontSize: 11 }}>State: {record.state}</Text>
          </Space>
        </Space>
      ),
    },
    {
      title: 'Linked Invoice',
      dataIndex: 'linkedInvoiceId',
      key: 'linkedInvoiceId',
      width: 140,
      render: (inv: string) => (
        <Tag color="geekblue" style={{ fontSize: 11 }}>{inv}</Tag>
      ),
    },
    {
      title: 'Payment Mode',
      dataIndex: 'paymentMode',
      key: 'paymentMode',
      width: 120,
      render: (mode: string) => {
        let color = 'default';
        if (mode === 'UPI') color = 'cyan';
        else if (mode === 'NEFT') color = 'blue';
        else if (mode === 'CARD') color = 'purple';
        else if (mode === 'CASH') color = 'green';
        else if (mode === 'COD') color = 'orange';
        return <Tag color={color} style={{ fontWeight: 600, fontSize: 11 }}>{mode}</Tag>;
      },
    },
    {
      title: 'Gross Credit',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      width: 130,
      render: (amt: number, record) => (
        <Space direction="vertical" size={0} style={{ textAlign: 'right' }}>
          <Text strong style={{ fontSize: 14, color: record.status === 'REFUNDED' ? '#ef4444' : '#059669' }}>
            {record.status === 'REFUNDED' ? '-' : '+'}{formatCurrency(amt)}
          </Text>
          <Text type="secondary" style={{ fontSize: 10 }}>
            GST: {formatCurrency(record.taxGst)}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => {
        if (status === 'SETTLED') return <Tag color="success" icon={<CheckCircleOutlined />}>SETTLED</Tag>;
        if (status === 'PENDING_CLEARANCE') return <Tag color="warning" icon={<ClockCircleOutlined />}>ESCROW</Tag>;
        if (status === 'REFUNDED') return <Tag color="error">REFUNDED</Tag>;
        return <Tag color="default">{status}</Tag>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 110,
      fixed: 'right',
      render: (_, record) => (
        <Tooltip title="Download GST Tax Invoice">
          <Button
            size="small"
            icon={<DownloadOutlined />}
            style={{ color: '#059669', borderColor: '#a7f3d0' }}
            onClick={() =>
              downloadOrderBill({
                orderNumber: record.linkedInvoiceId,
                orderDate: record.date,
                customerName: record.payerName,
                channel: record.payerType === 'B2C' ? 'B2C' : 'B2B',
                total: record.amount,
                taxTotal: record.taxGst,
                subtotal: record.amount - record.taxGst,
                paymentStatus: record.status === 'SETTLED' ? 'PAID' : record.status,
                paymentMethod: record.paymentMode,
              })
            }
          >
            Bill
          </Button>
        </Tooltip>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* Page Header */}
      <PageHeader
        title="Super Admin Earnings & Financial MIS"
        subtitle="Centralized Revenue MIS: Multi-stream revenue realized, B2B credit ledger, payment gateway settlements, and statutory GST compliance."
        actions={
          <Space>
            <Button icon={<FileExcelOutlined />} onClick={handleExportGstr1}>
              Export GSTR-1
            </Button>
            <Button icon={<FileTextOutlined />} onClick={handleExportCsvLedger}>
              Export Tally CSV
            </Button>
            <Button type="primary" icon={<FilePdfOutlined />} onClick={handleDownloadPnL} style={{ background: '#059669', borderColor: '#059669' }}>
              Download P&amp;L Statement
            </Button>
          </Space>
        }
      />

      {/* 1. Top Financial KPI Cards */}
      <Row gutter={[14, 14]}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 10, borderTop: '4px solid #1677ff' }}>
            <Statistic
              title={
                <Space>
                  <DollarOutlined style={{ color: '#1677ff' }} />
                  <span style={{ fontWeight: 600 }}>Gross Invoiced (GMV)</span>
                </Space>
              }
              value={financialTotals.grossInvoiced}
              precision={0}
              prefix="₹"
              valueStyle={{ fontSize: 24, fontWeight: 800, color: '#1e293b' }}
            />
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: '#059669', fontWeight: 600 }}>
                <ArrowUpOutlined /> +18.4% vs last month
              </span>
              <Text type="secondary">All 4 Channels</Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 10, borderTop: '4px solid #52c41a' }}>
            <Statistic
              title={
                <Space>
                  <BankOutlined style={{ color: '#52c41a' }} />
                  <span style={{ fontWeight: 600 }}>Net Realized Revenue (Bank)</span>
                </Space>
              }
              value={financialTotals.realizedRevenue}
              precision={0}
              prefix="₹"
              valueStyle={{ fontSize: 24, fontWeight: 800, color: '#52c41a' }}
            />
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: '#64748b' }}>Cleared cash in bank</span>
              <span style={{ color: '#ef4444' }}>Refunds: {formatCurrency(financialTotals.totalRefunds)}</span>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 10, borderTop: '4px solid #faad14' }}>
            <Statistic
              title={
                <Space>
                  <WalletOutlined style={{ color: '#faad14' }} />
                  <span style={{ fontWeight: 600 }}>B2B Outstanding Credit</span>
                </Space>
              }
              value={financialTotals.totalPendingCredit}
              precision={0}
              prefix="₹"
              valueStyle={{ fontSize: 24, fontWeight: 800, color: '#d97706' }}
            />
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <Tag color="error" style={{ margin: 0, fontWeight: 700 }}>
                Overdue: {formatCurrency(financialTotals.totalOverdueCredit)}
              </Tag>
              <Text type="secondary">Retailers &amp; Franchises</Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 10, borderTop: '4px solid #722ed1' }}>
            <Statistic
              title={
                <Space>
                  <SafetyCertificateOutlined style={{ color: '#722ed1' }} />
                  <span style={{ fontWeight: 600 }}>Total GST Collected (5%)</span>
                </Space>
              }
              value={financialTotals.totalGst}
              precision={0}
              prefix="₹"
              valueStyle={{ fontSize: 24, fontWeight: 800, color: '#722ed1' }}
            />
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
              <span>CGST: {formatCurrency(financialTotals.cgst)}</span>
              <span>SGST: {formatCurrency(financialTotals.sgst)}</span>
              <span>IGST: {formatCurrency(financialTotals.igst)}</span>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 2. Revenue Breakdown by Channel */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <Space>
              <PieChartOutlined style={{ color: '#1677ff', fontSize: 16 }} />
              <span>Multi-Stream Channel Revenue Comparison</span>
            </Space>
            <Tag color="blue" style={{ fontWeight: 600 }}>
              Live Consolidation
            </Tag>
          </div>
        }
        style={{ borderRadius: 10 }}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={16}>
            <Table
              dataSource={MOCK_CHANNEL_BREAKDOWNS}
              pagination={false}
              size="small"
              columns={[
                {
                  title: 'Channel Stream',
                  key: 'channel',
                  render: (_, r) => (
                    <Space direction="vertical" size={0}>
                      <Text strong style={{ fontSize: 13 }}>{r.channel}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>{r.orderCount} Orders · Avg: {formatCurrency(r.avgOrderValue)}</Text>
                    </Space>
                  ),
                },
                {
                  title: 'Share (%)',
                  dataIndex: 'sharePercent',
                  key: 'share',
                  width: 100,
                  render: (v: number, r) => (
                    <Space>
                      <Tag color={r.badgeColor} style={{ fontWeight: 700 }}>{v}%</Tag>
                    </Space>
                  ),
                },
                {
                  title: 'Total Invoiced',
                  dataIndex: 'totalInvoiced',
                  key: 'invoiced',
                  align: 'right',
                  render: (v: number) => <Text strong>{formatCurrency(v)}</Text>,
                },
                {
                  title: 'Realized (Paid)',
                  dataIndex: 'realizedPaid',
                  key: 'realized',
                  align: 'right',
                  render: (v: number) => <Text strong style={{ color: '#52c41a' }}>{formatCurrency(v)}</Text>,
                },
                {
                  title: 'Pending / Credit',
                  dataIndex: 'pendingCredit',
                  key: 'pending',
                  align: 'right',
                  render: (v: number) => (
                    <Text style={{ color: v > 0 ? '#fa8c16' : '#8c8c8c', fontWeight: v > 0 ? 600 : 400 }}>
                      {v > 0 ? formatCurrency(v) : '₹0'}
                    </Text>
                  ),
                },
                {
                  title: 'Returns / Refunds',
                  dataIndex: 'returnsRefunds',
                  key: 'refunds',
                  align: 'right',
                  render: (v: number) => (
                    <Text style={{ color: v > 0 ? '#f5222d' : '#8c8c8c' }}>
                      {v > 0 ? `-${formatCurrency(v)}` : '₹0'}
                    </Text>
                  ),
                },
              ]}
            />
          </Col>

          <Col xs={24} lg={8}>
            <Card type="inner" title="Channel Distribution Weight" size="small" style={{ height: '100%', borderRadius: 8 }}>
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span>B2B Retailers (Wholesale)</span>
                    <strong>45% (₹11.8L)</strong>
                  </div>
                  <Progress percent={45} strokeColor="#722ed1" showInfo={false} />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span>B2C Consumer App (Desi Tokri)</span>
                    <strong>25% (₹6.5L)</strong>
                  </div>
                  <Progress percent={25} strokeColor="#1677ff" showInfo={false} />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span>B2B Franchises (Bulk Supply)</span>
                    <strong>20% (₹5.2L)</strong>
                  </div>
                  <Progress percent={20} strokeColor="#13c2c2" showInfo={false} />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span>Physical Outlets POS (Counters)</span>
                    <strong>10% (₹2.6L)</strong>
                  </div>
                  <Progress percent={10} strokeColor="#52c41a" showInfo={false} />
                </div>
              </Space>
            </Card>
          </Col>
        </Row>
      </Card>

      {/* 3. B2B Receivables & Credit Ledger (Aging Analysis) */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Space>
              <TeamOutlined style={{ color: '#fa8c16' }} />
              <span>B2B Receivables &amp; Credit Ledger (Aging Analysis)</span>
            </Space>
            <Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Overdue Total:
              </Text>
              <Tag color="error" style={{ fontWeight: 800, fontSize: 13 }}>
                {formatCurrency(agingStats.overdue + agingStats.critical)}
              </Tag>
            </Space>
          </div>
        }
        style={{ borderRadius: 10 }}
      >
        {/* Aging Buckets Summary */}
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', padding: '10px 14px', borderRadius: 8 }}>
              <Text type="secondary" style={{ fontSize: 11, fontWeight: 700, color: '#389e0d' }}>
                CURRENT (0–15 DAYS)
              </Text>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#237804', marginTop: 2 }}>
                {formatCurrency(agingStats.current)}
              </div>
              <Text style={{ fontSize: 10, color: '#52c41a' }}>Normal credit window</Text>
            </div>
          </Col>

          <Col xs={12} sm={6}>
            <div style={{ background: '#e6f7ff', border: '1px solid #91d5ff', padding: '10px 14px', borderRadius: 8 }}>
              <Text type="secondary" style={{ fontSize: 11, fontWeight: 700, color: '#096dd9' }}>
                DUE SOON (16–30 DAYS)
              </Text>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0050b3', marginTop: 2 }}>
                {formatCurrency(agingStats.dueSoon)}
              </div>
              <Text style={{ fontSize: 10, color: '#1890ff' }}>Payment due this week</Text>
            </div>
          </Col>

          <Col xs={12} sm={6}>
            <div style={{ background: '#fff7e6', border: '1px solid #ffd591', padding: '10px 14px', borderRadius: 8 }}>
              <Text type="secondary" style={{ fontSize: 11, fontWeight: 700, color: '#d46b08' }}>
                OVERDUE (31–60 DAYS)
              </Text>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#ad4e00', marginTop: 2 }}>
                {formatCurrency(agingStats.overdue)}
              </div>
              <Text style={{ fontSize: 10, color: '#fa8c16' }}>Auto-lock warning issued</Text>
            </div>
          </Col>

          <Col xs={12} sm={6}>
            <div style={{ background: '#fff1f0', border: '1px solid #ffa39e', padding: '10px 14px', borderRadius: 8 }}>
              <Text type="secondary" style={{ fontSize: 11, fontWeight: 700, color: '#cf1322' }}>
                CRITICAL RISK (60+ DAYS)
              </Text>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#a8071a', marginTop: 2 }}>
                {formatCurrency(agingStats.critical)}
              </div>
              <Text style={{ fontSize: 10, color: '#f5222d' }}>Orders frozen / Legal alert</Text>
            </div>
          </Col>
        </Row>

        <Table
          dataSource={debtors}
          rowKey="id"
          pagination={false}
          size="small"
          columns={[
            {
              title: 'Retailer / Franchise Business',
              key: 'business',
              render: (_, record) => (
                <Space direction="vertical" size={2}>
                  <Text strong style={{ fontSize: 13 }}>{record.businessName}</Text>
                  <Space size={6}>
                    <Tag color={record.tradeType === 'RETAILER' ? 'purple' : 'geekblue'} style={{ fontSize: 10 }}>
                      {record.tradeType}
                    </Tag>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      👤 {record.contactPerson} · 📱 +91 {record.phone}
                    </Text>
                  </Space>
                  <Text type="secondary" style={{ fontSize: 10 }}>GSTIN: {record.gstin} · {record.city}, {record.state}</Text>
                </Space>
              ),
            },
            {
              title: 'Credit Limit',
              dataIndex: 'creditLimit',
              key: 'creditLimit',
              width: 120,
              render: (v: number) => <Text style={{ fontSize: 12 }}>{formatCurrency(v)}</Text>,
            },
            {
              title: 'Outstanding Balance',
              key: 'outstanding',
              width: 160,
              render: (_, record) => (
                <Space direction="vertical" size={0}>
                  <Text strong style={{ fontSize: 14, color: record.overdueDays > 30 ? '#cf1322' : '#d46b08' }}>
                    {formatCurrency(record.outstandingBalance)}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 10 }}>
                    Overdue: <strong style={{ color: record.overdueDays > 30 ? '#cf1322' : '#fa8c16' }}>{record.overdueDays} Days</strong>
                  </Text>
                </Space>
              ),
            },
            {
              title: 'Aging Status',
              dataIndex: 'agingBucket',
              key: 'aging',
              width: 130,
              render: (bucket: string) => {
                if (bucket === 'CURRENT') return <Tag color="success">0-15D Normal</Tag>;
                if (bucket === 'DUE_SOON') return <Tag color="processing">16-30D Due Soon</Tag>;
                if (bucket === 'OVERDUE') return <Tag color="warning">31-60D Overdue</Tag>;
                return <Tag color="error">60D+ Critical</Tag>;
              },
            },
            {
              title: 'Account State',
              dataIndex: 'accountStatus',
              key: 'accountStatus',
              width: 120,
              render: (status: string) => (
                <Tag color={status === 'ACTIVE' ? 'green' : 'red'} style={{ fontWeight: 700 }}>
                  {status === 'ACTIVE' ? 'ACTIVE' : 'LOCKED / FROZEN'}
                </Tag>
              ),
            },
            {
              title: 'Credit Actions',
              key: 'actions',
              width: 260,
              render: (_, record) => (
                <Space size={6}>
                  <Tooltip title="Send Payment Reminder via WhatsApp">
                    <Button
                      size="small"
                      icon={<WhatsAppOutlined style={{ color: '#25D366' }} />}
                      onClick={() => handleSendReminder(record)}
                    >
                      Remind
                    </Button>
                  </Tooltip>

                  <Tooltip title={record.accountStatus === 'FROZEN' ? 'Unfreeze Account' : 'Freeze Account (Block new orders)'}>
                    <Button
                      size="small"
                      danger={record.accountStatus === 'ACTIVE'}
                      icon={record.accountStatus === 'FROZEN' ? <UnlockOutlined /> : <LockOutlined />}
                      onClick={() => handleToggleAccountFreeze(record)}
                    >
                      {record.accountStatus === 'FROZEN' ? 'Unfreeze' : 'Freeze'}
                    </Button>
                  </Tooltip>

                  <Button
                    size="small"
                    type="primary"
                    onClick={() => handleOpenSettlement(record)}
                    style={{ background: '#059669', borderColor: '#059669' }}
                  >
                    Credit Entry
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      {/* 4. Settlements & Payment Gateway Reconciliation */}
      <Row gutter={[14, 14]}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <CreditCardOutlined style={{ color: '#1890ff' }} />
                <span>Payment Method Distribution</span>
              </Space>
            }
            style={{ borderRadius: 10, height: '100%' }}
          >
            <Row gutter={[12, 12]}>
              <Col span={12}>
                <div style={{ padding: '12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <Space>
                    <QrcodeOutlined style={{ color: '#096dd9', fontSize: 18 }} />
                    <Text strong>UPI (GPay / PhonePe)</Text>
                  </Space>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>₹8,95,000 (34.3%)</div>
                </div>
              </Col>

              <Col span={12}>
                <div style={{ padding: '12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <Space>
                    <BankOutlined style={{ color: '#722ed1', fontSize: 18 }} />
                    <Text strong>NEFT / RTGS (B2B)</Text>
                  </Space>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>₹11,70,000 (44.8%)</div>
                </div>
              </Col>

              <Col span={12}>
                <div style={{ padding: '12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <Space>
                    <CreditCardOutlined style={{ color: '#13c2c2', fontSize: 18 }} />
                    <Text strong>Cards &amp; NetBanking</Text>
                  </Space>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>₹2,80,000 (10.7%)</div>
                </div>
              </Col>

              <Col span={12}>
                <div style={{ padding: '12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <Space>
                    <DollarOutlined style={{ color: '#52c41a', fontSize: 18 }} />
                    <Text strong>Counter &amp; Rider Cash</Text>
                  </Space>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>₹2,65,000 (10.2%)</div>
                </div>
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <BankOutlined style={{ color: '#52c41a' }} />
                <span>Payment Gateway &amp; Escrow Reconciliation</span>
              </Space>
            }
            style={{ borderRadius: 10, height: '100%' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Unsettled Gateway Escrow Balance (Razorpay / PineLabs)
                </Text>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#059669' }}>
                  {formatCurrency(gatewayEscrow.escrowBalance)}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {gatewayEscrow.pendingOrdersCount} digital orders clearing in next batch
                </div>
              </div>

              <Button
                type="primary"
                disabled={gatewayEscrow.escrowBalance === 0}
                onClick={handleInstantPayout}
                style={{ background: '#059669', borderColor: '#059669' }}
              >
                Instant Bank Payout
              </Button>
            </div>

            <Divider style={{ margin: '12px 0' }} />

            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Next Scheduled Payout">{gatewayEscrow.nextPayoutDate}</Descriptions.Item>
              <Descriptions.Item label="Gateway Fee Rate">{gatewayEscrow.gatewayFeeRate}</Descriptions.Item>
              <Descriptions.Item label="Est. Net Bank Credit">
                <Text strong style={{ color: '#059669' }}>
                  {formatCurrency(gatewayEscrow.estimatedPayoutAmount)}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Linked Bank A/c">HDFC Bank (***1920)</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      {/* 5. Transaction Ledger Table */}
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <Space>
              <FileTextOutlined style={{ color: '#1677ff' }} />
              <span>Incoming Transaction &amp; Revenue Ledger</span>
            </Space>
            <Tag color="blue">{filteredTransactions.length} Transactions Found</Tag>
          </div>
        }
        style={{ borderRadius: 10 }}
      >
        {/* Filters Bar */}
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }} align="middle">
          <Col xs={24} sm={8} md={6}>
            <Input
              prefix={<SearchOutlined />}
              placeholder="Search TXN ID, UTR, Payer name..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              allowClear
            />
          </Col>

          <Col xs={12} sm={5} md={4}>
            <Select
              value={selectedChannel}
              onChange={setSelectedChannel}
              style={{ width: '100%' }}
              options={[
                { value: 'ALL', label: 'All Channels' },
                { value: 'B2C', label: 'B2C Shoppers' },
                { value: 'B2B_RETAILER', label: 'B2B Retailers' },
                { value: 'B2B_FRANCHISE', label: 'B2B Franchises' },
                { value: 'OUTLET_POS', label: 'POS Outlets' },
              ]}
            />
          </Col>

          <Col xs={12} sm={5} md={4}>
            <Select
              value={selectedStatus}
              onChange={setSelectedStatus}
              style={{ width: '100%' }}
              options={[
                { value: 'ALL', label: 'All Statuses' },
                { value: 'SETTLED', label: 'Settled (Paid)' },
                { value: 'PENDING_CLEARANCE', label: 'Pending Escrow' },
                { value: 'REFUNDED', label: 'Refunded' },
              ]}
            />
          </Col>

          <Col xs={12} sm={6} md={4}>
            <Select
              value={selectedState}
              onChange={setSelectedState}
              style={{ width: '100%' }}
              options={[
                { value: 'ALL', label: '📍 All States' },
                { value: 'Bihar', label: 'Bihar (10)' },
                { value: 'Jharkhand', label: 'Jharkhand (20)' },
                { value: 'Madhya Pradesh', label: 'MP (23)' },
                { value: 'Maharashtra', label: 'Maharashtra (27)' },
              ]}
            />
          </Col>

          <Col xs={12} sm={24} md={6} style={{ textAlign: 'right' }}>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setSelectedState('ALL');
                setSelectedChannel('ALL');
                setSelectedStatus('ALL');
                setSearchKeyword('');
              }}
            >
              Reset Filters
            </Button>
          </Col>
        </Row>

        <Table
          dataSource={filteredTransactions}
          columns={transactionColumns}
          rowKey="id"
          pagination={{ pageSize: 8 }}
          size="small"
        />
      </Card>

      {/* Record Settlement Modal */}
      <Modal
        title={`Record Ledger Payment Settlement — ${settlementTarget?.businessName}`}
        open={settlementModalOpen}
        onCancel={() => setSettlementModalOpen(false)}
        onOk={handleSaveSettlement}
        okText="Record Payment"
        destroyOnClose
      >
        <Form form={settlementForm} layout="vertical" style={{ marginTop: 16 }}>
          <Descriptions size="small" column={1} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Current Outstanding Balance">
              <strong style={{ color: '#cf1322', fontSize: 15 }}>
                {formatCurrency(settlementTarget?.outstandingBalance || 0)}
              </strong>
            </Descriptions.Item>
            <Descriptions.Item label="GSTIN / State">
              {settlementTarget?.gstin} ({settlementTarget?.state})
            </Descriptions.Item>
          </Descriptions>

          <Form.Item
            name="amount"
            label="Payment Amount Received (₹)"
            rules={[{ required: true, message: 'Please enter amount' }]}
          >
            <InputNumber min={1} max={settlementTarget?.outstandingBalance} prefix="₹" style={{ width: '100%' }} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="paymentMode" label="Payment Mode" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'NEFT', label: 'Bank Transfer (NEFT/RTGS)' },
                    { value: 'CHEQUE', label: 'Bank Cheque Deposit' },
                    { value: 'UPI', label: 'UPI Direct' },
                    { value: 'CASH', label: 'Direct Cash' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="utrNumber" label="UTR / Reference / Cheque No." rules={[{ required: true }]}>
                <Input placeholder="e.g. UTR-HDFC-991288" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="notes" label="Settlement Notes / Narration">
            <Input.TextArea rows={2} placeholder="Optional accounting notes" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
