import { LockOutlined, LogoutOutlined, UserOutlined } from "@ant-design/icons";
import {
  App as AntApp,
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  Row,
  Tag,
  Typography,
} from "antd";
import { useState } from "react";
import { authApi } from "@shared/api/auth";
import { ROLE_LABELS } from "@shared/auth/types";
import { useAuth } from "@shared/auth/useAuth";
import { useIsMobile } from "@shared/hooks/useIsMobile";
import { useSafeLogout } from "../offline/OfflineBar";
import { FieldPageHeader } from "./pieces";

const cardStyle = {
  borderRadius: 14,
  border: "1px solid #e2e8f0",
  boxShadow: "0 1px 3px 0 rgba(15, 23, 42, 0.04)",
};

/**
 * The signed-in expert's own account: who they are, their details, password,
 * and sign out.
 *
 * A sidebar entry on tablet and desktop; on a phone it is reached from More,
 * and the app bar carries its title and back arrow.
 */
export function FieldProfilePage() {
  const { user, reload } = useAuth();
  const isMobile = useIsMobile();
  const safeLogout = useSafeLogout();
  const { message } = AntApp.useApp();
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  if (!user) return null;

  const onUpdateProfile = async (values: {
    fullName: string;
    email: string;
    phone?: string;
  }) => {
    setSavingProfile(true);
    try {
      await authApi.updateProfile({
        fullName: values.fullName,
        email: values.email,
        phone: values.phone || null,
      });
      message.success("Profile updated");
      await reload();
    } catch (err: any) {
      message.error(
        err.response?.data?.message ||
          "Could not update profile. Check your connection.",
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const onChangePassword = async (values: {
    currentPassword: string;
    newPassword: string;
  }) => {
    setSavingPassword(true);
    try {
      await authApi.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      message.success("Password changed. Other sessions have been signed out.");
      passwordForm.resetFields();
    } catch (err: any) {
      message.error(
        err.response?.data?.message ||
          "Could not change password. Check your connection.",
      );
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: 960,
        margin: "0 auto",
        width: "100%",
        paddingBottom: 24,
      }}
    >
      {!isMobile ? (
        <div style={{ marginBottom: 16 }}>
          <FieldPageHeader
            title="My Profile"
            subtitle="Your account details, password and session"
          />
        </div>
      ) : null}

      <Row gutter={[16, isMobile ? 12 : 16]}>
        <Col xs={24} lg={9}>
          <Card
            style={cardStyle}
            styles={{ body: { padding: isMobile ? 16 : 20 } }}
          >
            {/* Side by side on a phone, stacked and centred on the wider card. */}
            <div
              style={
                isMobile
                  ? { display: "flex", alignItems: "center", gap: 14 }
                  : {
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 10,
                    }
              }
            >
              <Avatar
                size={isMobile ? 56 : 72}
                style={{
                  background:
                    "linear-gradient(135deg, #0f172a 0%, #334155 100%)",
                  fontWeight: 700,
                  fontSize: isMobile ? 22 : 28,
                  flexShrink: 0,
                }}
              >
                {user.fullName?.charAt(0).toUpperCase() || <UserOutlined />}
              </Avatar>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isMobile ? "flex-start" : "center",
                  gap: 6,
                  minWidth: 0,
                }}
              >
                <Typography.Text
                  strong
                  ellipsis
                  style={{ fontSize: 17, color: "#0f172a", maxWidth: "100%" }}
                >
                  {user.fullName}
                </Typography.Text>
                <Tag
                  color="blue"
                  style={{ margin: 0, borderRadius: 6, fontWeight: 600 }}
                >
                  {ROLE_LABELS[user.role]}
                </Tag>
              </div>
            </div>

            <Descriptions
              column={1}
              size="small"
              colon={false}
              labelStyle={{ color: "#64748b", width: 110 }}
              contentStyle={{ color: "#0f172a", fontWeight: 500 }}
              style={{
                marginTop: isMobile ? 16 : 20,
                borderTop: "1px solid #f1f5f9",
                paddingTop: 12,
              }}
              items={[
                { key: "email", label: "Email", children: user.email },
                { key: "phone", label: "Phone", children: user.phone || "—" },
                {
                  key: "branch",
                  label: "Branch",
                  children: user.branch?.name ?? "—",
                },
                {
                  key: "since",
                  label: "Member since",
                  children: new Date(user.createdAt).toLocaleDateString(
                    "en-IN",
                    {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    },
                  ),
                },
              ]}
            />

            {/* On a phone Sign out sits on More, one tap back. */}
            {!isMobile ? (
              <Button
                block
                icon={<LogoutOutlined />}
                onClick={() => safeLogout()}
                style={{
                  marginTop: 16,
                  height: 40,
                  borderRadius: 10,
                  fontWeight: 600,
                  color: "#dc2626",
                  background: "#fef2f2",
                  border: "1px solid #fee2e2",
                }}
              >
                Sign out
              </Button>
            ) : null}
          </Card>
        </Col>

        <Col xs={24} lg={15}>
          <Card
            title="Personal details"
            style={{ ...cardStyle, marginBottom: isMobile ? 12 : 16 }}
          >
            <Form
              form={profileForm}
              layout="vertical"
              initialValues={{
                fullName: user.fullName,
                email: user.email,
                phone: user.phone ?? "",
              }}
              onFinish={onUpdateProfile}
            >
              <Form.Item
                name="fullName"
                label="Full name"
                rules={[{ required: true, message: "Enter your name" }]}
              >
                <Input />
              </Form.Item>
              <Row gutter={12}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="email"
                    label="Email"
                    rules={[
                      {
                        required: true,
                        type: "email",
                        message: "Enter a valid email",
                      },
                    ]}
                  >
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="phone" label="Phone">
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
              <Button type="primary" htmlType="submit" loading={savingProfile}>
                Save changes
              </Button>
            </Form>
          </Card>

          <Card title="Change password" style={cardStyle}>
            <Form
              form={passwordForm}
              layout="vertical"
              onFinish={onChangePassword}
            >
              <Form.Item
                name="currentPassword"
                label="Current password"
                rules={[
                  { required: true, message: "Enter your current password" },
                ]}
              >
                <Input.Password prefix={<LockOutlined />} />
              </Form.Item>
              <Row gutter={12}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="newPassword"
                    label="New password"
                    rules={[
                      { required: true, message: "Enter a new password" },
                      { min: 8, message: "At least 8 characters" },
                    ]}
                  >
                    <Input.Password prefix={<LockOutlined />} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="confirmPassword"
                    label="Confirm new password"
                    dependencies={["newPassword"]}
                    rules={[
                      { required: true, message: "Confirm the new password" },
                      ({ getFieldValue }) => ({
                        validator: (_, value) =>
                          !value || getFieldValue("newPassword") === value
                            ? Promise.resolve()
                            : Promise.reject(
                                new Error("Passwords do not match"),
                              ),
                      }),
                    ]}
                  >
                    <Input.Password prefix={<LockOutlined />} />
                  </Form.Item>
                </Col>
              </Row>
              <Button type="primary" htmlType="submit" loading={savingPassword}>
                Update password
              </Button>
            </Form>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
