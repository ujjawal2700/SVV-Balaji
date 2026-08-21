import { Button, Drawer, Modal, Space } from 'antd';
import type { ReactNode } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';

export interface SheetProps {
  open: boolean;
  title: ReactNode;
  onOk: () => void;
  onCancel: () => void;
  okText?: string;
  cancelText?: string;
  confirmLoading?: boolean;
  okButtonProps?: React.ComponentProps<typeof Button>;
  /** Desktop modal width. Ignored on a phone, where a sheet is always full width. */
  width?: number;
  destroyOnClose?: boolean;
  children: ReactNode;
}

/**
 * A form container that is a centred modal on a desktop and a bottom sheet on
 * a phone.
 *
 * This is the highest-value single change in making the field panel read as an
 * app. A centred dialog with a small × in the corner is the most recognisable
 * "this is a website" signal there is; a panel that rises from the bottom edge
 * and fills the screen is what every native form does.
 *
 * The differences are not only cosmetic:
 *
 *   - **Actions sit at the bottom, full width.** On a phone the top of the
 *     screen is the hardest place to reach one-handed and the bottom is the
 *     easiest, which is the reverse of a desktop dialog.
 *   - **95% height, not 100%.** Leaving a strip of the page visible behind it
 *     is what tells the user this is a layer they can dismiss rather than a
 *     new page they have navigated to.
 *   - **Swipe-to-close is left off.** antd's drawer does not implement it, and
 *     a half-working gesture is worse than none — the user learns it is
 *     unreliable and stops trying.
 */
export function Sheet({
  open,
  title,
  onOk,
  onCancel,
  okText = 'Save',
  cancelText = 'Cancel',
  confirmLoading,
  okButtonProps,
  width = 680,
  destroyOnClose = true,
  children,
}: SheetProps) {
  const isMobile = useIsMobile();

  if (!isMobile) {
    return (
      <Modal
        open={open}
        title={title}
        okText={okText}
        cancelText={cancelText}
        onOk={onOk}
        onCancel={onCancel}
        confirmLoading={confirmLoading}
        okButtonProps={okButtonProps}
        width={width}
        style={{ top: 40, paddingBottom: 40 }}
        styles={{
          body: {
            maxHeight: 'calc(100vh - 200px)',
            overflowY: 'auto',
            padding: '20px 24px',
            background: '#f8fafc',
          },
          header: {
            padding: '16px 24px',
            borderBottom: '1px solid #e2e8f0',
            marginBottom: 0,
          },
          footer: {
            padding: '14px 24px',
            borderTop: '1px solid #e2e8f0',
            marginTop: 0,
          },
        }}
        destroyOnClose={destroyOnClose}
      >
        {children}
      </Modal>
    );
  }

  return (
    <Drawer
      className="field-sheet"
      open={open}
      title={title}
      placement="bottom"
      height="92%"
      onClose={onCancel}
      destroyOnClose={destroyOnClose}
      styles={{
        header: { padding: '14px 20px', borderBottom: '1px solid #e2e8f0', background: '#fff' },
        body: { padding: '16px', background: '#f8fafc', overflowY: 'auto' },
        footer: { borderTop: '1px solid #e2e8f0', padding: '12px 16px', background: '#fff' },
      }}
      footer={
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Button
            type="primary"
            size="large"
            block
            loading={confirmLoading}
            onClick={onOk}
            style={{
              height: 44,
              borderRadius: 10,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none',
              boxShadow: '0 2px 8px 0 rgba(16, 185, 129, 0.3)',
            }}
            {...okButtonProps}
          >
            {okText}
          </Button>
          <Button size="large" block style={{ height: 44, borderRadius: 10 }} onClick={onCancel}>
            {cancelText}
          </Button>
        </Space>
      }
    >
      {children}
    </Drawer>
  );
}
