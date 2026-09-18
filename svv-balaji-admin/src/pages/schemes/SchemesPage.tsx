import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FireFilled,
  GiftOutlined,
  LinkOutlined,
  PercentageOutlined,
  PlusOutlined,
  ReloadOutlined,
  RocketOutlined,
  TagsOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  ColorPicker,
  DatePicker,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Radio,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { Coupon, CreateCouponInput, CreateSchemeInput, Scheme } from '../../api/types';
import { Can } from '../../components/Can';
import { PageHeader } from '../../components/PageHeader';
import {
  useCreateScheme,
  useDeleteScheme,
  useSchemes,
  useSetSchemeActive,
  useUpdateScheme,
} from '@shared/hooks/useSchemes';
import {
  useCoupons,
  useCreateCoupon,
  useDeleteCoupon,
  useSetCouponActive,
  useUpdateCoupon,
} from '@shared/hooks/useCoupons';

const { Text, Title } = Typography;

/** Form.Item-shaped wrapper around antd's ColorPicker - stores/emits a plain hex string. */
function ColorField({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  return (
    <ColorPicker
      value={value}
      onChange={(color) => onChange?.(color.toHexString())}
      showText
      disabledAlpha
    />
  );
}

function SchemeFormDrawer({
  open,
  scheme,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  scheme?: Scheme | null;
  saving: boolean;
  onClose: () => void;
  onSave: (values: CreateSchemeInput) => void;
}) {
  const [form] = Form.useForm<CreateSchemeInput>();
  const isEdit = Boolean(scheme);

  const defaultValues: CreateSchemeInput = {
    tag: '',
    title: '',
    subtitle: '',
    ctaText: 'SHOP NOW',
    ctaLink: '/products/atta-flour',
    backgroundColor: '#fce3cd',
    textColor: '#452b0d',
    badgeColor: '#965a0b',
    badgeTextColor: '#ffffff',
    buttonColor: '#8a4b08',
    buttonTextColor: '#ffffff',
    targetAudience: 'ALL',
    displayOrder: 1,
    isActive: true,
  };

  const initialValues: CreateSchemeInput = scheme
    ? {
        tag: scheme.tag ?? '',
        title: scheme.title ?? '',
        subtitle: scheme.subtitle ?? '',
        ctaText: scheme.ctaText ?? '',
        ctaLink: scheme.ctaLink ?? '',
        backgroundColor: scheme.backgroundColor ?? '#fce3cd',
        textColor: scheme.textColor ?? '#452b0d',
        badgeColor: scheme.badgeColor ?? '#965a0b',
        badgeTextColor: scheme.badgeTextColor ?? '#ffffff',
        buttonColor: scheme.buttonColor ?? '#8a4b08',
        buttonTextColor: scheme.buttonTextColor ?? '#ffffff',
        targetAudience: scheme.targetAudience ?? 'ALL',
        displayOrder: scheme.displayOrder ?? 1,
        isActive: scheme.isActive ?? true,
      }
    : defaultValues;

  useEffect(() => {
    if (!open) return;
    if (scheme) {
      form.setFieldsValue(initialValues);
    } else {
      form.resetFields();
      form.setFieldsValue(defaultValues);
    }
  }, [open, scheme, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    onSave(values);
  };

  return (
    <Drawer
      title={isEdit ? `Edit Scheme: ${scheme?.title}` : 'Add New Homepage Scheme'}
      width={640}
      open={open}
      onClose={onClose}
      extra={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={saving} onClick={handleSubmit}>
            {isEdit ? 'Save Scheme' : 'Publish Scheme'}
          </Button>
        </Space>
      }
      destroyOnClose
    >
      <Form
        key={scheme ? scheme.id : 'new-scheme'}
        form={form}
        layout="vertical"
        requiredMark
        initialValues={initialValues}
      >
        <Row gutter={16}>
          <Col span={10}>
            <Form.Item name="tag" label="Eyebrow Tag" rules={[{ required: true, message: 'Please enter a tag' }]}>
              <Input placeholder="LIMITED TIME" />
            </Form.Item>
          </Col>
          <Col span={14}>
            <Form.Item name="title" label="Headline" rules={[{ required: true, message: 'Please enter a title' }]}>
              <Input placeholder="Buy 10 Get 1 Free" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="subtitle" label="Subtitle" rules={[{ required: true, message: 'Please enter a subtitle' }]}>
          <Input placeholder="on Selected Namkeen" />
        </Form.Item>

        <Divider orientation="left" plain>
          CTA Button
        </Divider>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="ctaText" label="Button Label" rules={[{ required: true }]}>
              <Input placeholder="SHOP NOW" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="ctaLink" label="Button Route Link">
              <Input placeholder="/products/atta-flour" prefix={<LinkOutlined />} />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>
          Colors
        </Divider>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="backgroundColor" label="Card Background">
              <ColorField />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="textColor" label="Card Text">
              <ColorField />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="badgeColor" label="Tag Background">
              <ColorField />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="badgeTextColor" label="Tag Text">
              <ColorField />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="buttonColor" label="Button Background">
              <ColorField />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="buttonTextColor" label="Button Text">
              <ColorField />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>
          Targeting & Display
        </Divider>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="targetAudience" label="Target Customer Channel">
              <Select
                options={[
                  { value: 'ALL', label: 'All Users (B2C & B2B)' },
                  { value: 'B2C', label: 'B2C Shoppers Only' },
                  { value: 'B2B', label: 'B2B Wholesale Accounts Only' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="displayOrder"
              label="Row Position"
              extra="Lower numbers show first on the homepage."
            >
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="isActive" label="Publish Live Status" valuePropName="checked">
          <Switch checkedChildren="Live" unCheckedChildren="Hidden" />
        </Form.Item>
      </Form>
    </Drawer>
  );
}

/** Drawer for Creating / Editing Customer Cart Coupons */
function CouponFormDrawer({
  open,
  coupon,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  coupon?: Coupon | null;
  saving: boolean;
  onClose: () => void;
  onSave: (values: CreateCouponInput) => void;
}) {
  const [form] = Form.useForm<CreateCouponInput>();
  const isEdit = Boolean(coupon);
  const discountType = Form.useWatch('discountType', form) ?? coupon?.discountType ?? 'FIXED';

  const defaultValues: CreateCouponInput = {
    code: '',
    title: '',
    description: '',
    discountType: 'FIXED',
    discountValue: 50,
    minOrderValue: 499,
    maxDiscount: undefined,
    targetAudience: 'ALL',
    expiryDate: dayjs().add(30, 'day').format('YYYY-MM-DD'),
    usageLimit: 500,
    isActive: true,
  };

  const initialValues: CreateCouponInput = coupon
    ? {
        code: coupon.code,
        title: coupon.title,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minOrderValue: coupon.minOrderValue,
        maxDiscount: coupon.maxDiscount,
        targetAudience: coupon.targetAudience,
        expiryDate: coupon.expiryDate,
        usageLimit: coupon.usageLimit,
        isActive: coupon.isActive,
      }
    : defaultValues;

  useEffect(() => {
    if (!open) return;
    if (coupon) {
      form.setFieldsValue(initialValues);
    } else {
      form.resetFields();
      form.setFieldsValue(defaultValues);
    }
  }, [open, coupon, form]);

  const generateRandomCode = () => {
    const prefixes = ['BALAJI', 'SUPER', 'FARM', 'FRESH', 'OFFER', 'SPECIAL', 'SAVE'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const num = Math.floor(10 + Math.random() * 90);
    form.setFieldValue('code', `${prefix}${num}`);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    onSave({
      ...values,
      code: values.code.trim().toUpperCase(),
    });
  };

  return (
    <Drawer
      title={isEdit ? `Edit Coupon: ${coupon?.code}` : 'Create New Cart Coupon'}
      width={600}
      open={open}
      onClose={onClose}
      extra={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={saving} onClick={handleSubmit}>
            {isEdit ? 'Save Coupon' : 'Create Coupon'}
          </Button>
        </Space>
      }
      destroyOnClose
    >
      <Form
        key={coupon ? coupon.id : 'new-coupon'}
        form={form}
        layout="vertical"
        requiredMark
        initialValues={initialValues}
      >
        <Row gutter={16}>
          <Col span={16}>
            <Form.Item
              name="code"
              label="Coupon Code (Applied on Cart)"
              rules={[
                { required: true, message: 'Please enter a coupon code' },
                { pattern: /^[A-Z0-9_-]+$/i, message: 'Only uppercase alphanumeric code allowed' },
              ]}
              extra="Customer will type or apply this code during checkout."
            >
              <Input
                placeholder="e.g. BALAJI50, WELCOME100"
                style={{ textTransform: 'uppercase', fontWeight: 600, letterSpacing: 1 }}
                onChange={(e) => form.setFieldValue('code', e.target.value.toUpperCase())}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label=" " colon={false}>
              <Button icon={<ThunderboltOutlined />} onClick={generateRandomCode} style={{ width: '100%' }}>
                Generate
              </Button>
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="title"
          label="Coupon Title / Badge"
          rules={[{ required: true, message: 'Please enter a title' }]}
        >
          <Input placeholder="e.g. Super Saver Discount, Welcome Offer" />
        </Form.Item>

        <Form.Item
          name="description"
          label="Offer Description (Shown in Cart & Offers list)"
          rules={[{ required: true, message: 'Please enter description' }]}
        >
          <Input.TextArea rows={2} placeholder="e.g. Flat ₹50 OFF on orders above ₹499" />
        </Form.Item>

        <Divider orientation="left" plain>
          Discount Rules
        </Divider>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="discountType" label="Discount Type" rules={[{ required: true }]}>
              <Radio.Group buttonStyle="solid" style={{ width: '100%' }}>
                <Radio.Button value="FIXED" style={{ width: '50%', textAlign: 'center' }}>
                  Flat Amount (₹)
                </Radio.Button>
                <Radio.Button value="PERCENTAGE" style={{ width: '50%', textAlign: 'center' }}>
                  Percentage (%)
                </Radio.Button>
              </Radio.Group>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="discountValue"
              label={discountType === 'FIXED' ? 'Flat Discount Amount (₹)' : 'Discount Percentage (%)'}
              rules={[{ required: true, message: 'Enter discount value' }]}
            >
              <InputNumber
                min={1}
                max={discountType === 'PERCENTAGE' ? 100 : 100000}
                prefix={discountType === 'FIXED' ? '₹' : undefined}
                suffix={discountType === 'PERCENTAGE' ? '%' : undefined}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="minOrderValue"
              label="Minimum Cart Value (₹)"
              extra="Customer cart subtotal must reach this to apply."
            >
              <InputNumber min={0} prefix="₹" style={{ width: '100%' }} placeholder="0" />
            </Form.Item>
          </Col>
          {discountType === 'PERCENTAGE' && (
            <Col span={12}>
              <Form.Item
                name="maxDiscount"
                label="Maximum Discount Cap (₹)"
                extra="Maximum discount amount allowed."
              >
                <InputNumber min={1} prefix="₹" style={{ width: '100%' }} placeholder="Optional cap" />
              </Form.Item>
            </Col>
          )}
        </Row>

        <Divider orientation="left" plain>
          Eligibility & Limits
        </Divider>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="targetAudience" label="Target Customer Channel">
              <Select
                options={[
                  { value: 'ALL', label: 'All Shoppers (B2C & B2B)' },
                  { value: 'B2C', label: 'B2C Retail Shoppers Only' },
                  { value: 'B2B', label: 'B2B Wholesale Accounts Only' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="usageLimit" label="Total Usage Limit" extra="Total times this coupon can be redeemed.">
              <InputNumber min={1} style={{ width: '100%' }} placeholder="e.g. 500" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="expiryDate" label="Expiry Date">
              <Input type="date" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="isActive" label="Live Status" valuePropName="checked">
              <Switch checkedChildren="Active" unCheckedChildren="Disabled" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Drawer>
  );
}

/**
 * Super Admin Schemes & Customer Cart Coupons CMS.
 */
export function SchemesPage() {
  const { message } = AntApp.useApp();
  const [activeTab, setActiveTab] = useState<'schemes' | 'coupons'>('schemes');

  // Schemes hooks
  const { data: schemesData, isLoading: schemesLoading } = useSchemes(true);
  const schemes = schemesData?.data ?? [];
  const createScheme = useCreateScheme();
  const updateScheme = useUpdateScheme();
  const setSchemeActive = useSetSchemeActive();
  const deleteScheme = useDeleteScheme();

  // Coupons hooks
  const { data: coupons = [], isLoading: couponsLoading } = useCoupons(true);
  const createCoupon = useCreateCoupon();
  const updateCoupon = useUpdateCoupon();
  const setCouponActive = useSetCouponActive();
  const deleteCoupon = useDeleteCoupon();

  // Drawers state
  const [schemeDrawerOpen, setSchemeDrawerOpen] = useState(false);
  const [editingScheme, setEditingScheme] = useState<Scheme | null>(null);

  const [couponDrawerOpen, setCouponDrawerOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);

  const activeSchemes = schemes.filter((s) => s.isActive).sort((a, b) => a.displayOrder - b.displayOrder);
  const activeCoupons = coupons.filter((c) => c.isActive);

  // Scheme Handlers
  const handleOpenAddScheme = () => {
    setEditingScheme(null);
    setSchemeDrawerOpen(true);
  };

  const handleOpenEditScheme = (scheme: Scheme) => {
    setEditingScheme(scheme);
    setSchemeDrawerOpen(true);
  };

  const handleSaveScheme = (values: CreateSchemeInput) => {
    if (editingScheme) {
      updateScheme.mutate(
        { id: editingScheme.id, input: values },
        {
          onSuccess: () => {
            message.success(`Scheme "${values.title}" updated`);
            setSchemeDrawerOpen(false);
          },
          onError: (error) => message.error(apiErrorMessage(error)),
        },
      );
    } else {
      createScheme.mutate(values, {
        onSuccess: () => {
          message.success(`Scheme "${values.title}" published`);
          setSchemeDrawerOpen(false);
        },
        onError: (error) => message.error(apiErrorMessage(error)),
      });
    }
  };

  const handleToggleSchemeActive = (scheme: Scheme, isActive: boolean) => {
    setSchemeActive.mutate(
      { id: scheme.id, isActive },
      {
        onSuccess: () => message.success('Scheme live status updated'),
        onError: (error) => message.error(apiErrorMessage(error)),
      },
    );
  };

  const handleDeleteScheme = (id: string) => {
    deleteScheme.mutate(id, {
      onSuccess: () => message.success('Scheme removed'),
      onError: (error) => message.error(apiErrorMessage(error)),
    });
  };

  // Coupon Handlers
  const handleOpenAddCoupon = () => {
    setEditingCoupon(null);
    setCouponDrawerOpen(true);
  };

  const handleOpenEditCoupon = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setCouponDrawerOpen(true);
  };

  const handleSaveCoupon = (values: CreateCouponInput) => {
    if (editingCoupon) {
      updateCoupon.mutate(
        { id: editingCoupon.id, input: values },
        {
          onSuccess: () => {
            message.success(`Coupon "${values.code}" updated`);
            setCouponDrawerOpen(false);
          },
          onError: (error) => message.error(apiErrorMessage(error)),
        },
      );
    } else {
      createCoupon.mutate(values, {
        onSuccess: () => {
          message.success(`Coupon "${values.code}" created for cart checkout`);
          setCouponDrawerOpen(false);
        },
        onError: (error) => message.error(apiErrorMessage(error)),
      });
    }
  };

  const handleToggleCouponActive = (coupon: Coupon, isActive: boolean) => {
    setCouponActive.mutate(
      { id: coupon.id, isActive },
      {
        onSuccess: () => message.success(`Coupon ${coupon.code} status updated`),
        onError: (error) => message.error(apiErrorMessage(error)),
      },
    );
  };

  const handleDeleteCoupon = (id: string) => {
    deleteCoupon.mutate(id, {
      onSuccess: () => message.success('Coupon deleted'),
      onError: (error) => message.error(apiErrorMessage(error)),
    });
  };

  const copyCouponCode = (code: string) => {
    navigator.clipboard.writeText(code);
    message.success(`Copied "${code}" to clipboard!`);
  };

  // Scheme Table Columns
  const schemeColumns: ColumnsType<Scheme> = [
    {
      title: 'Scheme',
      key: 'title',
      width: 300,
      render: (_, record) => (
        <Space align="start" size={12}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: record.backgroundColor,
              border: '1px solid rgba(0,0,0,0.06)',
              flexShrink: 0,
            }}
          />
          <Space direction="vertical" size={0}>
            <Tag
              color="default"
              style={{
                fontSize: 9,
                padding: '0 4px',
                lineHeight: '16px',
                background: record.badgeColor,
                color: record.badgeTextColor,
                border: 'none',
              }}
            >
              {record.tag}
            </Tag>
            <Text strong style={{ fontSize: 13 }} type={record.isActive ? undefined : 'secondary'}>
              {record.title}
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {record.subtitle}
            </Text>
          </Space>
        </Space>
      ),
    },
    {
      title: 'CTA Button',
      key: 'cta',
      width: 160,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ fontSize: 12 }}>
            {record.ctaText}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {record.ctaLink}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Target Audience',
      key: 'target',
      width: 130,
      render: (_, record) => (
        <Tag color={record.targetAudience === 'ALL' ? 'blue' : record.targetAudience === 'B2C' ? 'purple' : 'cyan'}>
          {record.targetAudience === 'ALL' ? 'All Channels' : record.targetAudience === 'B2C' ? 'B2C Shoppers' : 'B2B Accounts'}
        </Tag>
      ),
    },
    {
      title: 'Order',
      dataIndex: 'displayOrder',
      key: 'displayOrder',
      width: 70,
      render: (order: number) => <Tag style={{ fontSize: 11 }}>#{order}</Tag>,
    },
    {
      title: 'Live Status',
      key: 'isActive',
      width: 100,
      render: (_, record) => (
        <Switch
          checked={record.isActive}
          onChange={(checked) => handleToggleSchemeActive(record, checked)}
          checkedChildren="Live"
          unCheckedChildren="Hidden"
          size="small"
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 110,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Can do="SCHEME_MANAGE">
            <Tooltip title="Edit Scheme">
              <Button size="small" icon={<EditOutlined />} onClick={() => handleOpenEditScheme(record)} />
            </Tooltip>
          </Can>
          <Can do="SCHEME_DELETE">
            <Popconfirm
              title="Delete Scheme"
              description="Remove this scheme tile?"
              onConfirm={() => handleDeleteScheme(record.id)}
              okText="Delete"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="Delete">
                <Button danger size="small" icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          </Can>
        </Space>
      ),
    },
  ];

  // Coupon Table Columns
  const couponColumns: ColumnsType<Coupon> = [
    {
      title: 'Coupon Code',
      key: 'code',
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Space>
            <Tag
              color="orange"
              style={{
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: 0.5,
                padding: '2px 8px',
                borderRadius: 6,
              }}
            >
              {record.code}
            </Tag>
            <Tooltip title="Copy Code">
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined style={{ color: '#f97316' }} />}
                onClick={() => copyCouponCode(record.code)}
              />
            </Tooltip>
          </Space>
          <Text strong style={{ fontSize: 12 }}>
            {record.title}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Offer Description',
      dataIndex: 'description',
      key: 'description',
      render: (desc: string) => (
        <Text style={{ fontSize: 12, color: '#4b5563' }}>
          {desc}
        </Text>
      ),
    },
    {
      title: 'Discount Value',
      key: 'discount',
      width: 160,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Tag color="green" style={{ fontWeight: 600, fontSize: 12 }}>
            {record.discountType === 'FIXED' ? `₹${record.discountValue} FLAT OFF` : `${record.discountValue}% OFF`}
          </Tag>
          {record.discountType === 'PERCENTAGE' && record.maxDiscount ? (
            <Text type="secondary" style={{ fontSize: 11 }}>
              Max ₹{record.maxDiscount}
            </Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: 'Min Cart Value',
      dataIndex: 'minOrderValue',
      key: 'minOrderValue',
      width: 130,
      render: (val: number) => (
        <Text style={{ fontSize: 12, fontWeight: 500 }}>
          {val > 0 ? `₹${val}` : 'No Min'}
        </Text>
      ),
    },
    {
      title: 'Audience',
      dataIndex: 'targetAudience',
      key: 'targetAudience',
      width: 120,
      render: (audience: string) => (
        <Tag color={audience === 'ALL' ? 'blue' : audience === 'B2C' ? 'purple' : 'cyan'} style={{ fontSize: 11 }}>
          {audience === 'ALL' ? 'All Channels' : audience === 'B2C' ? 'B2C Only' : 'B2B Wholesale'}
        </Tag>
      ),
    },
    {
      title: 'Usage',
      key: 'usage',
      width: 110,
      render: (_, record) => (
        <Text style={{ fontSize: 12 }}>
          {record.usedCount} {record.usageLimit ? `/ ${record.usageLimit}` : 'times'}
        </Text>
      ),
    },
    {
      title: 'Expiry',
      dataIndex: 'expiryDate',
      key: 'expiryDate',
      width: 110,
      render: (date?: string) => (
        <Text type="secondary" style={{ fontSize: 11 }}>
          {date ? dayjs(date).format('DD MMM YYYY') : 'No Expiry'}
        </Text>
      ),
    },
    {
      title: 'Status',
      key: 'isActive',
      width: 90,
      render: (_, record) => (
        <Switch
          checked={record.isActive}
          onChange={(checked) => handleToggleCouponActive(record, checked)}
          checkedChildren="Live"
          unCheckedChildren="Off"
          size="small"
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 90,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="Edit Coupon">
            <Button size="small" icon={<EditOutlined />} onClick={() => handleOpenEditCoupon(record)} />
          </Tooltip>
          <Popconfirm
            title="Delete Coupon"
            description={`Delete coupon code "${record.code}"?`}
            onConfirm={() => handleDeleteCoupon(record.id)}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Delete">
              <Button danger size="small" icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <PageHeader
        title="Promotions & Cart Offers Console"
        subtitle="Manage storefront promotional scheme tiles, and create cart coupons & promo discount codes for customer checkout."
        actions={
          activeTab === 'schemes' ? (
            <Can do="SCHEME_CREATE">
              <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenAddScheme}>
                Add Homepage Scheme
              </Button>
            </Can>
          ) : (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenAddCoupon} style={{ background: '#f97316', borderColor: '#f97316' }}>
              Create Customer Coupon
            </Button>
          )
        }
      />

      <div style={{ background: '#fff', padding: '10px 16px', borderRadius: 8, border: '1px solid #f0f0f0' }}>
        <Segmented
          value={activeTab}
          onChange={(val) => setActiveTab(val as 'schemes' | 'coupons')}
          size="large"
          options={[
            {
              label: (
                <Space style={{ padding: '0 8px' }}>
                  <FireFilled style={{ color: '#f97316' }} />
                  <span style={{ fontWeight: 600 }}>Homepage Schemes ({schemes.length})</span>
                </Space>
              ),
              value: 'schemes',
            },
            {
              label: (
                <Space style={{ padding: '0 8px' }}>
                  <GiftOutlined style={{ color: '#059669' }} />
                  <span style={{ fontWeight: 600 }}>Cart Coupons &amp; Promo Codes ({coupons.length})</span>
                </Space>
              ),
              value: 'coupons',
            },
          ]}
        />
      </div>

      {activeTab === 'schemes' ? (
        <>
          <Row gutter={[12, 12]}>
            <Col xs={24} sm={8}>
              <Card size="small" style={{ borderRadius: 8 }}>
                <Statistic
                  title="Total Schemes"
                  value={schemes.length}
                  prefix={<TagsOutlined style={{ color: '#1677ff', fontSize: 16 }} />}
                  valueStyle={{ fontSize: 20 }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card size="small" style={{ borderRadius: 8 }}>
                <Statistic
                  title="Live on Homepage"
                  value={activeSchemes.length}
                  prefix={<RocketOutlined style={{ color: '#52c41a', fontSize: 16 }} />}
                  valueStyle={{ color: '#52c41a', fontSize: 20 }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card size="small" style={{ borderRadius: 8 }}>
                <Statistic
                  title="Section Visibility"
                  value={activeSchemes.length > 0 ? 'Visible' : 'Hidden'}
                  prefix={<EyeOutlined style={{ color: activeSchemes.length > 0 ? '#52c41a' : '#ef4444', fontSize: 16 }} />}
                  valueStyle={{ color: activeSchemes.length > 0 ? '#52c41a' : '#ef4444', fontSize: 18 }}
                />
              </Card>
            </Col>
          </Row>

          <Card
            size="small"
            title={
              <Space>
                <FireFilled style={{ color: '#f97316' }} />
                <span>Storefront Live Preview</span>
              </Space>
            }
            style={{ borderRadius: 8 }}
          >
            {activeSchemes.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(activeSchemes.length, 3)}, 1fr)`, gap: 16 }}>
                {activeSchemes.slice(0, 3).map((scheme) => (
                  <div
                    key={scheme.id}
                    style={{
                      borderRadius: 14,
                      padding: '18px 16px',
                      background: scheme.backgroundColor,
                      color: scheme.textColor,
                    }}
                  >
                    <Tag
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        padding: '2px 6px',
                        background: scheme.badgeColor,
                        color: scheme.badgeTextColor,
                        border: 'none',
                        textTransform: 'uppercase',
                      }}
                    >
                      {scheme.tag}
                    </Tag>
                    <Title level={5} style={{ color: scheme.textColor, margin: '8px 0 2px' }}>
                      {scheme.title}
                    </Title>
                    <Text style={{ color: scheme.textColor, fontSize: 12 }}>{scheme.subtitle}</Text>
                    <div style={{ marginTop: 12 }}>
                      <Button
                        block
                        style={{ background: scheme.buttonColor, color: scheme.buttonTextColor, border: 'none', fontWeight: 700 }}
                      >
                        {scheme.ctaText}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Alert
                type="warning"
                message="Section hidden on the homepage"
                description="No live schemes are published. The customer app's 'Today's Schemes & Offers' section will not render at all until at least one is made Live."
              />
            )}
          </Card>

          <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 8 }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Text strong style={{ fontSize: 14 }}>
                All Schemes ({schemes.length})
              </Text>
              <Table<Scheme>
                columns={schemeColumns}
                dataSource={schemes}
                rowKey="id"
                pagination={false}
                size="small"
                loading={schemesLoading}
              />
            </Space>
          </Card>
        </>
      ) : (
        <>
          <Row gutter={[12, 12]}>
            <Col xs={24} sm={6}>
              <Card size="small" style={{ borderRadius: 8 }}>
                <Statistic
                  title="Total Coupons"
                  value={coupons.length}
                  prefix={<GiftOutlined style={{ color: '#f97316', fontSize: 16 }} />}
                  valueStyle={{ fontSize: 20 }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={6}>
              <Card size="small" style={{ borderRadius: 8 }}>
                <Statistic
                  title="Active for Cart"
                  value={activeCoupons.length}
                  prefix={<RocketOutlined style={{ color: '#059669', fontSize: 16 }} />}
                  valueStyle={{ color: '#059669', fontSize: 20 }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={6}>
              <Card size="small" style={{ borderRadius: 8 }}>
                <Statistic
                  title="Redemptions"
                  value={coupons.reduce((sum, c) => sum + (c.usedCount || 0), 0)}
                  prefix={<ThunderboltOutlined style={{ color: '#8b5cf6', fontSize: 16 }} />}
                  valueStyle={{ color: '#8b5cf6', fontSize: 20 }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={6}>
              <Card size="small" style={{ borderRadius: 8 }}>
                <Statistic
                  title="Featured Coupon"
                  value={activeCoupons[0]?.code || 'None'}
                  prefix={<PercentageOutlined style={{ color: '#f59e0b', fontSize: 16 }} />}
                  valueStyle={{ color: '#f59e0b', fontSize: 18, fontWeight: 700 }}
                />
              </Card>
            </Col>
          </Row>

          <Alert
            type="info"
            showIcon
            message="Customer Cart Integration Live"
            description="Active coupons created here can be applied directly by customers in the checkout cart to get instant flat or percentage discounts."
          />

          <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 8 }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text strong style={{ fontSize: 14 }}>
                  Cart Coupons &amp; Promo Codes ({coupons.length})
                </Text>
                <Button icon={<ReloadOutlined />} size="small" onClick={() => window.location.reload()}>
                  Refresh
                </Button>
              </div>
              <Table<Coupon>
                columns={couponColumns}
                dataSource={coupons}
                rowKey="id"
                pagination={false}
                size="small"
                loading={couponsLoading}
              />
            </Space>
          </Card>
        </>
      )}

      {/* Scheme Form Drawer */}
      <SchemeFormDrawer
        open={schemeDrawerOpen}
        scheme={editingScheme}
        saving={createScheme.isPending || updateScheme.isPending}
        onClose={() => setSchemeDrawerOpen(false)}
        onSave={handleSaveScheme}
      />

      {/* Coupon Form Drawer */}
      <CouponFormDrawer
        open={couponDrawerOpen}
        coupon={editingCoupon}
        saving={createCoupon.isPending || updateCoupon.isPending}
        onClose={() => setCouponDrawerOpen(false)}
        onSave={handleSaveCoupon}
      />
    </Space>
  );
}
