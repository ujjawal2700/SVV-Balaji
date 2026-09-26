import { InboxOutlined, PlusOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Card, Col, Row, Skeleton, Space, Typography } from 'antd';
import type { ReactNode } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import { useIsMobile } from '@shared/hooks/useIsMobile';

/**
 * A page's own title block — tablet and desktop only.
 *
 * On a phone the app bar already names the screen (and carries the back arrow
 * on sub-pages), so repeating the title under it only pushes the content down.
 */
export function FieldPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  const isMobile = useIsMobile();
  if (isMobile) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <Typography.Title level={4} style={{ margin: 0, color: '#0f172a', fontWeight: 700 }}>
          {title}
        </Typography.Title>
        {subtitle ? (
          <Typography.Text style={{ color: '#64748b', fontSize: 13 }}>{subtitle}</Typography.Text>
        ) : null}
      </div>
      {actions ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div> : null}
    </div>
  );
}

/**
 * The filter row above a list.
 *
 * A plain row on a phone — a white card around two small toggles is chrome,
 * not content — and a bordered bar on wider screens where it anchors the page.
 */
export function FieldToolbar({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: isMobile ? 10 : 12,
        ...(isMobile
          ? {}
          : {
              background: '#ffffff',
              padding: '12px 16px',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
            }),
      }}
    >
      {children}
    </div>
  );
}

/** Compact "nothing here" block, shared by every list. */
export function FieldEmpty({ text, icon, action }: { text: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div
      style={{
        border: '1px dashed #d8dee6',
        borderRadius: 14,
        background: '#ffffff',
        padding: '28px 20px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: '#f1f5f9',
          color: '#94a3b8',
          display: 'grid',
          placeItems: 'center',
          fontSize: 20,
          margin: '0 auto 10px',
        }}
      >
        {icon ?? <InboxOutlined />}
      </div>
      <Typography.Text style={{ color: '#64748b', fontSize: 13.5, display: 'block' }}>{text}</Typography.Text>
      {action ? <div style={{ marginTop: 12 }}>{action}</div> : null}
    </div>
  );
}

/**
 * The floating action button.
 *
 * Every field tab has exactly one thing you came to do, and on a phone it sits
 * above the tab bar within thumb reach rather than at the top of the page.
 * Hidden on desktop, where the screens keep their ordinary header button — a
 * FAB on a wide screen is a mobile idiom in the wrong place.
 */
export function FieldFab({ label, onClick }: { label: string; onClick: () => void }) {
  const isMobile = useIsMobile();
  if (!isMobile) return null;

  return (
    <Button
      type="primary"
      shape="round"
      size="large"
      icon={<PlusOutlined />}
      onClick={onClick}
      style={{
        position: 'fixed',
        // Clears the 56px tab bar plus the home indicator on a notched phone.
        bottom: 'calc(72px + env(safe-area-inset-bottom))',
        right: 16,
        height: 52,
        paddingInline: 22,
        boxShadow: '0 6px 16px rgba(0,0,0,0.18)',
        zIndex: 20,
      }}
    >
      {label}
    </Button>
  );
}

interface FieldListProps<T> {
  rows: T[] | undefined;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyText: string;
  renderCard: (row: T) => ReactNode;
  keyOf: (row: T) => string;
}

/**
 * A responsive card list.
 *
 * On mobile, cards stack comfortably in a single column for effortless thumb interaction.
 * On tablets and desktop screens, cards flow into a clean 2 or 3-column website grid.
 *
 * Loading shows skeleton cards rather than a spinner: the layout does not jump
 * when the data arrives, which is most of what makes a list feel fast even when
 * it is not.
 */
export function FieldList<T>({
  rows,
  isLoading,
  error,
  onRetry,
  emptyText,
  renderCard,
  keyOf,
}: FieldListProps<T>) {
  // A failed refresh (typically no signal) must not hide rows already on screen.
  if (error && (!rows || rows.length === 0)) {
    return (
      <FieldEmpty
        icon={<WarningOutlined style={{ color: '#dc2626' }} />}
        text={apiErrorMessage(error)}
        action={onRetry ? <Button onClick={onRetry}>Try again</Button> : undefined}
      />
    );
  }

  if (isLoading) {
    return (
      <Row gutter={[12, 12]}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Col xs={24} sm={24} md={12} lg={12} xl={8} key={i}>
            <Card size="small">
              <Skeleton active paragraph={{ rows: 2 }} title={{ width: '60%' }} />
            </Card>
          </Col>
        ))}
      </Row>
    );
  }

  if (!rows || rows.length === 0) {
    return (
<FieldEmpty text={emptyText} />
    );
  }

  return (
    <Row gutter={[12, 12]}>
      {rows.map((row) => (
        <Col xs={24} sm={24} md={12} lg={12} xl={8} key={keyOf(row)}>
          {renderCard(row)}
        </Col>
      ))}
    </Row>
  );
}

/**
 * One record as a card.
 *
 * `onOpen` makes the whole card the tap target rather than a small chevron —
 * on a phone the difference between a 300px target and a 24px one is the
 * difference between a control that works while walking and one that does not.
 */
export function FieldCard({
  title,
  meta,
  tags,
  children,
  onOpen,
  extra,
}: {
  title: ReactNode;
  meta?: ReactNode;
  tags?: ReactNode;
  children?: ReactNode;
  onOpen?: () => void;
  extra?: ReactNode;
}) {
  return (
    <div
      onClick={onOpen}
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 14,
        padding: '14px 16px',
        boxShadow: '0 1px 2px 0 rgba(15, 23, 42, 0.04)',
        cursor: onOpen ? 'pointer' : 'default',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        height: '100%',
        // Without this the padding and border are added on top of 100% and
        // every card overhangs its grid cell by ~30px.
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
      onMouseEnter={(e) => {
        if (onOpen) {
          e.currentTarget.style.borderColor = '#cbd5e1';
          e.currentTarget.style.boxShadow = '0 8px 18px -4px rgba(15, 23, 42, 0.08), 0 4px 6px -2px rgba(15, 23, 42, 0.03)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }
      }}
      onMouseLeave={(e) => {
        if (onOpen) {
          e.currentTarget.style.borderColor = '#e2e8f0';
          e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.02)';
          e.currentTarget.style.transform = 'translateY(0)';
        }
      }}
    >
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <Typography.Text strong style={{ fontSize: 15.5, color: '#0f172a', fontWeight: 600 }}>
            {title}
          </Typography.Text>
          {extra}
        </div>

        {tags ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{tags}</div> : null}

        {meta ? (
          <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
            {meta}
          </div>
        ) : null}

        {children ? <div style={{ paddingTop: 4 }}>{children}</div> : null}
      </Space>
    </div>
  );
}
