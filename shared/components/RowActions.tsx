import {
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  EyeInvisibleOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { App as AntApp, Button, Dropdown, Space, Typography } from 'antd';
import type { MenuProps } from 'antd';
import type { ReactNode } from 'react';
import { apiErrorMessage } from '../api/client';
import { useCanFn } from '../auth/useCan';
import type { Permission } from '../auth/permissions';

export interface RowActionsProps {
  /** Shown inline as the primary action. Omit to hide the edit button. */
  onEdit?: () => void;

  /**
   * Deactivation. `isActive` drives which of "Deactivate" / "Reactivate" is
   * offered, so one prop covers both directions.
   */
  isActive?: boolean;
  onSetActive?: (isActive: boolean) => Promise<unknown>;

  onDelete?: () => Promise<unknown>;

  /** What the record is called in confirmation dialogs, e.g. "Nagpur". */
  label: string;
  /** The kind of record, lower case, e.g. "branch". */
  entity: string;

  /** Permission required for edit and deactivate. */
  can?: Permission;

  /**
   * Permission required for delete, when it differs from `can`. Every DELETE
   * route in this API is Super Admin only, while edit is usually open to the
   * roles that create the record - so the two genuinely diverge and a single
   * prop would hide Edit from people who have it.
   */
  canDelete?: Permission;

  /**
   * Set when this particular row must not be deleted, with the reason. The
   * menu item is then shown disabled with the reason as its tooltip, rather
   * than hidden - a missing button reads as a bug, a disabled one explains
   * itself.
   */
  deleteBlockedReason?: string;

  /** Extra items appended to the overflow menu. */
  extraItems?: MenuProps['items'];

  busy?: boolean;
  children?: ReactNode;
}

/**
 * The row actions used by every master screen.
 *
 * Two rules are enforced here once rather than per screen:
 *
 *   1. Deactivation is offered before deletion, and worded so the difference is
 *      obvious. Deactivate is the routine action; delete is for mistakes.
 *   2. A failed delete shows the server's own message verbatim and for long
 *      enough to read it. That message names what is blocking - "12 farmers and
 *      1 warehouse still reference it" - which is the entire reason the user
 *      clicked. Replacing it with "Delete failed" would waste it.
 */
export function RowActions({
  onEdit,
  isActive,
  onSetActive,
  onDelete,
  label,
  entity,
  can,
  canDelete,
  deleteBlockedReason,
  extraItems,
  busy,
  children,
}: RowActionsProps) {
  const { message, modal } = AntApp.useApp();
  const canFn = useCanFn();
  const allowed = can ? canFn(can) : true;
  const allowedToDelete = canDelete ? canFn(canDelete) : allowed;

  if (!allowed) {
    // Still render anything the caller passed - a read-only "View" button is
    // legitimate for a role that cannot change the record.
    return children ? <Space size={4}>{children}</Space> : null;
  }

  const confirmSetActive = () => {
    if (!onSetActive) return;
    const next = !isActive;

    modal.confirm({
      title: next ? `Reactivate ${label}?` : `Deactivate ${label}?`,
      content: next
        ? `It becomes selectable again everywhere ${entity}s are picked.`
        : `It stops appearing in dropdowns and cannot be used on new records. ` +
          `Everything already linked to it is unaffected, and you can reactivate it at any time.`,
      okText: next ? 'Reactivate' : 'Deactivate',
      onOk: async () => {
        try {
          await onSetActive(next);
          message.success(next ? `${label} reactivated` : `${label} deactivated`);
        } catch (error) {
          message.error(apiErrorMessage(error, `Could not update ${label}`), 10);
          // Rethrowing keeps the dialog open on failure, so the reason stays
          // on screen next to the button that produced it.
          throw error;
        }
      },
    });
  };

  const confirmDelete = () => {
    if (!onDelete) return;

    modal.confirm({
      title: `Delete ${label} permanently?`,
      okText: 'Delete',
      okButtonProps: { danger: true },
      content: (
        <Space direction="vertical" size={8}>
          <Typography.Text>
            This removes the {entity} from the database. It cannot be undone.
          </Typography.Text>
          <Typography.Text type="secondary">
            Delete is only for records created by mistake. If this {entity} has been used
            anywhere the server will refuse and tell you what is referencing it — deactivate
            it instead.
          </Typography.Text>
        </Space>
      ),
      onOk: async () => {
        try {
          await onDelete();
          message.success(`${label} deleted`);
        } catch (error) {
          message.error(apiErrorMessage(error, `Could not delete ${label}`), 12);
          throw error;
        }
      },
    });
  };

  // Concretely an array rather than MenuProps['items'], which is optional and
  // so cannot be pushed to without a non-null assertion at every call.
  const items: NonNullable<MenuProps['items']> = [];

  if (onSetActive) {
    items.push({
      key: 'active',
      icon: isActive ? <EyeInvisibleOutlined /> : <UndoOutlined />,
      label: isActive ? 'Deactivate' : 'Reactivate',
      onClick: confirmSetActive,
    });
  }

  if (extraItems?.length) {
    if (items.length) items.push({ type: 'divider' });
    items.push(...extraItems);
  }

  if (onDelete && allowedToDelete) {
    if (items.length) items.push({ type: 'divider' });
    items.push({
      key: 'delete',
      danger: true,
      icon: <DeleteOutlined />,
      label: deleteBlockedReason ? (
        <span title={deleteBlockedReason}>Delete</span>
      ) : (
        'Delete'
      ),
      disabled: Boolean(deleteBlockedReason),
      onClick: confirmDelete,
    });
  }

  return (
    <Space size={4}>
      {children}
      {onEdit ? (
        <Button size="small" icon={<EditOutlined />} onClick={onEdit} disabled={busy}>
          Edit
        </Button>
      ) : null}
      {items.length ? (
        <Dropdown menu={{ items }} trigger={['click']} disabled={busy}>
          <Button size="small" icon={<EllipsisOutlined />} aria-label={`More actions for ${label}`} />
        </Dropdown>
      ) : null}
    </Space>
  );
}
