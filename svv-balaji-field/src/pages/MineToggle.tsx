import { Segmented, Typography } from 'antd';
import { useState } from 'react';

/**
 * "Mine" versus "Everyone", shared by the three list tabs.
 *
 * Defaults to mine, because a field executive opening this panel wants their
 * own day, not the branch's. Being able to see everyone's is still worth
 * having — a Branch Manager uses the same screens, and an executive covering
 * for a colleague needs to see what was already done.
 *
 * Filtering happens client-side because the list endpoints take `farmerId`
 * only. That is fine at today's volumes and becomes wrong the moment A-12
 * lands: filtering one page rather than the whole set would silently
 * under-report. An `expertId` filter on those endpoints is the proper fix.
 */
export function useMineFilter(initial = true) {
  const [mineOnly, setMineOnly] = useState(initial);
  return { mineOnly, setMineOnly };
}

export function MineToggle({
  mineOnly,
  onChange,
  total,
  shown,
}: {
  mineOnly: boolean;
  onChange: (mineOnly: boolean) => void;
  total: number;
  shown: number;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Segmented
        size="small"
        value={mineOnly ? 'mine' : 'all'}
        onChange={(value) => onChange(value === 'mine')}
        options={[
          { label: 'Mine', value: 'mine' },
          { label: 'Everyone', value: 'all' },
        ]}
      />
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {mineOnly ? `${shown} of ${total}` : `${total}`}
      </Typography.Text>
    </div>
  );
}
