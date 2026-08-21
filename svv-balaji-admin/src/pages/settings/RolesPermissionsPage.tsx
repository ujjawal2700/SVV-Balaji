import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  LockOutlined,
  UndoOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Empty,
  Row,
  Segmented,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { PermissionGroup } from '../../api/permissions';
import { useCan } from '../../auth/useCan';
import { ROLE_LABELS, type UserRole } from '../../auth/types';
import { useAuth } from '../../auth/useAuth';
import { PageHeader } from '../../components/PageHeader';
import {
  usePermissionMatrix,
  usePermissionRegistry,
  useResetRolePermissions,
  useSetRolePermissions,
} from '../../hooks/usePermissions';

/**
 * Where a Super Admin decides what every other role may see and do.
 *
 * The screen is organised by PAGE rather than by permission, because that is
 * how the question actually arrives: "should the Sales Team be able to open
 * Price Lists?" comes before "should they hold priceLists.supersede". Each page
 * has one switch that grants or revokes the whole page, and the individual
 * actions underneath it for when the answer is "yes, but read only".
 *
 * Two properties are deliberate and worth not undoing:
 *
 *   1. **Super Admin is not editable.** It is shown, greyed, holding
 *      everything. If it could be edited, the last administrator could remove
 *      their own access to this screen and there would be no way back in
 *      through the interface.
 *
 *   2. **Revoking a page's view permission is called out, not silently
 *      applied.** It removes the menu entry and 403s the endpoints for
 *      everyone holding that role, which is a bigger action than it looks when
 *      it is one checkbox among eighty.
 */
export function RolesPermissionsPage() {
  const { message, modal } = AntApp.useApp();
  const { user } = useAuth();
  const canManage = useCan('ROLES_MANAGE');

  const registry = usePermissionRegistry();
  const matrix = usePermissionMatrix();
  const save = useSetRolePermissions();
  const reset = useResetRolePermissions();

  const roles = registry.data?.assignableRoles ?? [];
  const [role, setRole] = useState<UserRole | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());

  // First load picks a role so the screen is never an empty frame. Not the
  // signed-in user's own role - a Super Admin editing SUPER_ADMIN is the one
  // thing this screen refuses, so landing there would open on a dead end.
  useEffect(() => {
    if (!role && roles.length > 0) setRole(roles[0]);
  }, [role, roles]);

  const saved = useMemo(
    () => new Set<string>(role ? (matrix.data?.matrix[role] ?? []) : []),
    [matrix.data, role],
  );

  useEffect(() => {
    setDraft(new Set<string>(saved));
  }, [saved]);

  const groups = registry.data?.groups ?? [];
  const defaults = role ? (registry.data?.defaults[role] ?? []) : [];
  const affectedUsers = role ? (matrix.data?.userCounts[role] ?? 0) : 0;

  const dirty = useMemo(() => {
    if (draft.size !== saved.size) return true;
    for (const key of draft) if (!saved.has(key)) return true;
    return false;
  }, [draft, saved]);

  const atDefaults = useMemo(() => {
    if (draft.size !== defaults.length) return false;
    return defaults.every((key) => draft.has(key));
  }, [draft, defaults]);

  const toggle = (key: string, on: boolean) => {
    setDraft((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  /**
   * Turning a page on grants its view permission only. Turning it off removes
   * everything in the group - leaving an edit permission behind on a page
   * nobody can open produces a grant that reads as access and delivers none.
   */
  const togglePage = (group: PermissionGroup, on: boolean) => {
    setDraft((current) => {
      const next = new Set(current);
      if (on) {
        if (group.viewKey) next.add(group.viewKey);
        else group.permissions.forEach((p) => next.add(p.key));
      } else {
        group.permissions.forEach((p) => next.delete(p.key));
      }
      return next;
    });
  };

  const onSave = () => {
    if (!role) return;

    const losingPages = groups
      .filter((group) => group.viewKey && saved.has(group.viewKey) && !draft.has(group.viewKey))
      .map((group) => group.label);

    const commit = async () => {
      try {
        await save.mutateAsync({ role, permissions: [...draft] });
        message.success(`${ROLE_LABELS[role]} updated`);
      } catch (error) {
        message.error(apiErrorMessage(error, 'Could not save permissions'), 10);
      }
    };

    if (losingPages.length > 0) {
      modal.confirm({
        title: `Remove ${losingPages.length} page${losingPages.length === 1 ? '' : 's'} from ${ROLE_LABELS[role]}?`,
        icon: <WarningOutlined style={{ color: '#faad14' }} />,
        width: 520,
        content: (
          <Space direction="vertical" size={8}>
            <Typography.Text>
              {losingPages.join(', ')} will disappear from the menu for{' '}
              {affectedUsers === 0
                ? 'this role'
                : `${affectedUsers} user${affectedUsers === 1 ? '' : 's'}`}
              , and the data behind {losingPages.length === 1 ? 'it' : 'them'} will be refused.
            </Typography.Text>
            <Typography.Text type="secondary">
              It takes effect on their next request — nobody has to sign out. You can put it back
              here at any time.
            </Typography.Text>
          </Space>
        ),
        okText: 'Remove access',
        okButtonProps: { danger: true },
        onOk: commit,
      });
      return;
    }

    void commit();
  };

  const onReset = () => {
    if (!role) return;
    modal.confirm({
      title: `Reset ${ROLE_LABELS[role]} to defaults?`,
      icon: <ExclamationCircleOutlined />,
      content:
        'Restores the access this role had before permissions became editable. Anything you ' +
        'have granted or removed since is undone.',
      okText: 'Reset',
      onOk: async () => {
        try {
          await reset.mutateAsync(role);
          message.success(`${ROLE_LABELS[role]} reset to defaults`);
        } catch (error) {
          message.error(apiErrorMessage(error, 'Could not reset permissions'), 10);
        }
      },
    });
  };

  if (registry.isLoading || matrix.isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (registry.error || matrix.error) {
    return (
      <Alert
        type="error"
        showIcon
        message="Could not load permissions"
        description={apiErrorMessage(registry.error ?? matrix.error, 'Please try again.')}
        action={
          <Button
            size="small"
            onClick={() => {
              void registry.refetch();
              void matrix.refetch();
            }}
          >
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <PageHeader
          title="Roles & Permissions"
          subtitle="Every screen and action in this panel is a switch here. Grants are stored in the database, so a change takes effect on the next request the affected users make — no redeploy, no signing out."
        />

        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              Editing
            </Typography.Text>
            <div style={{ marginTop: 6 }}>
              <Segmented<UserRole>
                value={role ?? undefined}
                onChange={(value) => setRole(value)}
                options={roles.map((r) => ({
                  label: (
                    <span>
                      {ROLE_LABELS[r]}{' '}
                      <Badge
                        count={matrix.data?.userCounts[r] ?? 0}
                        showZero
                        color={(matrix.data?.userCounts[r] ?? 0) > 0 ? '#1677ff' : '#d9d9d9'}
                        size="small"
                      />
                    </span>
                  ),
                  value: r,
                }))}
              />
            </div>
          </div>

          <Alert
            type="info"
            showIcon
            icon={<LockOutlined />}
            message="Super Admin is not on this list, and cannot be"
            description="It holds every permission by definition. If it could be edited, the last administrator could remove their own access to this screen and there would be no way back in through the interface."
          />
        </Space>
      </Card>

      {role ? (
        <>
          <Card
            size="small"
            style={{ position: 'sticky', top: 0, zIndex: 2 }}
            styles={{ body: { padding: '10px 16px' } }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <Space size={8} wrap>
                <Typography.Text strong>{ROLE_LABELS[role]}</Typography.Text>
                <Tag>{draft.size} granted</Tag>
                {affectedUsers > 0 ? (
                  <Tag color="blue">
                    {affectedUsers} user{affectedUsers === 1 ? '' : 's'} affected
                  </Tag>
                ) : (
                  <Tag>nobody holds this role yet</Tag>
                )}
                {atDefaults ? (
                  <Tag icon={<CheckCircleOutlined />} color="default">
                    at defaults
                  </Tag>
                ) : null}
              </Space>

              <Space>
                <Button icon={<UndoOutlined />} onClick={onReset} disabled={!canManage}>
                  Reset to defaults
                </Button>
                <Button onClick={() => setDraft(new Set<string>(saved))} disabled={!dirty}>
                  Discard
                </Button>
                <Button
                  type="primary"
                  onClick={onSave}
                  loading={save.isPending}
                  disabled={!canManage || !dirty}
                >
                  Save changes
                </Button>
              </Space>
            </div>
          </Card>

          {!canManage ? (
            <Alert
              type="warning"
              showIcon
              message="You can see this matrix but not change it"
              description="Granting permissions is Super Admin only — anyone able to do it could give themselves everything else in this list."
            />
          ) : null}

          <Row gutter={[12, 12]}>
            {groups.map((group) => {
              const pageOn = group.viewKey ? draft.has(group.viewKey) : true;
              const granted = group.permissions.filter((p) => draft.has(p.key)).length;

              return (
                <Col xs={24} lg={12} key={group.key}>
                  <Card
                    size="small"
                    title={
                      <Space size={8}>
                        <Typography.Text strong>{group.label}</Typography.Text>
                        {group.path ? (
                          <Typography.Text code style={{ fontSize: 11 }}>
                            {group.path}
                          </Typography.Text>
                        ) : null}
                      </Space>
                    }
                    extra={
                      group.viewKey ? (
                        <Tooltip
                          title={
                            pageOn
                              ? 'Turn off to remove this page from the menu and refuse its data'
                              : 'Turn on to give this role the page, read only'
                          }
                        >
                          <Switch
                            size="small"
                            checked={pageOn}
                            disabled={!canManage}
                            onChange={(on) => togglePage(group, on)}
                          />
                        </Tooltip>
                      ) : (
                        <Tag>{granted > 0 ? 'granted' : 'not granted'}</Tag>
                      )
                    }
                    style={pageOn ? undefined : { opacity: 0.62 }}
                  >
                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                      {group.permissions.map((permission) => {
                        const isView = permission.key === group.viewKey;
                        // An action is meaningless without the page it lives on,
                        // so it is disabled rather than quietly grantable.
                        const blocked = !isView && !pageOn;

                        return (
                          <Tooltip
                            key={permission.key}
                            title={
                              blocked
                                ? `Turn ${group.label} on first — this action lives on that page`
                                : permission.description
                            }
                            placement="topLeft"
                          >
                            <div>
                              <Checkbox
                                checked={draft.has(permission.key)}
                                disabled={!canManage || blocked}
                                onChange={(event) => toggle(permission.key, event.target.checked)}
                              >
                                <Space size={6} wrap>
                                  <span>{permission.label}</span>
                                  {isView ? <Tag color="blue">opens the page</Tag> : null}
                                  {permission.defaultRoles.length === 0 ? (
                                    <Tag color="purple">Super Admin by default</Tag>
                                  ) : null}
                                  {saved.has(permission.key) !== draft.has(permission.key) ? (
                                    <Tag color={draft.has(permission.key) ? 'green' : 'red'}>
                                      {draft.has(permission.key) ? 'adding' : 'removing'}
                                    </Tag>
                                  ) : null}
                                </Space>
                              </Checkbox>
                            </div>
                          </Tooltip>
                        );
                      })}
                    </Space>
                  </Card>
                </Col>
              );
            })}
          </Row>

          {groups.length === 0 ? <Empty description="No permissions defined" /> : null}

          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Signed in as {user?.fullName} ({user ? ROLE_LABELS[user.role] : ''}). Changes here never
            affect your own access — Super Admin holds everything regardless of what is stored.
          </Typography.Text>
        </>
      ) : null}
    </Space>
  );
}
