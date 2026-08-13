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
      height="95%"
      onClose={onCancel}
      destroyOnClose={destroyOnClose}
      styles={{ header: { paddingBlock: 12 }, body: { paddingTop: 16 } }}
      footer={
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Button
            type="primary"
            size="large"
            block
            loading={confirmLoading}
            onClick={onOk}
            {...okButtonProps}
          >
            {okText}
          </Button>
          <Button size="large" block onClick={onCancel}>
            {cancelText}
          </Button>
        </Space>
      }
    >
      {children}
    </Drawer>
  );
}
