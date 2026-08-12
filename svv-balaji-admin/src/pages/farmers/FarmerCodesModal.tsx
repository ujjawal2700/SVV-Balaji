import { CopyOutlined, PrinterOutlined } from '@ant-design/icons';
import { App as AntApp, Alert, Button, Modal, Space, Spin, Typography } from 'antd';
import { useRef } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { Farmer } from '../../api/types';
import { useFarmerCodes } from '../../hooks/useFarmers';

interface FarmerCodesModalProps {
  farmer: Farmer | null;
  onClose: () => void;
}

/**
 * Farmer QR and barcode (FRD 8.2 / 8.3).
 *
 * The SVGs come from the server already rendered rather than being generated
 * here on purpose: the QR encodes a public traceability URL, and if the panel
 * built that URL itself the printed code and the server's idea of it could
 * drift. One generator, one source of truth.
 */
export function FarmerCodesModal({ farmer, onClose }: FarmerCodesModalProps) {
  const { message } = AntApp.useApp();
  const printRef = useRef<HTMLDivElement>(null);
  const codes = useFarmerCodes(farmer?.id, Boolean(farmer?.farmerCode));

  const handleCopy = async () => {
    if (!codes.data) return;
    try {
      await navigator.clipboard.writeText(codes.data.traceabilityUrl);
      message.success('Traceability URL copied');
    } catch {
      message.error('Could not copy — select and copy the link manually');
    }
  };

  const handlePrint = () => {
    const markup = printRef.current?.innerHTML;
    if (!markup) return;

    const printWindow = window.open('', '_blank', 'width=640,height=520');
    if (!printWindow) {
      message.error('Your browser blocked the print window — allow pop-ups for this site');
      return;
    }

    printWindow.document.write(
      `<html><head><title>${farmer?.farmerCode ?? 'Farmer codes'}</title>` +
        '<style>body{font-family:sans-serif;text-align:center;padding:24px}' +
        'svg{max-width:260px;height:auto}</style></head>' +
        `<body>${markup}</body></html>`,
    );
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <Modal
      open={Boolean(farmer)}
      title={farmer ? `Codes — ${farmer.fullName}` : 'Farmer codes'}
      onCancel={onClose}
      footer={[
        <Button key="copy" icon={<CopyOutlined />} onClick={handleCopy} disabled={!codes.data}>
          Copy URL
        </Button>,
        <Button
          key="print"
          type="primary"
          icon={<PrinterOutlined />}
          onClick={handlePrint}
          disabled={!codes.data}
        >
          Print
        </Button>,
      ]}
      width={520}
    >
      {!farmer?.farmerCode ? (
        <Alert
          type="info"
          showIcon
          message="No traceability code yet"
          description="Codes are issued when the farmer is approved (FRD 8.1). Approve them first."
        />
      ) : codes.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 32 }}>
          <Spin />
        </div>
      ) : codes.error ? (
        <Alert type="error" showIcon message={apiErrorMessage(codes.error)} />
      ) : codes.data ? (
        <div ref={printRef}>
          <Space direction="vertical" align="center" size={12} style={{ width: '100%' }}>
            <Typography.Text code strong style={{ fontSize: 18 }}>
              {codes.data.farmerCode}
            </Typography.Text>

            {/* Server-generated SVG. Safe to inline: it is our own API's output,
                not user-supplied content. */}
            <div
              style={{ width: 200 }}
              dangerouslySetInnerHTML={{ __html: codes.data.qrSvg }}
            />
            <div
              style={{ width: 260 }}
              dangerouslySetInnerHTML={{ __html: codes.data.barcodeSvg }}
            />

            <Typography.Text type="secondary" style={{ fontSize: 12, wordBreak: 'break-all' }}>
              {codes.data.traceabilityUrl}
            </Typography.Text>
          </Space>
        </div>
      ) : null}
    </Modal>
  );
}
