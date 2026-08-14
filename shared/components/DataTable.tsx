import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, Space, Table } from 'antd';
import type { TableProps } from 'antd';
import type { ReactNode } from 'react';
import { apiErrorMessage } from '../api/client';
import { DEFAULT_PAGE_SIZE, type PageMeta } from '../api/envelope';

export interface DataTableProps<T> {
  /** Rows for the current page. */
  rows: T[] | undefined;
  columns: TableProps<T>['columns'];
  rowKey: keyof T | ((row: T) => string);

  isLoading?: boolean;
  isFetching?: boolean;
  error?: unknown;
  onRetry?: () => void;

  /**
   * Server-reported paging, when the API provides it.
   *
   * Absent (the case today) means the endpoint returned every row and the table
   * pages client-side. When A-12 lands and endpoints accept page/limit, pass
   * `meta` and `onPageChange` and this component switches to server paging -
   * no screen has to change shape.
   */
  meta?: PageMeta;
  onPageChange?: (page: number, limit: number) => void;

  emptyText?: ReactNode;
  toolbar?: ReactNode;
  size?: TableProps<T>['size'];
  onRow?: TableProps<T>['onRow'];
}

/**
 * The one table in the app.
 *
 * Loading, error and empty states are handled here precisely once, so twenty
 * list screens cannot each get them subtly different - and so an API failure
 * always shows the server's own message with a retry, rather than an empty grid
 * that looks like "no records".
 */
export function DataTable<T extends object>({
  rows,
  columns,
  rowKey,
  isLoading,
  isFetching,
  error,
  onRetry,
  meta,
  onPageChange,
  emptyText = 'Nothing here yet',
  toolbar,
  size = 'middle',
  onRow,
}: DataTableProps<T>) {
  if (error) {
    return (
      <Alert
        type="error"
        showIcon
        message="Could not load this list"
        description={apiErrorMessage(error)}
        action={
          onRetry ? (
            <Button size="small" icon={<ReloadOutlined />} onClick={onRetry}>
              Retry
            </Button>
          ) : null
        }
      />
    );
  }

  const serverPaged = Boolean(meta && onPageChange);

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {toolbar}
      <Table<T>
        columns={columns}
        dataSource={rows ?? []}
        rowKey={rowKey as TableProps<T>['rowKey']}
        loading={isLoading || isFetching}
        size={size}
        onRow={onRow}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: <Empty description={emptyText} /> }}
        pagination={{
          // Client-side today, server-side the moment the API supports it.
          current: meta?.page,
          pageSize: meta?.limit ?? DEFAULT_PAGE_SIZE,
          total: serverPaged ? meta?.total : undefined,
          onChange: onPageChange,
          showSizeChanger: true,
          showTotal: (total, range) => `${range[0]}–${range[1]} of ${total}`,
          pageSizeOptions: [10, 20, 50, 100],
          size: 'default',
        }}
      />
    </Space>
  );
}
