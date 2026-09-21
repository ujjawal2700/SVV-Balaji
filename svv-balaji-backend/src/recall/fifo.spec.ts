import { fifoViolations } from './fifo';

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const batch = (n: string, mfg: string, exp: string | null) => ({
  fgBatchNumber: n,
  manufacturingDate: D(mfg),
  expiryDate: exp ? D(exp) : null,
});

describe('fifoViolations', () => {
  const shipped = batch('FG-B', '2026-08-10', '2027-02-10');

  it('is empty when nothing older is still on the shelf', () => {
    expect(fifoViolations(shipped, [batch('FG-C', '2026-09-01', '2027-03-01')])).toEqual([]);
  });

  it('flags an older batch that was skipped, oldest first', () => {
    const a = batch('FG-A', '2026-08-01', '2027-02-01');
    const older = batch('FG-Z', '2026-07-01', '2027-01-01');
    expect(fifoViolations(shipped, [a, older]).map((b) => b.fgBatchNumber)).toEqual(['FG-Z', 'FG-A']);
  });

  it('ignores the shipped batch itself', () => {
    expect(fifoViolations(shipped, [shipped])).toEqual([]);
  });

  it('ranks a batch with no expiry as newest, like the allocator', () => {
    expect(fifoViolations(shipped, [batch('FG-N', '2026-01-01', null)])).toEqual([]);
    expect(fifoViolations(batch('FG-N', '2026-01-01', null), [shipped])).toHaveLength(1);
  });
});
