import {
  BookOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
  ShopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  App as AntApp,
  Badge,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  Row,
  Skeleton,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { api, apiErrorMessage } from '@shared/api/client';
import { PageHeader } from '@shared/components/PageHeader';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

type AudienceKey = 'RIDER' | 'RETAILER' | 'CUSTOMER';
type PolicyTypeKey = 'PRIVACY_POLICY' | 'TERMS_AND_CONDITIONS';

interface LegalPolicy {
  id: string;
  audience: AudienceKey;
  type: PolicyTypeKey;
  title: string;
  content: string;
  version: string;
  isActive: boolean;
  updatedAt: string;
}

export function LegalPoliciesPage() {
  const { message } = AntApp.useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [policies, setPolicies] = useState<LegalPolicy[]>([]);
  const [selectedAudience, setSelectedAudience] = useState<AudienceKey>('RIDER');
  const [selectedType, setSelectedType] = useState<PolicyTypeKey>('PRIVACY_POLICY');
  const [previewMode, setPreviewMode] = useState(false);

  const [form] = Form.useForm();

  const fetchPolicies = async () => {
    setLoading(true);
    try {
      const res = await api.get<LegalPolicy[]>('/legal-policies');
      setPolicies(res.data);
    } catch (err) {
      message.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, []);

  const currentPolicy = policies.find(
    (p) => p.audience === selectedAudience && p.type === selectedType,
  );

  useEffect(() => {
    if (currentPolicy) {
      form.setFieldsValue({
        title: currentPolicy.title,
        version: currentPolicy.version ?? '1.0',
        isActive: currentPolicy.isActive ?? true,
        content: currentPolicy.content,
      });
    } else {
      form.setFieldsValue({
        title: '',
        version: '1.0',
        isActive: true,
        content: '',
      });
    }
  }, [currentPolicy, selectedAudience, selectedType, form]);

  const handleSave = async (values: any) => {
    setSaving(true);
    try {
      const payload = {
        audience: selectedAudience,
        type: selectedType,
        title: values.title.trim(),
        version: values.version.trim() || '1.0',
        isActive: values.isActive,
        content: values.content,
      };
      const res = await api.put<LegalPolicy>('/legal-policies', payload);
      message.success(`${selectedAudience} ${selectedType === 'PRIVACY_POLICY' ? 'Privacy Policy' : 'Terms & Conditions'} saved successfully!`);
      
      // Update local state
      setPolicies((prev) => {
        const idx = prev.findIndex((p) => p.audience === selectedAudience && p.type === selectedType);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = res.data;
          return updated;
        }
        return [...prev, res.data];
      });
    } catch (err) {
      message.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const getAudienceLabel = (aud: AudienceKey) => {
    switch (aud) {
      case 'RIDER':
        return 'Delivery Partner (Rider)';
      case 'RETAILER':
        return 'Retailer & B2B Partner';
      case 'CUSTOMER':
        return 'Customer (D2C)';
    }
  };

  return (
    <div style={{ padding: '0 0 40px' }}>
      <PageHeader
        title="Terms & Privacy Policies"
        subtitle="Manage dynamic Terms & Conditions and Privacy Policies for Delivery Partners, Retailers, and Customers"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchPolicies} loading={loading}>
              Refresh
            </Button>
          </Space>
        }
      />

      <Card style={{ marginBottom: 24 }}>
        <Tabs
          activeKey={selectedAudience}
          onChange={(k) => setSelectedAudience(k as AudienceKey)}
          items={[
            {
              key: 'RIDER',
              label: (
                <span>
                  <UserOutlined /> Delivery Partner (Rider)
                </span>
              ),
            },
            {
              key: 'RETAILER',
              label: (
                <span>
                  <ShopOutlined /> Retailer & B2B
                </span>
              ),
            },
            {
              key: 'CUSTOMER',
              label: (
                <span>
                  <SafetyCertificateOutlined /> Customer (D2C)
                </span>
              ),
            },
          ]}
        />

        <div style={{ marginTop: 12 }}>
          <Tabs
            type="card"
            activeKey={selectedType}
            onChange={(k) => setSelectedType(k as PolicyTypeKey)}
            items={[
              {
                key: 'PRIVACY_POLICY',
                label: (
                  <span>
                    <FileTextOutlined /> Privacy Policy
                  </span>
                ),
              },
              {
                key: 'TERMS_AND_CONDITIONS',
                label: (
                  <span>
                    <BookOutlined /> Terms & Conditions
                  </span>
                ),
              },
            ]}
          />
        </div>

        {loading ? (
          <Skeleton active paragraph={{ rows: 10 }} />
        ) : (
          <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 20 }}>
            <Row gutter={16} align="middle">
              <Col xs={24} md={12}>
                <Form.Item
                  label="Document Title"
                  name="title"
                  rules={[{ required: true, message: 'Please enter document title' }]}
                >
                  <Input placeholder="e.g. SVV Balaji Delivery Partner Privacy Policy" size="large" />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item label="Version" name="version">
                  <Input placeholder="1.0" size="large" />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item label="Status" name="isActive" valuePropName="checked">
                  <Switch
                    checkedChildren="Active"
                    unCheckedChildren="Inactive"
                    style={{ marginTop: 4 }}
                  />
                </Form.Item>
              </Col>
            </Row>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong style={{ fontSize: 15 }}>
                Document Content (Markdown / Text)
              </Text>
              <Button
                type="dashed"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => setPreviewMode(!previewMode)}
              >
                {previewMode ? 'Edit Mode' : 'Preview Mode'}
              </Button>
            </div>

            {previewMode ? (
              <Card
                style={{
                  background: '#fafafa',
                  minHeight: 400,
                  maxHeight: 600,
                  overflowY: 'auto',
                  border: '1px solid #d9d9d9',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.6,
                }}
              >
                <Title level={4}>{form.getFieldValue('title')}</Title>
                <Paragraph>{form.getFieldValue('content')}</Paragraph>
              </Card>
            ) : (
              <Form.Item
                name="content"
                rules={[{ required: true, message: 'Please enter content' }]}
              >
                <TextArea
                  rows={16}
                  placeholder="Enter policy terms in markdown or formatted text..."
                  style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}
                />
              </Form.Item>
            )}

            <Divider style={{ margin: '16px 0' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <Tag color="orange">{getAudienceLabel(selectedAudience)}</Tag>
                <Tag color="blue">{selectedType === 'PRIVACY_POLICY' ? 'Privacy Policy' : 'Terms & Conditions'}</Tag>
                {currentPolicy?.updatedAt ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Last updated: {new Date(currentPolicy.updatedAt).toLocaleString()}
                  </Text>
                ) : null}
              </Space>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving} size="large">
                Save Policy
              </Button>
            </div>
          </Form>
        )}
      </Card>
    </div>
  );
}
