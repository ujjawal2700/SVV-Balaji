import { Button, Form, Input, Space, Typography } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { Placeholder } from './Placeholder';

/**
 * The QR destination — FRD 30.
 *
 * This is the screen the whole project is named after. A batch number printed on
 * a pack resolves to the production run, the recipe version, every quality
 * inspection it passed, and the farmers whose raw material went into it.
 *
 * It lives here, in the customer app, for one reason: the URL on the pack is
 * `svvbalaji.com/trace/FG-20260807-001`, and that is the one URL in this system
 * that cannot be changed later. Packaging is printed ahead of the software.
 *
 * -----------------------------------------------------------------------------
 * OPEN — audit finding M1.
 *
 * `GET /api/v1/trace/:fgBatchNumber` is currently behind the auth guard. A
 * customer in a shop has no account, so today the QR resolves to a login screen.
 * This page is half the fix; the other half is a public route on the server.
 *
 * When that route is opened, it must return the trace and nothing more. The
 * internal shape carries the farmer's phone number, bank details and the
 * supplier rate — a public endpoint returning the same object is a data leak
 * wearing a feature's clothes. A separate public projection, not a flag on the
 * existing one.
 * -----------------------------------------------------------------------------
 */
export function TracePage() {
  const { fgBatchNumber } = useParams<{ fgBatchNumber: string }>();
  const navigate = useNavigate();

  // No batch number in the URL: somebody arrived by typing the domain rather
  // than by scanning. Ask for the number printed on the pack.
  if (!fgBatchNumber) {
    return (
      <div className="store-container store-container--narrow">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div style={{ paddingTop: 16 }}>
            <Typography.Title level={2} style={{ marginBottom: 4 }}>
              Trace a pack
            </Typography.Title>
            <Typography.Text type="secondary">
              Enter the batch number printed on the pack, next to the QR code.
            </Typography.Text>
          </div>

          <Form
            layout="vertical"
            onFinish={({ batch }: { batch: string }) =>
              navigate(`/trace/${encodeURIComponent(batch.trim())}`)
            }
          >
            <Form.Item
              name="batch"
              label="Batch number"
              rules={[{ required: true, message: 'Enter the batch number from the pack' }]}
            >
              <Input placeholder="FG-20260807-001" autoCapitalize="characters" />
            </Form.Item>
            <Button type="primary" htmlType="submit" size="large">
              Trace this pack
            </Button>
          </Form>
        </Space>
      </div>
    );
  }

  return (
    <Placeholder
      frd="30"
      title="Pack history"
      summary={
        <>
          The full chain for batch <code>{fgBatchNumber}</code>: production run, recipe version,
          quality inspections passed, and the farms the raw material came from.
        </>
      }
      blockedBy={
        <>
          Audit finding <strong>M1</strong>. <code>GET /api/v1/trace/:fgBatchNumber</code> is behind
          the auth guard, so the QR already printed on packaging resolves to a login screen. It
          needs a public route returning a <em>public projection</em> — the internal response
          carries farmer phone numbers, bank details and supplier rates.
        </>
      }
    />
  );
}
