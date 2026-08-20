import { useState } from 'react';
import { CheckCircleOutlined, SafetyCertificateOutlined, UserOutlined, WarningOutlined } from '@ant-design/icons';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  Modal,
  Row,
  Steps,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { App as AntApp } from 'antd';
import { authApi } from '@shared/api/auth';
import { useAuth } from '../../auth/useAuth';
import { ROLE_LABELS } from '@shared/auth/types';

export function ProfilePage() {
  const { user, reload } = useAuth();
  const { message } = AntApp.useApp();

  const [activeTab, setActiveTab] = useState('1');

  // Forms
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();

  // Loaders
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // 2FA Setup State
  const [setupModalVisible, setSetupModalVisible] = useState(false);
  const [setupStep, setSetupStep] = useState(0);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [enablingTwoFactor, setEnablingTwoFactor] = useState(false);

  // 2FA Disable State
  const [disableModalVisible, setDisableModalVisible] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disablingTwoFactor, setDisablingTwoFactor] = useState(false);

  if (!user) return null;

  const onUpdateProfile = async (values: any) => {
    setUpdatingProfile(true);
    try {
      await authApi.updateProfile({
        fullName: values.fullName,
        email: values.email,
        phone: values.phone || null,
      });
      message.success('Profile updated successfully');
      await reload();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setUpdatingProfile(false);
    }
  };

  const onChangePassword = async (values: any) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('Passwords do not match');
      return;
    }
    setUpdatingPassword(true);
    try {
      await authApi.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      message.success('Password updated successfully. Other sessions have been signed out.');
      passwordForm.resetFields();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Failed to change password');
    } finally {
      setUpdatingPassword(false);
    }
  };

  const startTwoFactorSetup = async () => {
    try {
      const res = await authApi.generateTwoFactor();
      setSecret(res.secret);
      setQrCodeUrl(res.qrCodeDataUrl);
      setSetupStep(0);
      setRecoveryCodes(null);
      setTwoFactorCode('');
      setSetupModalVisible(true);
    } catch (err: any) {
      message.error('Failed to initiate 2FA setup');
    }
  };

  const confirmTwoFactorSetup = async () => {
    if (!twoFactorCode || twoFactorCode.length !== 6) {
      message.error('Please enter a valid 6-digit code');
      return;
    }
    setEnablingTwoFactor(true);
    try {
      const res = await authApi.enableTwoFactor(twoFactorCode);
      setRecoveryCodes(res.recoveryCodes);
      setSetupStep(1); // Show recovery codes
      await reload();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Invalid verification code');
    } finally {
      setEnablingTwoFactor(false);
    }
  };

  const disableTwoFactor = async () => {
    if (!disablePassword) {
      message.error('Please enter your password');
      return;
    }
    setDisablingTwoFactor(true);
    try {
      await authApi.disableTwoFactor(disablePassword);
      message.success('Two-Factor Authentication disabled');
      setDisableModalVisible(false);
      setDisablePassword('');
      await reload();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Failed to disable 2FA');
    } finally {
      setDisablingTwoFactor(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('Copied to clipboard');
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', paddingTop: 24 }}>
      <Typography.Title level={3}>Profile & Security</Typography.Title>
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={24} align="middle">
          <Col>
            <Avatar size={80} icon={<UserOutlined />} />
          </Col>
          <Col flex="auto">
            <Typography.Title level={4} style={{ margin: 0 }}>
              {user.fullName}
            </Typography.Title>
            <Typography.Text type="secondary">{user.email}</Typography.Text>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Tag color="blue">{ROLE_LABELS[user.role]}</Tag>
              {user.branch ? <Tag>{user.branch.name}</Tag> : null}
              <Tag color={user.status === 'ACTIVE' ? 'green' : 'red'}>{user.status}</Tag>
              {user.isTwoFactorEnabled ? (
                <Tag icon={<CheckCircleOutlined />} color="success">
                  2FA Enabled
                </Tag>
              ) : (
                <Tag icon={<WarningOutlined />} color="warning">
                  2FA Disabled
                </Tag>
              )}
            </div>
          </Col>
        </Row>
      </Card>

      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <Tabs.TabPane tab="Personal Details" key="1">
            <Form
              form={profileForm}
              layout="vertical"
              initialValues={{
                fullName: user.fullName,
                email: user.email,
                phone: user.phone,
              }}
              onFinish={onUpdateProfile}
              style={{ maxWidth: 500 }}
            >
              <Form.Item label="Full Name" name="fullName" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item label="Email Address" name="email" rules={[{ required: true, type: 'email' }]}>
                <Input />
              </Form.Item>
              <Form.Item label="Phone Number" name="phone">
                <Input />
              </Form.Item>
              <Alert
                type="info"
                showIcon
                message="Updating your email will change the address you use to sign in."
                style={{ marginBottom: 16 }}
              />
              <Button type="primary" htmlType="submit" loading={updatingProfile}>
                Save Profile
              </Button>
            </Form>
          </Tabs.TabPane>

          <Tabs.TabPane tab="Password" key="2">
            <Form
              form={passwordForm}
              layout="vertical"
              onFinish={onChangePassword}
              style={{ maxWidth: 500 }}
            >
              <Form.Item
                label="Current Password"
                name="currentPassword"
                rules={[{ required: true }]}
              >
                <Input.Password />
              </Form.Item>
              <Form.Item
                label="New Password"
                name="newPassword"
                rules={[{ required: true, min: 8 }]}
                extra="Must be at least 8 characters long."
              >
                <Input.Password />
              </Form.Item>
              <Form.Item
                label="Confirm New Password"
                name="confirmPassword"
                rules={[{ required: true }]}
              >
                <Input.Password />
              </Form.Item>
              <Alert
                type="warning"
                showIcon
                message="Changing your password will immediately sign out all other active sessions on all devices."
                style={{ marginBottom: 16 }}
              />
              <Button type="primary" htmlType="submit" loading={updatingPassword}>
                Update Password
              </Button>
            </Form>
          </Tabs.TabPane>

          <Tabs.TabPane tab="Two-Factor Authentication" key="3">
            <div style={{ maxWidth: 600 }}>
              <Typography.Paragraph>
                Two-Factor Authentication (2FA) adds an extra layer of security to your account.
                Once enabled, you will be required to enter a 6-digit code from your authenticator
                app (like Google Authenticator or Apple Passwords) when signing in.
              </Typography.Paragraph>
              
              {user.isTwoFactorEnabled ? (
                <Alert
                  type="success"
                  showIcon
                  icon={<CheckCircleOutlined />}
                  message="Two-Factor Authentication is currently active."
                  action={
                    <Button danger onClick={() => setDisableModalVisible(true)}>
                      Disable 2FA
                    </Button>
                  }
                />
              ) : (
                <Alert
                  type="warning"
                  showIcon
                  icon={<SafetyCertificateOutlined />}
                  message="Two-Factor Authentication is not enabled."
                  action={
                    <Button type="primary" onClick={startTwoFactorSetup}>
                      Set up 2FA
                    </Button>
                  }
                />
              )}
            </div>
          </Tabs.TabPane>
        </Tabs>
      </Card>

      {/* 2FA Setup Modal */}
      <Modal
        title="Set up Two-Factor Authentication"
        open={setupModalVisible}
        onCancel={() => {
          if (setupStep === 1) {
            setSetupModalVisible(false); // Can close safely if on recovery step
          } else {
            setSetupModalVisible(false); // User aborted setup
          }
        }}
        footer={null}
        width={600}
      >
        <Steps
          current={setupStep}
          items={[
            { title: 'Authenticator App' },
            { title: 'Recovery Codes' },
          ]}
          style={{ marginBottom: 24 }}
        />

        {setupStep === 0 && (
          <div>
            <Typography.Paragraph>
              1. Scan this QR code with your authenticator app.
            </Typography.Paragraph>
            <div style={{ textAlign: 'center', margin: '24px 0' }}>
              {qrCodeUrl ? <img src={qrCodeUrl} alt="QR Code" style={{ border: '1px solid #eee', borderRadius: 8 }} /> : null}
            </div>
            <Typography.Paragraph>
              Or enter this code manually: 
              <Typography.Text code copyable style={{ marginLeft: 8 }}>{secret}</Typography.Text>
            </Typography.Paragraph>
            <Divider />
            <Typography.Paragraph>
              2. Enter the 6-digit code generated by the app.
            </Typography.Paragraph>
            <div style={{ display: 'flex', gap: 12 }}>
              <Input
                placeholder="000000"
                maxLength={6}
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
                style={{ width: 120, fontSize: 18, letterSpacing: 4, textAlign: 'center' }}
              />
              <Button type="primary" onClick={confirmTwoFactorSetup} loading={enablingTwoFactor}>
                Verify & Activate
              </Button>
            </div>
          </div>
        )}

        {setupStep === 1 && (
          <div>
            <Alert
              type="success"
              showIcon
              message="Two-Factor Authentication is now enabled!"
              style={{ marginBottom: 24 }}
            />
            <Typography.Title level={5}>Save your recovery codes</Typography.Title>
            <Typography.Paragraph>
              These codes can be used to access your account if you lose your device. 
              <strong> Keep them safe. They will only be shown once.</strong> Each code can be used exactly once.
            </Typography.Paragraph>
            <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, fontFamily: 'monospace', fontSize: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {recoveryCodes?.map((code, idx) => (
                <div key={idx}>{code}</div>
              ))}
            </div>
            <div style={{ marginTop: 24, textAlign: 'right' }}>
              <Button
                onClick={() => copyToClipboard(recoveryCodes?.join('\n') || '')}
                style={{ marginRight: 12 }}
              >
                Copy to Clipboard
              </Button>
              <Button type="primary" onClick={() => setSetupModalVisible(false)}>
                I have saved these codes
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 2FA Disable Modal */}
      <Modal
        title="Disable Two-Factor Authentication"
        open={disableModalVisible}
        onCancel={() => setDisableModalVisible(false)}
        footer={null}
      >
        <Typography.Paragraph>
          Are you sure you want to disable Two-Factor Authentication? Your account will be less secure.
          Please enter your current password to confirm.
        </Typography.Paragraph>
        <Input.Password
          placeholder="Current password"
          value={disablePassword}
          onChange={(e) => setDisablePassword(e.target.value)}
          style={{ marginBottom: 16 }}
        />
        <div style={{ textAlign: 'right' }}>
          <Button onClick={() => setDisableModalVisible(false)} style={{ marginRight: 12 }}>
            Cancel
          </Button>
          <Button danger onClick={disableTwoFactor} loading={disablingTwoFactor}>
            Disable 2FA
          </Button>
        </div>
      </Modal>
    </div>
  );
}
