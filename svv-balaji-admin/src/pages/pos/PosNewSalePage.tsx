import {
  BarcodeOutlined,
  CheckCircleOutlined,
  ClearOutlined,
  CreditCardOutlined,
  DeleteOutlined,
  DollarOutlined,
  EditOutlined,
  FileTextOutlined,
  MinusOutlined,
  PlusOutlined,
  PrinterOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  SearchOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { Can } from '../../components/Can';
import { PageHeader } from '../../components/PageHeader';
import { formatCurrency } from '../../utils/format';

const { Text, Title, Paragraph } = Typography;

export interface PosProductItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  unitPrice: number;
  availableStock: number;
  unit: string;
  taxRate: number; // e.g. 5 for 5%
}

export interface CartItem extends PosProductItem {
  quantity: number;
}

export interface OfflineCustomerDetails {
  customerType: 'WALK_IN' | 'REGULAR_KIRANA' | 'NEW_MANUAL';
  fullName: string;
  mobile: string;
  emailOrGst: string;
  address: string;
  city: string;
  notes?: string;
}

const MOCK_POS_PRODUCTS: PosProductItem[] = [
  {
    id: 'prod-001',
    sku: 'FG-ATT-10KG',
    name: 'Shree Vighnaharta Premium Whole Wheat Chakki Atta (10 KG)',
    category: 'Flour & Atta',
    unitPrice: 420,
    availableStock: 185,
    unit: 'BAG',
    taxRate: 5,
  },
  {
    id: 'prod-002',
    sku: 'FG-ATT-05KG',
    name: 'Shree Vighnaharta Multigrain Superfood Atta (5 KG)',
    category: 'Flour & Atta',
    unitPrice: 285,
    availableStock: 94,
    unit: 'BAG',
    taxRate: 5,
  },
  {
    id: 'prod-003',
    sku: 'FG-OIL-01L',
    name: 'Pure Kachi Ghani Mustard Oil (1 Litre Pouch)',
    category: 'Edible Oils',
    unitPrice: 165,
    availableStock: 320,
    unit: 'POUCH',
    taxRate: 5,
  },
  {
    id: 'prod-004',
    sku: 'FG-OIL-05L',
    name: 'Organic Cold-Pressed Groundnut Oil (5 Litre Can)',
    category: 'Edible Oils',
    unitPrice: 940,
    availableStock: 42,
    unit: 'CAN',
    taxRate: 5,
  },
  {
    id: 'prod-005',
    sku: 'FG-RIC-05KG',
    name: 'Traditional Organic Sonamasuri Rice (5 KG Pack)',
    category: 'Grains & Rice',
    unitPrice: 380,
    availableStock: 110,
    unit: 'PACK',
    taxRate: 5,
  },
  {
    id: 'prod-006',
    sku: 'FG-PUL-01KG',
    name: 'Unpolished Organic Arhar / Toor Dal (1 KG)',
    category: 'Pulses & Dal',
    unitPrice: 145,
    availableStock: 240,
    unit: 'PACK',
    taxRate: 5,
  },
  {
    id: 'prod-007',
    sku: 'FG-SPC-500G',
    name: 'Authentic Organic Turmeric Powder (500 Grams)',
    category: 'Spices & Seasoning',
    unitPrice: 120,
    availableStock: 150,
    unit: 'PACK',
    taxRate: 5,
  },
  {
    id: 'prod-008',
    sku: 'FG-GHE-01L',
    name: 'Pure Desi A2 Cow Ghee (1 Litre Jar)',
    category: 'Dairy & Ghee',
    unitPrice: 1150,
    availableStock: 65,
    unit: 'JAR',
    taxRate: 12,
  },
];

export function PosNewSalePage() {
  const { message } = AntApp.useApp();
  const [selectedOutlet, setSelectedOutlet] = useState<string>('outlet-pat-01');
  const [cashierName] = useState<string>('Rajesh Kumar (Shift #A)');

  // Product search & filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Customer details for offline walk-in
  const [customerDetails, setCustomerDetails] = useState<OfflineCustomerDetails>({
    customerType: 'WALK_IN',
    fullName: 'Walk-in Store Customer',
    mobile: '9876500000',
    emailOrGst: '',
    address: 'Patna Outlet Counter',
    city: 'Patna',
    notes: '',
  });
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerForm] = Form.useForm<OfflineCustomerDetails>();

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'CARD' | 'CREDIT'>('CASH');
  const [cashTendered, setCashTendered] = useState<number>(0);

  // Invoice Receipt Modal
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<any>(null);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set(MOCK_POS_PRODUCTS.map((p) => p.category));
    return ['ALL', ...Array.from(set)];
  }, []);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return MOCK_POS_PRODUCTS.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat = selectedCategory === 'ALL' || p.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [searchQuery, selectedCategory]);

  // Cart Calculations
  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  }, [cart]);

  const totalTax = useMemo(() => {
    return cart.reduce((sum, item) => {
      const lineSubtotal = item.unitPrice * item.quantity;
      return sum + (lineSubtotal * item.taxRate) / 100;
    }, 0);
  }, [cart]);

  const netPayable = useMemo(() => {
    const total = cartSubtotal + totalTax - discountAmount;
    return total > 0 ? total : 0;
  }, [cartSubtotal, totalTax, discountAmount]);

  const changeDue = useMemo(() => {
    if (paymentMode !== 'CASH') return 0;
    const diff = cashTendered - netPayable;
    return diff > 0 ? diff : 0;
  }, [cashTendered, netPayable, paymentMode]);

  // Handlers
  const handleAddToCart = (product: PosProductItem) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        if (existing.quantity >= product.availableStock) {
          message.warning(`Maximum available stock (${product.availableStock}) reached!`);
          return prev;
        }
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    message.success(`Added ${product.name} to bill cart`);
  };

  const handleUpdateQty = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(productId);
      return;
    }
    const product = MOCK_POS_PRODUCTS.find((p) => p.id === productId);
    if (product && newQty > product.availableStock) {
      message.warning(`Cannot exceed available stock of ${product.availableStock} ${product.unit}`);
      return;
    }
    setCart((prev) =>
      prev.map((item) => (item.id === productId ? { ...item, quantity: newQty } : item)),
    );
  };

  const handleRemoveItem = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  };

  const handleSaveCustomerDetails = (values: OfflineCustomerDetails) => {
    setCustomerDetails(values);
    setCustomerModalOpen(false);
    message.success('Offline Customer details updated!');
  };

  const handleCompleteSale = () => {
    if (cart.length === 0) {
      message.error('Cart is empty! Add products to process sale.');
      return;
    }
    if (paymentMode === 'CASH' && cashTendered < netPayable) {
      message.warning(`Cash tendered (${formatCurrency(cashTendered)}) is less than net payable (${formatCurrency(netPayable)})!`);
      return;
    }

    const orderRecord = {
      orderId: `POS-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`,
      createdAt: new Date().toLocaleString(),
      outlet: selectedOutlet === 'outlet-pat-01' ? 'Patna City Flagship Retail Store' : 'Indore Central Outlet',
      cashier: cashierName,
      customer: customerDetails,
      cartItems: [...cart],
      subtotal: cartSubtotal,
      tax: totalTax,
      discount: discountAmount,
      netTotal: netPayable,
      paymentMode,
      cashTendered: paymentMode === 'CASH' ? cashTendered : netPayable,
      changeDue,
    };

    setCompletedOrder(orderRecord);
    setInvoiceModalOpen(true);
  };

  const handlePrintReceiptAndReset = () => {
    message.success(`Receipt printed for ${completedOrder?.orderId}! Order completed.`);
    setInvoiceModalOpen(false);
    setCart([]);
    setDiscountAmount(0);
    setCashTendered(0);
    setCompletedOrder(null);
  };

  const columns: ColumnsType<PosProductItem> = [
    {
      title: 'Item Details',
      key: 'name',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ fontSize: 13 }}>{record.name}</Text>
          <Space size={6}>
            <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>SKU: {record.sku}</Tag>
            <Tag color="purple" style={{ fontSize: 10, margin: 0 }}>{record.category}</Tag>
          </Space>
        </Space>
      ),
    },
    {
      title: 'Stock',
      key: 'stock',
      width: 90,
      render: (_, record) => (
        <Tag color={record.availableStock < 50 ? 'warning' : 'green'}>
          {record.availableStock} {record.unit}
        </Tag>
      ),
    },
    {
      title: 'Price',
      key: 'price',
      width: 100,
      render: (_, record) => <Text strong>{formatCurrency(record.unitPrice)}</Text>,
    },
    {
      title: 'Action',
      key: 'action',
      width: 110,
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => handleAddToCart(record)}
        >
          Add
        </Button>
      ),
    },
  ];

  return (
    <Can do="ORDER_VIEW" fallback={<div style={{ padding: 24 }}>Access Denied</div>}>
      <PageHeader
        title="POS Counter Billing Terminal (New Sale)"
        subtitle="Process walk-in offline store sales, manually input customer details, scan catalog products, and print instant tax invoices."
        actions={[
          <Select
            key="outlet"
            value={selectedOutlet}
            onChange={setSelectedOutlet}
            style={{ width: 260 }}
            options={[
              { value: 'outlet-pat-01', label: '🏬 Patna City Flagship Store' },
              { value: 'outlet-ind-02', label: '🏬 Indore Central Retail Store' },
              { value: 'outlet-rnc-03', label: '🏬 Ranchi Hub Counter' },
            ]}
          />,
          <Tag key="cashier" color="cyan" style={{ fontSize: 13, padding: '4px 10px' }}>
            <UserOutlined /> {cashierName}
          </Tag>,
        ]}
      />

      <Row gutter={[16, 16]}>
        {/* Left Column: Offline Customer Info & Product Catalog */}
        <Col xs={24} lg={14} xl={15}>
          {/* Offline Customer Info Header Card */}
          <Card
            size="small"
            style={{ marginBottom: 16, borderRadius: 8, borderColor: '#d9d9d9' }}
            title={
              <Space>
                <UserOutlined style={{ color: '#1890ff' }} />
                <span>Offline Walk-in Customer Details</span>
                <Tag color={customerDetails.customerType === 'WALK_IN' ? 'blue' : 'purple'}>
                  {customerDetails.customerType === 'WALK_IN' ? 'Walk-in Guest' : customerDetails.customerType === 'REGULAR_KIRANA' ? 'Kirana Wholesale Partner' : 'Manual Entry Customer'}
                </Tag>
              </Space>
            }
            extra={
              <Button
                type="link"
                icon={<EditOutlined />}
                onClick={() => {
                  customerForm.setFieldsValue(customerDetails);
                  setCustomerModalOpen(true);
                }}
              >
                Edit Details
              </Button>
            }
          >
            <Row gutter={[16, 8]}>
              <Col span={12}>
                <Text type="secondary">Customer Name: </Text>
                <Text strong>{customerDetails.fullName}</Text>
              </Col>
              <Col span={12}>
                <Text type="secondary">Mobile #: </Text>
                <Text strong>{customerDetails.mobile || 'N/A'}</Text>
              </Col>
              {customerDetails.emailOrGst && (
                <Col span={12}>
                  <Text type="secondary">GSTIN / Email: </Text>
                  <Tag color="volcano">{customerDetails.emailOrGst}</Tag>
                </Col>
              )}
              <Col span={12}>
                <Text type="secondary">City / Counter: </Text>
                <Text>{customerDetails.city} ({customerDetails.address})</Text>
              </Col>
            </Row>
          </Card>

          {/* Product Search & Filter Bar */}
          <Card size="small" style={{ marginBottom: 16, borderRadius: 8 }}>
            <Row gutter={[12, 12]} align="middle">
              <Col xs={24} sm={12}>
                <Input
                  placeholder="Search product name, SKU or scan barcode..."
                  prefix={<SearchOutlined />}
                  suffix={<BarcodeOutlined />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  allowClear
                />
              </Col>

              <Col xs={24} sm={12}>
                <Space wrap>
                  <Text type="secondary" style={{ fontSize: 12 }}>Category: </Text>
                  <Select
                    value={selectedCategory}
                    onChange={setSelectedCategory}
                    style={{ width: 170 }}
                    options={categories.map((cat) => ({ value: cat, label: cat }))}
                  />
                </Space>
              </Col>
            </Row>
          </Card>

          {/* Product Catalog Table */}
          <Card
            title={
              <Space>
                <ShopOutlined />
                <span>Store Available Inventory ({filteredProducts.length} Items)</span>
              </Space>
            }
            bodyStyle={{ padding: 0 }}
            style={{ borderRadius: 8 }}
          >
            <Table
              dataSource={filteredProducts}
              columns={columns}
              rowKey="id"
              pagination={{ pageSize: 5 }}
              size="small"
            />
          </Card>
        </Col>

        {/* Right Column: Cart & Checkout Payment Panel */}
        <Col xs={24} lg={10} xl={9}>
          <Card
            title={
              <Row justify="space-between" align="middle" style={{ width: '100%' }}>
                <Space>
                  <ShoppingCartOutlined style={{ fontSize: 18, color: '#52c41a' }} />
                  <span>Current Bill Cart</span>
                  <Badge count={cart.length} showZero overflowCount={99} color="#52c41a" />
                </Space>
                {cart.length > 0 && (
                  <Button
                    type="text"
                    danger
                    icon={<ClearOutlined />}
                    size="small"
                    onClick={() => setCart([])}
                  >
                    Clear
                  </Button>
                )}
              </Row>
            }
            style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
          >
            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px' }}>
                <ShoppingCartOutlined style={{ fontSize: 42, color: '#bfbfbf' }} />
                <Paragraph type="secondary" style={{ marginTop: 12 }}>
                  Bill cart is empty. Click "+ Add" on catalog products to start building counter bill.
                </Paragraph>
              </div>
            ) : (
              <div>
                {/* Cart Items List */}
                <div style={{ maxHeight: 260, overflowY: 'auto', marginBottom: 16 }}>
                  {cart.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: '8px 0',
                        borderBottom: '1px dashed #f0f0f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ flex: 1, paddingRight: 8 }}>
                        <Text strong style={{ fontSize: 12, display: 'block' }}>
                          {item.name}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {formatCurrency(item.unitPrice)} x {item.quantity} ={' '}
                          <Text strong style={{ color: '#1890ff' }}>
                            {formatCurrency(item.unitPrice * item.quantity)}
                          </Text>
                        </Text>
                      </div>

                      {/* Quantity Controls */}
                      <Space size={4}>
                        <Button
                          size="small"
                          icon={<MinusOutlined />}
                          onClick={() => handleUpdateQty(item.id, item.quantity - 1)}
                        />
                        <InputNumber
                          min={1}
                          max={item.availableStock}
                          value={item.quantity}
                          onChange={(val) => handleUpdateQty(item.id, Number(val) || 1)}
                          style={{ width: 50, textAlign: 'center' }}
                          controls={false}
                          size="small"
                        />
                        <Button
                          size="small"
                          icon={<PlusOutlined />}
                          onClick={() => handleUpdateQty(item.id, item.quantity + 1)}
                        />
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          size="small"
                          onClick={() => handleRemoveItem(item.id)}
                        />
                      </Space>
                    </div>
                  ))}
                </div>

                <Divider style={{ margin: '12px 0' }} />

                {/* Subtotal & Taxes Breakdown */}
                <Space direction="vertical" style={{ width: '100%' }} size={8}>
                  <Row justify="space-between">
                    <Text type="secondary">Item Subtotal:</Text>
                    <Text strong>{formatCurrency(cartSubtotal)}</Text>
                  </Row>

                  <Row justify="space-between">
                    <Text type="secondary">Est. GST Tax (CGST + SGST):</Text>
                    <Text>{formatCurrency(totalTax)}</Text>
                  </Row>

                  <Row justify="space-between" align="middle">
                    <Text type="secondary">Manual Counter Discount (₹):</Text>
                    <InputNumber
                      min={0}
                      max={cartSubtotal}
                      value={discountAmount}
                      onChange={(val) => setDiscountAmount(Number(val) || 0)}
                      size="small"
                      style={{ width: 110 }}
                      prefix="₹"
                    />
                  </Row>

                  <Divider style={{ margin: '8px 0' }} />

                  {/* Net Payable Highlight */}
                  <div
                    style={{
                      background: '#f6ffed',
                      border: '1px solid #b7eb8f',
                      padding: 12,
                      borderRadius: 6,
                      textAlign: 'center',
                    }}
                  >
                    <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase' }}>
                      Net Payable Bill Amount
                    </Text>
                    <Title level={2} style={{ margin: 0, color: '#52c41a' }}>
                      {formatCurrency(netPayable)}
                    </Title>
                  </div>
                </Space>

                <Divider style={{ margin: '12px 0' }} />

                {/* Payment Options */}
                <div style={{ marginBottom: 16 }}>
                  <Text strong style={{ marginBottom: 8, display: 'block' }}>
                    Select Payment Mode:
                  </Text>
                  <Radio.Group
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    buttonStyle="solid"
                    style={{ width: '100%' }}
                  >
                    <Row gutter={[8, 8]}>
                      <Col span={12}>
                        <Radio.Button
                          value="CASH"
                          style={{
                            width: '100%',
                            textAlign: 'center',
                            height: 38,
                            lineHeight: '36px',
                            borderRadius: 6,
                          }}
                        >
                          <DollarOutlined /> Cash
                        </Radio.Button>
                      </Col>
                      <Col span={12}>
                        <Radio.Button
                          value="UPI"
                          style={{
                            width: '100%',
                            textAlign: 'center',
                            height: 38,
                            lineHeight: '36px',
                            borderRadius: 6,
                          }}
                        >
                          <QrcodeOutlined /> UPI QR
                        </Radio.Button>
                      </Col>
                      <Col span={12}>
                        <Radio.Button
                          value="CARD"
                          style={{
                            width: '100%',
                            textAlign: 'center',
                            height: 38,
                            lineHeight: '36px',
                            borderRadius: 6,
                          }}
                        >
                          <CreditCardOutlined /> Card Swipe
                        </Radio.Button>
                      </Col>
                      <Col span={12}>
                        <Radio.Button
                          value="CREDIT"
                          style={{
                            width: '100%',
                            textAlign: 'center',
                            height: 38,
                            lineHeight: '36px',
                            borderRadius: 6,
                          }}
                        >
                          <ShopOutlined /> Store Credit
                        </Radio.Button>
                      </Col>
                    </Row>
                  </Radio.Group>
                </div>

                {/* Mode Specific Inputs */}
                {paymentMode === 'CASH' && (
                  <Card size="small" style={{ background: '#fafafa', marginBottom: 16 }}>
                    <Row gutter={12} align="middle">
                      <Col span={12}>
                        <Text type="secondary">Cash Tendered (₹):</Text>
                        <InputNumber
                          min={0}
                          value={cashTendered}
                          onChange={(val) => setCashTendered(Number(val) || 0)}
                          style={{ width: '100%', marginTop: 4 }}
                          prefix="₹"
                        />
                      </Col>
                      <Col span={12}>
                        <Text type="secondary">Change Due (₹):</Text>
                        <Title level={4} style={{ margin: '4px 0 0 0', color: changeDue > 0 ? '#1890ff' : '#000' }}>
                          {formatCurrency(changeDue)}
                        </Title>
                      </Col>
                    </Row>
                  </Card>
                )}

                {paymentMode === 'UPI' && (
                  <Alert
                    message="Dynamic UPI QR Payment"
                    description="Show counter QR scanner display to customer. Ensure payment notification is received before completing sale."
                    type="info"
                    showIcon
                    icon={<QrcodeOutlined />}
                    style={{ marginBottom: 16 }}
                  />
                )}

                {/* Checkout Submit Button */}
                <Button
                  type="primary"
                  size="large"
                  block
                  icon={<CheckCircleOutlined />}
                  onClick={handleCompleteSale}
                  style={{ height: 48, fontSize: 16, background: '#52c41a', borderColor: '#52c41a' }}
                >
                  Complete Sale & Print Invoice
                </Button>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Manual Customer Entry Modal */}
      <Modal
        title="Add / Edit Offline Store Customer Details"
        open={customerModalOpen}
        onCancel={() => setCustomerModalOpen(false)}
        onOk={() => customerForm.submit()}
        okText="Save Customer Info"
        width={560}
      >
        <Form
          form={customerForm}
          layout="vertical"
          onFinish={handleSaveCustomerDetails}
          initialValues={customerDetails}
        >
          <Form.Item name="customerType" label="Customer Type">
            <Radio.Group buttonStyle="solid">
              <Radio.Button value="WALK_IN">Walk-in Retail Guest</Radio.Button>
              <Radio.Button value="REGULAR_KIRANA">Regular Kirana Wholesale</Radio.Button>
              <Radio.Button value="NEW_MANUAL">New Offline Registration</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="fullName"
                label="Customer Full Name"
                rules={[{ required: true, message: 'Please enter customer name' }]}
              >
                <Input placeholder="e.g. Ramesh Kumar" prefix={<UserOutlined />} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="mobile"
                label="Mobile Number"
                rules={[{ required: true, message: 'Please enter mobile number' }]}
              >
                <Input placeholder="e.g. 9876543210" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="emailOrGst" label="GSTIN / Tax ID (Optional)">
                <Input placeholder="e.g. 10AAACB1234F1Z5" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="city" label="City / Region">
                <Input placeholder="e.g. Patna" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="address" label="Store Location / Address Notes">
            <Input.TextArea rows={2} placeholder="Physical address or counter notes" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Tax Invoice Printable Modal */}
      <Modal
        title={
          <Space>
            <FileTextOutlined style={{ color: '#52c41a' }} />
            <span>POS Tax Invoice & Receipt — {completedOrder?.orderId}</span>
          </Space>
        }
        open={invoiceModalOpen}
        onCancel={() => setInvoiceModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setInvoiceModalOpen(false)}>
            Close
          </Button>,
          <Button
            key="print"
            type="primary"
            icon={<PrinterOutlined />}
            onClick={handlePrintReceiptAndReset}
            style={{ background: '#52c41a', borderColor: '#52c41a' }}
          >
            Print Thermal Receipt & Complete
          </Button>,
        ]}
        width={650}
      >
        {completedOrder && (
          <div
            style={{
              padding: 16,
              background: '#fff',
              border: '1px solid #e8e8e8',
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            {/* Store Header */}
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <Title level={4} style={{ margin: 0 }}>SHREE VIGHNAHARTA VALUE BALAJI AGRO</Title>
              <Text type="secondary">Patna City Flagship Retail Store • GSTIN: 10AAACS8812F1Z9</Text>
              <br />
              <Text type="secondary">Helpline: +91 91234 56789 | Email: pos@svvbalaji.com</Text>
              <Divider style={{ margin: '8px 0' }} />
              <Tag color="green">TAX INVOICE / COUNTER CASH RECEIPT</Tag>
            </div>

            {/* Invoice Meta */}
            <Row gutter={[16, 8]} style={{ marginBottom: 16 }}>
              <Col span={12}>
                <Text type="secondary">Invoice No: </Text>
                <Text strong>{completedOrder.orderId}</Text>
              </Col>
              <Col span={12}>
                <Text type="secondary">Date & Time: </Text>
                <Text>{completedOrder.createdAt}</Text>
              </Col>
              <Col span={12}>
                <Text type="secondary">Customer Name: </Text>
                <Text strong>{completedOrder.customer?.fullName}</Text>
              </Col>
              <Col span={12}>
                <Text type="secondary">Customer Mobile: </Text>
                <Text>{completedOrder.customer?.mobile}</Text>
              </Col>
              {completedOrder.customer?.emailOrGst && (
                <Col span={12}>
                  <Text type="secondary">Customer GSTIN: </Text>
                  <Text strong>{completedOrder.customer?.emailOrGst}</Text>
                </Col>
              )}
              <Col span={12}>
                <Text type="secondary">Cashier: </Text>
                <Text>{completedOrder.cashier}</Text>
              </Col>
            </Row>

            {/* Line Items Table */}
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                marginBottom: 16,
                fontSize: 12,
              }}
            >
              <thead>
                <tr style={{ background: '#fafafa', borderBottom: '1px solid #d9d9d9' }}>
                  <th style={{ padding: 6, textAlign: 'left' }}>Item</th>
                  <th style={{ padding: 6, textAlign: 'right' }}>Price</th>
                  <th style={{ padding: 6, textAlign: 'center' }}>Qty</th>
                  <th style={{ padding: 6, textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {completedOrder.cartItems.map((item: CartItem) => (
                  <tr key={item.id} style={{ borderBottom: '1px dashed #f0f0f0' }}>
                    <td style={{ padding: 6 }}>
                      {item.name}
                      <br />
                      <span style={{ fontSize: 10, color: '#8c8c8c' }}>SKU: {item.sku}</span>
                    </td>
                    <td style={{ padding: 6, textAlign: 'right' }}>{formatCurrency(item.unitPrice)}</td>
                    <td style={{ padding: 6, textAlign: 'center' }}>{item.quantity}</td>
                    <td style={{ padding: 6, textAlign: 'right' }}>
                      {formatCurrency(item.unitPrice * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Invoice Totals Summary */}
            <div style={{ width: '60%', marginLeft: 'auto' }}>
              <Row justify="space-between">
                <Text type="secondary">Subtotal:</Text>
                <Text>{formatCurrency(completedOrder.subtotal)}</Text>
              </Row>
              <Row justify="space-between">
                <Text type="secondary">GST Tax:</Text>
                <Text>{formatCurrency(completedOrder.tax)}</Text>
              </Row>
              {completedOrder.discount > 0 && (
                <Row justify="space-between">
                  <Text type="secondary">Discount:</Text>
                  <Text style={{ color: '#ff4d4f' }}>-{formatCurrency(completedOrder.discount)}</Text>
                </Row>
              )}
              <Divider style={{ margin: '4px 0' }} />
              <Row justify="space-between">
                <Text strong style={{ fontSize: 14 }}>Grand Total:</Text>
                <Text strong style={{ fontSize: 16, color: '#52c41a' }}>
                  {formatCurrency(completedOrder.netTotal)}
                </Text>
              </Row>
              <Row justify="space-between" style={{ marginTop: 4 }}>
                <Text type="secondary">Payment Mode:</Text>
                <Tag color="blue">{completedOrder.paymentMode}</Tag>
              </Row>
              {completedOrder.paymentMode === 'CASH' && (
                <>
                  <Row justify="space-between">
                    <Text type="secondary">Cash Tendered:</Text>
                    <Text>{formatCurrency(completedOrder.cashTendered)}</Text>
                  </Row>
                  <Row justify="space-between">
                    <Text type="secondary">Change Returned:</Text>
                    <Text>{formatCurrency(completedOrder.changeDue)}</Text>
                  </Row>
                </>
              )}
            </div>

            <Divider style={{ margin: '16px 0 8px 0' }} />
            <div style={{ textAlign: 'center', fontSize: 11, color: '#8c8c8c' }}>
              Thank you for shopping at Shree Vighnaharta Value Balaji Store!
              <br />
              Goods once sold are non-refundable except for quality defects reported within 48 hrs.
            </div>
          </div>
        )}
      </Modal>
    </Can>
  );
}
