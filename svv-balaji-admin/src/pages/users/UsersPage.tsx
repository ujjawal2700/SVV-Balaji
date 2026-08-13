import { KeyOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Row, Select, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import type { StaffUser, UserStatus } from '../../api/types';
import { ROLE_LABELS } from '../../auth/types';
import { useAuth } from '../../auth/useAuth';
import { useCan } from '../../auth/useCan';
import { Can } from '../../components/Can';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { RowActions } from '../../components/RowActions';
import { BranchSelect } from '../../components/pickers';
import { useDeleteUser, useSetUserStatus, useUsers } from '../../hooks/useUsers';
import { EM_DASH } from '../../utils/format';
import { ResetPasswordModal } from './ResetPasswordModal';
import { UserFormModal } from './UserFormModal';

const STATUS_COLOURS: Record<StaffUser['status'], string> = {
  ACTIVE: 'green',
  INACTIVE: 'default',
  SUSPENDED: 'red',
};

const STATUSES: UserStatus[] = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];

export function UsersPage() {
  const [filters, setFilters] = useState<{ branchId?: string; status?: UserStatus }>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [resetting, setResetting] = useState<StaffUser | null>(null);

  const { user: signedInUser } = useAuth();
  const canView = useCan('USER_VIEW');
  const users = useUsers(filters, canView);
  const setStatus = useSetUserStatus();
  const remove = useDeleteUser();

  const openEdit = (user: StaffUser) => {
    setEditing(user);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const columns: ColumnsType<StaffUser> = [
    {
      title: 'Name',
      dataIndex: 'fullName',
      key: 'fullName',
      sorter: (a, b) => a.fullName.localeCompare(b.fullName),
      render: (name: string, user) => (
        <Typography.Text strong type={user.status === 'ACTIVE' ? undefined : 'secondary'}>
          {name}
          {user.id === signedInUser?.id ? (
            <Typography.Text type="secondary" style={{ fontWeight: 400 }}>
              {' '}
              (you)
            </Typography.Text>
          ) : null}
        </Typography.Text>
      ),
    },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      filters: Object.entries(ROLE_LABELS).map(([value, label]) => ({ text: label, value })),
      onFilter: (value, user) => user.role === value,
      render: (role: StaffUser['role']) => <Tag color="blue">{ROLE_LABELS[role]}</Tag>,
    },
    {
      title: 'Branch',
      key: 'branch',
      // GET /users now includes the branch relation, so this is a name rather
      // than the uuid the list used to show.
      render: (_, user) =>
        user.branch?.name ?? <Typography.Text type="secondary">Organisation-wide</Typography.Text>,
    },
    {
      title: 'Phone',
      dataIndex: 'phone',
      key: 'phone',
      render: (phone: string | null) => phone ?? EM_DASH,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: StaffUser['status']) => <Tag color={STATUS_COLOURS[status]}>{status}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      fixed: 'right',
      render: (_, user) => {
        const isSelf = user.id === signedInUser?.id;
        return (
          <RowActions
            entity="user"
            label={user.fullName}
            can="USER_MANAGE"
            isActive={user.status === 'ACTIVE'}
            onEdit={() => openEdit(user)}
            onSetActive={
              isSelf
                ? undefined
                : (isActive) =>
                    setStatus.mutateAsync({
                      id: user.id,
                      status: isActive ? 'ACTIVE' : 'INACTIVE',
                    })
            }
            onDelete={() => remove.mutateAsync(user.id)}
            // Shown disabled rather than hidden: a missing Delete on your own
            // row reads as a rendering bug, a disabled one explains itself.
            deleteBlockedReason={isSelf ? 'You cannot delete your own account' : undefined}
            extraItems={[
              {
                key: 'password',
                icon: <KeyOutlined />,
                label: 'Reset password',
                onClick: () => setResetting(user),
              },
            ]}
          />
        );
      },
    },
  ];

  const toolbar = (
    <Row gutter={[12, 12]}>
      <Col xs={24} md={8}>
        <BranchSelect
          allowClear
          value={filters.branchId}
          onChange={(branchId) => setFilters((f) => ({ ...f, branchId }))}
          placeholder="All branches"
        />
      </Col>
      <Col xs={24} md={6}>
        <Select<UserStatus>
          allowClear
          style={{ width: '100%' }}
          placeholder="All statuses"
          value={filters.status}
          onChange={(status) => setFilters((f) => ({ ...f, status }))}
          options={STATUSES.map((value) => ({ value, label: value }))}
        />
      </Col>
    </Row>
  );

  return (
    <Card>
      <PageHeader
        title="Users"
        subtitle="Staff accounts and roles. A user's role decides everything they can reach."
        actions={
          <Can do="USER_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              New user
            </Button>
          </Can>
        }
      />

      {!canView ? (
        <Alert
          type="info"
          showIcon
          message="Your role cannot list users"
          description="Viewing staff accounts is limited to Super Admin and Branch Manager."
        />
      ) : (
        <DataTable<StaffUser>
          rows={users.data?.data}
          columns={columns}
          rowKey="id"
          isLoading={users.isLoading}
          isFetching={users.isFetching}
          error={users.error}
          onRetry={() => void users.refetch()}
          toolbar={toolbar}
          emptyText="No users match this filter"
        />
      )}

      <UserFormModal open={formOpen} user={editing} onClose={closeForm} />
      <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />
    </Card>
  );
}
