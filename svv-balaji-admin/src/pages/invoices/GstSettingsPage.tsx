import { Alert, App as AntApp, Button, Card, Col, Form, Input, InputNumber, Row, Skeleton, Switch, Tag, Typography } from 'antd';
import { useEffect } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { UpdateGstSettingsInput } from '@shared/api/invoices';
import { useCan } from '@shared/auth/useCan';
import { PageHeader } from '@shared/components/PageHeader';
import { useGstSettings, useUpdateGstSettings } from '@shared/hooks/useInvoices';
import { formatDateTime } from '@shared/utils/format';

const { Text } = Typography;
const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

/**
 * Super Admin: the seller as printed on every GST invoice, invoice numbering,
 * and the e-invoicing switch. Invoices snapshot these when issued, so a change
 * here never restates an invoice that is already out.
 */
export function GstSettingsPage() {
  const { message } = AntApp.useApp();
  const canManage = useCan('GST_SETTINGS_MANAGE');
  const q = useGstSettings();
  const update = useUpdateGstSettings();
  const [form] = Form.useForm<UpdateGstSettingsInput>();
  const s = q.data;

  useEffect(() => {
    if (s) form.setFieldsValue(s);
  }, [s, form]);

  const save = async () => {
    const values = await form.validateFields();
    const body = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, blankToNull(v)])) as UpdateGstSettingsInput;
    // Required-when-present fields are never sent as null: the API would refuse them.
    const required = ['legalName', 'gstin', 'addressLine1', 'city', 'pincode', 'invoicePrefix', 'deliveryFeeSac', 'deliveryFeeGstRatePercent', 'eInvoiceEnabled'] as const;
    for (const k of required) if (body[k] === null || body[k] === undefined) delete body[k];
    try {
      const next = await update.mutateAsync(body);
      message.success(next.ready ? 'GST settings saved' : `Saved. Still missing: ${next.missing.join(', ')}`);
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not save'), 8);
    }
  };

  return (
    <Card>
      <PageHeader
        title="GST Settings"
        subtitle="How the company appears on every tax invoice. Invoices are issued automatically at dispatch once these details are complete."
        actions={canManage ? <Button type="primary" loading={update.isPending} onClick={() => void save()}>Save</Button> : null}
      />
      {q.isLoading || !s ? <Skeleton active paragraph={{ rows: 10 }} /> : (
        <div style={{ maxWidth: 860 }}>
          {s.ready ? (
            <Alert
              style={{ marginBottom: 20 }}
              type="success"
              showIcon
              message={`Invoicing is on${s.invoicingStartsAt ? ` — every order dispatched since ${formatDateTime(s.invoicingStartsAt)} is invoiced automatically` : ''}`}
              description={`Seller state: ${s.stateName} (${s.stateCode}). Deliveries in this state get CGST + SGST; everywhere else IGST.`}
            />
          ) : (
            <Alert style={{ marginBottom: 20 }} type="warning" showIcon message="No invoices are being issued yet" description={`Missing: ${s.missing.join(', ')}.`} />
          )}

          <Form form={form} layout="vertical" disabled={!canManage}>
            <Typography.Title level={5}>1. Seller (printed on the invoice)</Typography.Title>
            <Row gutter={[24, 0]}>
              <Col xs={24} md={12}>
                <Form.Item name="legalName" label="Legal name (as on GST registration)" rules={[{ max: 100 }]}>
                  <Input placeholder="SVV Balaji Food & Beverages Pvt. Ltd." />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="tradeName" label="Trade name (optional)" rules={[{ max: 100 }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="gstin"
                  label="GSTIN"
                  normalize={(v: string) => v?.toUpperCase().replace(/\s/g, '')}
                  rules={[{ pattern: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, message: '15 characters, e.g. 27AAAAA0000A1Z5' }]}
                  extra="Checked for its state code and check digit when saved. Its first two digits decide CGST+SGST vs IGST."
                >
                  <Input maxLength={15} style={{ fontFamily: 'monospace' }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="State (from GSTIN)">
                  <Input disabled value={s.stateName ? `${s.stateName} (${s.stateCode})` : '—'} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}><Form.Item name="addressLine1" label="Address line 1" rules={[{ max: 100 }]}><Input /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="addressLine2" label="Address line 2" rules={[{ max: 100 }]}><Input /></Form.Item></Col>
              <Col xs={12} md={8}><Form.Item name="city" label="City" rules={[{ max: 50 }]}><Input /></Form.Item></Col>
              <Col xs={12} md={8}><Form.Item name="pincode" label="Pincode" rules={[{ pattern: /^\d{6}$/, message: '6 digits' }]}><Input maxLength={6} /></Form.Item></Col>
              <Col xs={24} md={8}><Form.Item name="phone" label="Phone" rules={[{ max: 20 }]}><Input /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="email" label="Email" rules={[{ type: 'email' }]}><Input /></Form.Item></Col>
            </Row>

            <Typography.Title level={5} style={{ marginTop: 8 }}>2. Numbering</Typography.Title>
            <Row gutter={[24, 0]}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="invoicePrefix"
                  label="Invoice prefix"
                  normalize={(v: string) => v?.toUpperCase()}
                  rules={[{ required: true, pattern: /^[A-Z0-9]{1,4}$/, message: '1-4 capital letters or digits' }]}
                  extra={<>Numbers read <Text code>{`${form.getFieldValue('invoicePrefix') || s.invoicePrefix}/2627-000001`}</Text> and restart every April (GST Rule 46: at most 16 characters, unique per financial year).</>}
                >
                  <Input maxLength={4} style={{ width: 120 }} />
                </Form.Item>
              </Col>
            </Row>

            <Typography.Title level={5} style={{ marginTop: 8 }}>3. Delivery charges on the invoice</Typography.Title>
            <Row gutter={[24, 0]}>
              <Col xs={12} md={6}>
                <Form.Item name="deliveryFeeSac" label="SAC code" rules={[{ pattern: /^\d{4,8}$/, message: '4-8 digits' }]}><Input maxLength={8} /></Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item name="deliveryFeeGstRatePercent" label="GST rate on delivery (%)"><InputNumber min={0} max={28} step={1} style={{ width: '100%' }} /></Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Text type="secondary" style={{ display: 'block', marginTop: 30, fontSize: 12 }}>
                  The fee is charged GST-inclusive at checkout, so the customer's total never changes — this only splits it into taxable value and GST on the invoice. <b>Confirm the rate with the company's CA</b>: a delivery bundled with goods may instead take the goods' rate.
                </Text>
              </Col>
            </Row>

            <Typography.Title level={5} style={{ marginTop: 8 }}>4. E-invoicing (IRN)</Typography.Title>
            <Row gutter={[24, 0]} align="middle">
              <Col xs={24} md={12}>
                <Form.Item name="eInvoiceEnabled" label="Generate IRNs for B2B invoices" valuePropName="checked">
                  <Switch />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  GSP connection: {s.gspProvider === 'mock' ? <Tag color="orange">Test mode (mock)</Tag> : <Tag>Not configured</Tag>}
                  <br />Turn on only once the company is notified for e-invoicing and the GSP vendor and credentials are in place (action A-11). B2C invoices never need an IRN.
                </Text>
              </Col>
            </Row>

            <Form.Item name="footerNote" label="Footer note (optional)" rules={[{ max: 1000 }]}>
              <Input.TextArea rows={2} placeholder="e.g. Subject to Nagpur jurisdiction. FSSAI Lic. No. …" />
            </Form.Item>
          </Form>
        </div>
      )}
    </Card>
  );
}
