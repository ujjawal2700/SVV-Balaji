import { PlusOutlined } from '@ant-design/icons';
import { Button, Card, Col, Empty, Row, Skeleton, Space, Typography } from 'antd';
import type { ReactNode } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import { useIsMobile } from '@shared/hooks/useIsMobile';

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
  if (error) {
    return (
      <Card>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="danger">{apiErrorMessage(error)}</Typography.Text>
          {onRetry ? (
            <Button block onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </Space>
      </Card>
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
      <Card>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
      </Card>
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
        padding: '16px 18px',
        boxShadow: '0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.02)',
        cursor: onOpen ? 'pointer' : 'default',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        height: '100%',
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
          <Typography.Text strong style={{ fontSize: 16, color: '#0f172a', fontWeight: 600 }}>
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
