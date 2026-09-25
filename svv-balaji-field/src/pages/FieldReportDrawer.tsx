import { FileTextOutlined } from '@ant-design/icons';
import { Drawer, Typography } from 'antd';
import { FieldReportView } from '@shared/components/FieldReportView';
import { useIsMobile } from '@shared/hooks/useIsMobile';

/**
 * FRD 12.7 - the field report for one visit.
 *
 * Opened automatically when a new visit is recorded (see FieldVisitFormModal),
 * and on demand from a visit or a farmer's profile.
 */
export function FieldReportDrawer({ visitId, onClose }: { visitId: string | null; onClose: () => void }) {
  const isMobile = useIsMobile();

  return (
    <Drawer
      open={Boolean(visitId)}
      onClose={onClose}
      placement={isMobile ? 'bottom' : 'right'}
      height={isMobile ? '94%' : undefined}
      width={isMobile ? undefined : 860}
      destroyOnClose
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <FileTextOutlined style={{ color: '#059669' }} />
          <span>Field report</span>
          <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
            generated from this visit
          </Typography.Text>
        </span>
      }
      styles={{ body: { background: '#f8fafc', padding: isMobile ? 12 : 20 } }}
    >
      {visitId ? <FieldReportView visitId={visitId} /> : null}
    </Drawer>
  );
}
