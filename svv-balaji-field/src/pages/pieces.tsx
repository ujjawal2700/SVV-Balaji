import { PlusOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Skeleton, Space, Typography } from 'antd';
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
 * A card list, deliberately not a table.
 *
 * A DataTable on a phone is a horizontal scroll that nobody uses — the columns
 * beyond the second are effectively invisible. Cards stack, so every field is
 * on screen, and a whole card is a comfortable tap target rather than a row
 * with a 24px action button at the far right.
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
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {[0, 1, 2].map((i) => (
          <Card key={i} size="small">
            <Skeleton active paragraph={{ rows: 2 }} title={{ width: '60%' }} />
          </Card>
        ))}
      </Space>
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
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {rows.map((row) => (
        <div key={keyOf(row)}>{renderCard(row)}</div>
      ))}
    </Space>
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
    <Card
      size="small"
      hoverable={Boolean(onOpen)}
      onClick={onOpen}
      styles={{ body: { padding: 14 } }}
      style={onOpen ? { cursor: 'pointer' } : undefined}
    >
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <Typography.Text strong style={{ fontSize: 15 }}>
            {title}
          </Typography.Text>
          {extra}
        </div>

        {tags ? <Space size={4} wrap>{tags}</Space> : null}

        {meta ? (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {meta}
          </Typography.Text>
        ) : null}

        {children}
      </Space>
    </Card>
  );
}
