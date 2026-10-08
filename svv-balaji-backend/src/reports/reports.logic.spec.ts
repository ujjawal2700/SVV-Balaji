import {
  buildCohorts,
  changePercent,
  csv,
  granularityFor,
  median,
  periodOf,
  periodsBetween,
  previousRange,
  reorderCycle,
} from './reports.logic';

/** An instant at 10:00 IST on the given day. */
const ist = (day: string) => new Date(Date.parse(`${day}T04:30:00.000Z`));

describe('reports.logic', () => {
  describe('periods', () => {
    it('picks day / week / month by range length', () => {
      expect(granularityFor('2026-10-01', '2026-10-31')).toBe('day');
      expect(granularityFor('2026-08-01', '2026-10-31')).toBe('week');
      expect(granularityFor('2026-01-01', '2026-10-31')).toBe('month');
    });

    it('buckets by IST calendar day, not UTC', () => {
      // 23:30 IST on 7 Oct is 18:00 UTC on 7 Oct; 00:30 IST on 8 Oct is 19:00 UTC on 7 Oct.
      expect(periodOf(new Date('2026-10-07T18:00:00.000Z'), 'day')).toBe('2026-10-07');
      expect(periodOf(new Date('2026-10-07T19:00:00.000Z'), 'day')).toBe('2026-10-08');
    });

    it('weeks start on Monday and months are YYYY-MM', () => {
      expect(periodOf(ist('2026-10-08'), 'week')).toBe('2026-10-05'); // Thursday -> Monday
      expect(periodOf(ist('2026-10-05'), 'week')).toBe('2026-10-05');
      expect(periodOf(ist('2026-10-04'), 'week')).toBe('2026-09-28'); // Sunday belongs to the week before
      expect(periodOf(ist('2026-10-08'), 'month')).toBe('2026-10');
    });

    it('lists every bucket so empty periods still show', () => {
      expect(periodsBetween('2026-10-01', '2026-10-03', 'day')).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
      expect(periodsBetween('2026-10-01', '2026-10-14', 'week')).toEqual(['2026-09-28', '2026-10-05', '2026-10-12']);
      expect(periodsBetween('2026-11-15', '2027-02-02', 'month')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    });

    it('previous range is the same length, immediately before', () => {
      expect(previousRange('2026-10-01', '2026-10-31')).toEqual({ from: '2026-08-31', to: '2026-09-30' });
      expect(previousRange('2026-10-08', '2026-10-08')).toEqual({ from: '2026-10-07', to: '2026-10-07' });
    });

    it('change is null with nothing to compare against', () => {
      expect(changePercent(150, 100)).toBe(50);
      expect(changePercent(50, 100)).toBe(-50);
      expect(changePercent(10, 0)).toBeNull();
    });
  });

  describe('cohorts', () => {
    it('groups customers by first-order month and measures who came back', () => {
      const rows = buildCohorts(
        [
          { customerId: 'a', orderDate: ist('2026-08-03') },
          { customerId: 'a', orderDate: ist('2026-09-10') },
          { customerId: 'b', orderDate: ist('2026-08-20') },
          { customerId: 'b', orderDate: ist('2026-10-01') },
          { customerId: 'c', orderDate: ist('2026-09-05') },
          { customerId: 'c', orderDate: ist('2026-09-25') },
        ],
        ist('2026-10-08'),
      );
      expect(rows).toEqual([
        { cohort: '2026-08', customers: 2, retention: [100, 50, 50] },
        { cohort: '2026-09', customers: 1, retention: [100, 0] },
      ]);
    });
  });

  describe('reorder cycle', () => {
    it('averages the gap and flags DUE past it and OVERDUE past 1.5x', () => {
      const dates = [ist('2026-09-01'), ist('2026-09-11'), ist('2026-09-21')]; // every 10 days
      expect(reorderCycle('x', dates, ist('2026-09-28'))).toMatchObject({ avgGapDays: 10, daysSinceLast: 7, state: 'ON_TRACK' });
      expect(reorderCycle('x', dates, ist('2026-10-03'))).toMatchObject({ state: 'DUE' });
      expect(reorderCycle('x', dates, ist('2026-10-07'))).toMatchObject({ state: 'OVERDUE' });
      expect(reorderCycle('x', dates, ist('2026-09-28'))!.expectedNextDate!.toISOString().slice(0, 10)).toBe('2026-10-01');
    });

    it('counts two orders on one day once and leaves a single order without a rhythm', () => {
      expect(reorderCycle('x', [ist('2026-09-01'), ist('2026-09-01')], ist('2026-09-05'))).toMatchObject({
        orders: 2, avgGapDays: null, state: 'ONE_ORDER', daysSinceLast: 4,
      });
    });
  });

  it('median and csv', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(csv([['a', 'b,c'], ['say "hi"', null]])).toBe('a,"b,c"\r\n"say ""hi""",\r\n');
  });
});
