import { PrinterOutlined } from '@ant-design/icons';
import { Alert, App as AntApp, Button, Descriptions, Modal, Space, Spin, Typography } from 'antd';
import { useRef } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { FinishedGoodsBatch } from '../../api/types';
import { useProductLabel } from '../../hooks/usePackaging';
import { EM_DASH, formatDate } from '../../utils/format';

interface ProductLabelModalProps {
  batch: FinishedGoodsBatch | null;
  onClose: () => void;
}

/**
 * The pack label (FRD 22.2).
 *
 * QR and barcode are rendered server-side rather than here, deliberately: the
 * QR encodes a public traceability URL, and if the panel built that URL itself
 * the printed code and the server's idea of it could drift. Packaging is
 * printed once and cannot be reissued.
 */
export function ProductLabelModal({ batch, onClose }: ProductLabelModalProps) {
  const { message } = AntApp.useApp();
  const printRef = useRef<HTMLDivElement>(null);
  const label = useProductLabel(batch?.id);

  const handlePrint = () => {
    const markup = printRef.current?.innerHTML;
    if (!markup) return;

    const printWindow = window.open('', '_blank', 'width=720,height=640');
    if (!printWindow) {
      message.error('Your browser blocked the print window — allow pop-ups for this site');
      return;
    }

    printWindow.document.write(
      `<html><head><title>${batch?.fgBatchNumber ?? 'Label'}</title>` +
        '<style>body{font-family:sans-serif;padding:24px;max-width:520px}' +
        'svg{max-width:220px;height:auto}' +
        'table{width:100%;border-collapse:collapse;margin-bottom:16px}' +
        'td{padding:4px 8px;border:1px solid #ddd;font-size:13px}' +
        '.codes{display:flex;gap:24px;align-items:center;justify-content:center}' +
        '</style></head>' +
        `<body>${markup}</body></html>`,
    );
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <Modal
      open={Boolean(batch)}
      title={batch ? `Label — ${batch.fgBatchNumber}` : 'Product label'}
      onCancel={onClose}
      width={620}
      footer={[
        <Button
          key="print"
          type="primary"
          icon={<PrinterOutlined />}
          onClick={handlePrint}
          disabled={!label.data}
        >
          Print label
        </Button>,
      ]}
    >
      {label.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
          <Spin />
        </div>
      ) : label.error ? (
        <Alert type="error" showIcon message={apiErrorMessage(label.error)} />
      ) : label.data ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {batch && !batch.qaReleased ? (
            <Alert
              type="warning"
              showIcon
              message="This batch is not QA-released"
              description="The label can be previewed, but the batch cannot be stocked or dispatched until a finished-goods inspection passes and it is released."
            />
          ) : null}

          <div ref={printRef}>
            <table>
              <tbody>
                <tr>
                  <td>
                    <strong>Product</strong>
                  </td>
                  <td>{label.data.productName}</td>
                </tr>
                <tr>
                  <td>
                    <strong>Batch</strong>
                  </td>
                  <td>{label.data.batchNumber}</td>
                </tr>
                <tr>
                  <td>
                    <strong>Net weight</strong>
                  </td>
                  <td>{label.data.netWeight}</td>
                </tr>
                <tr>
                  <td>
                    <strong>MRP</strong>
                  </td>
                  <td>{label.data.mrp ?? '—'}</td>
                </tr>
                <tr>
                  <td>
                    <strong>Manufactured</strong>
                  </td>
                  <td>{formatDate(label.data.manufacturingDate)}</td>
                </tr>
                <tr>
                  <td>
                    <strong>Packed</strong>
                  </td>
                  <td>{formatDate(label.data.packagingDate)}</td>
                </tr>
                <tr>
                  <td>
                    <strong>Expires</strong>
                  </td>
                  <td>{formatDate(label.data.expiryDate)}</td>
                </tr>
              </tbody>
            </table>

            {/* Server-generated SVG — our own API's output, not user content. */}
            <div className="codes">
              <div
                style={{ width: 180 }}
                dangerouslySetInnerHTML={{ __html: label.data.qrSvg }}
              />
              <div
                style={{ width: 220 }}
                dangerouslySetInnerHTML={{ __html: label.data.barcodeSvg }}
              />
            </div>
          </div>

          <Descriptions size="small" column={1}>
            <Descriptions.Item label="Traceability URL">
              <Typography.Text copyable style={{ wordBreak: 'break-all', fontSize: 12 }}>
                {label.data.traceabilityUrl}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="Shelf life">
              {label.data.shelfLifeDays ? `${label.data.shelfLifeDays} days` : EM_DASH}
            </Descriptions.Item>
          </Descriptions>

          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            The QR points at a URL rather than encoding the data itself, so linked information — farm
            details, a process video — can change without reprinting a single bag.
          </Typography.Text>
        </Space>
      ) : null}
    </Modal>
  );
}
