import { GiftOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Card, Col, InputNumber, Radio, Row, Skeleton, Switch, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { ReferralRewardTrigger } from '@shared/api/types';
import { REFERRAL_REWARD_TRIGGERS, REFERRAL_REWARD_TRIGGER_LABELS } from '@shared/api/types';
import { useCan } from '@shared/auth/useCan';
import { PageHeader } from '@shared/components/PageHeader';
import { useReferralSettings, useUpdateReferralSettings } from '@shared/hooks/useReferralSettings';

interface Draft {
  referrerRewardCoins: number;
  refereeRewardCoins: number;
  rewardTrigger: ReferralRewardTrigger;
  isActive: boolean;
}

/**
 * The one screen behind the refer-a-friend program: how many coins each side
 * earns, which lifecycle event credits them, and the program-wide kill
 * switch. See svv-balaji-backend/src/common/referral.service.ts for how a
 * change here applies live to referrals already in flight, not only ones
 * created after saving.
 */
export function ReferralSettingsPage() {
  const { message } = AntApp.useApp();
  const canManage = useCan('REFERRAL_SETTINGS_MANAGE');

  const settings = useReferralSettings();
  const update = useUpdateReferralSettings();

  const [draft, setDraft] = useState<Draft | null>(null);

  // Reset the draft whenever fresh data lands - on first load, and again
  // after a save (the mutation writes the response straight into the query
  // cache, which re-runs this effect with the server's own values).
  useEffect(() => {
    if (!settings.data) return;
    setDraft({
      referrerRewardCoins: settings.data.referrerRewardCoins,
      refereeRewardCoins: settings.data.refereeRewardCoins,
      rewardTrigger: settings.data.rewardTrigger,
      isActive: settings.data.isActive,
    });
  }, [settings.data]);

  const dirty =
    draft !== null &&
    settings.data !== undefined &&
    (draft.referrerRewardCoins !== settings.data.referrerRewardCoins ||
      draft.refereeRewardCoins !== settings.data.refereeRewardCoins ||
      draft.rewardTrigger !== settings.data.rewardTrigger ||
      draft.isActive !== settings.data.isActive);

  const handleSave = async () => {
    if (!draft) return;
    try {
      await update.mutateAsync(draft);
      message.success('Referral settings saved');
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not save referral settings'), 8);
    }
  };

  return (
    <Card>
      <PageHeader
        title="Referral & Reward Settings"
        subtitle="How many coins each side earns for a successful referral, and when they're credited. Applies live to every referral going forward, including ones already waiting on a different trigger."
      />

      {settings.isLoading || !draft ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <div style={{ maxWidth: 640 }}>
          <section style={{ marginBottom: 32 }}>
            <Typography.Title level={5}>1. Referral Reward</Typography.Title>
            <Row gutter={[24, 16]}>
              <Col xs={24} sm={12}>
                <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  Referrer Reward
                </Typography.Text>
                <InputNumber
                  size="large"
                  min={0}
                  step={1}
                  precision={0}
                  addonAfter="Coins"
                  style={{ width: '100%' }}
                  disabled={!canManage}
                  value={draft.referrerRewardCoins}
                  onChange={(value) =>
                    setDraft((d) => (d ? { ...d, referrerRewardCoins: value ?? 0 } : d))
                  }
                />
              </Col>
              <Col xs={24} sm={12}>
                <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  Referred User Reward
                </Typography.Text>
                <InputNumber
                  size="large"
                  min={0}
                  step={1}
                  precision={0}
                  addonAfter="Coins"
                  style={{ width: '100%' }}
                  disabled={!canManage}
                  value={draft.refereeRewardCoins}
                  onChange={(value) =>
                    setDraft((d) => (d ? { ...d, refereeRewardCoins: value ?? 0 } : d))
                  }
                />
              </Col>
            </Row>
          </section>

          <section style={{ marginBottom: 32 }}>
            <Typography.Title level={5}>2. Reward Trigger</Typography.Title>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              When coins are credited to both sides.
            </Typography.Text>
            <Radio.Group
              disabled={!canManage}
              value={draft.rewardTrigger}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, rewardTrigger: e.target.value } : d))
              }
            >
              <Row gutter={[8, 12]}>
                {REFERRAL_REWARD_TRIGGERS.map((trigger) => (
                  <Col xs={24} key={trigger}>
                    <Radio value={trigger}>{REFERRAL_REWARD_TRIGGER_LABELS[trigger]}</Radio>
                  </Col>
                ))}
              </Row>
            </Radio.Group>
          </section>

          <section style={{ marginBottom: 32 }}>
            <Typography.Title level={5}>3. Status</Typography.Title>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Switch
                checked={draft.isActive}
                disabled={!canManage}
                onChange={(checked) => setDraft((d) => (d ? { ...d, isActive: checked } : d))}
              />
              <Typography.Text>
                Referral Program {draft.isActive ? 'Active' : 'Paused'}
              </Typography.Text>
            </div>
            {!draft.isActive && (
              <Typography.Text type="warning" style={{ display: 'block', marginTop: 8 }}>
                While paused, no new referral code can be entered at signup and nothing already
                waiting on a trigger will be credited.
              </Typography.Text>
            )}
          </section>

          {canManage && (
            <Button
              type="primary"
              size="large"
              icon={<GiftOutlined />}
              loading={update.isPending}
              disabled={!dirty}
              onClick={() => void handleSave()}
            >
              Save Changes
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
