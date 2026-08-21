import { Alert, App as AntApp, Form, Modal, Select, Space, Typography } from 'antd';
import { useEffect } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { Branch } from '@shared/api/types';
import { useAssignBranchManager } from '@shared/hooks/useBranches';
import { useUsers } from '@shared/hooks/useUsers';

/**
 * FRD 6.2 — who is accountable for this branch.
 *
 * The picker offers only people the server will actually accept: active
 * BRANCH_MANAGER accounts already working at this branch. Offering everyone and
 * letting the server refuse would be teaching the user the rule one rejection
 * at a time, and the rule is not obvious — it is that accountability follows
 * where someone works, because branch records are scoped that way.
 */
export function AssignManagerModal({
  branch,
  onClose,
}: {
  branch: Branch | null;
  onClose: () => void;
}) {
  const [form] = Form.useForm<{ managerId: string | null }>();
  const { message } = AntApp.useApp();
  const assign = useAssignBranchManager();

  const users = useUsers({ status: 'ACTIVE' });

  const eligible = (users.data?.data ?? []).filter(
    (user) => user.role === 'BRANCH_MANAGER' && user.branchId === branch?.id,
  );

  useEffect(() => {
    if (branch) form.setFieldsValue({ managerId: branch.managerId ?? null });
  }, [branch, form]);

  const handleSubmit = async () => {
    if (!branch) return;
    const { managerId } = await form.validateFields();

    try {
      const updated = await assign.mutateAsync({ id: branch.id, managerId: managerId ?? null });
      message.success(
        updated.manager
          ? `${updated.manager.fullName} now manages ${updated.name}`
          : `${updated.name} has no assigned manager`,
      );
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not assign the manager'), 8);
    }
  };

  return (
    <Modal
      open={Boolean(branch)}
      title={branch ? `Branch manager — ${branch.name}` : 'Branch manager'}
      okText="Save"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={assign.isPending}
      destroyOnClose
    >
      {eligible.length === 0 && !users.isLoading ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Nobody here can be assigned yet"
          description={
            <Space direction="vertical" size={4}>
              <Typography.Text>
                A branch manager has to be an active user with the Branch Manager role who already
                works at this branch.
              </Typography.Text>
              <Typography.Text type="secondary">
                Create or move a user to {branch?.name} first. Branch records are scoped to the
                branch a user belongs to, so assigning someone from elsewhere would make them
                accountable for records they cannot see.
              </Typography.Text>
            </Space>
          }
        />
      ) : null}

      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="managerId"
          label="Assigned manager"
          extra="Clear this to leave the post vacant — a branch between appointments is a real state."
        >
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={users.isLoading ? 'Loading…' : 'Nobody assigned'}
            loading={users.isLoading}
            disabled={eligible.length === 0}
            options={eligible.map((user) => ({
              value: user.id,
              label: `${user.fullName} — ${user.email}`,
            }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
