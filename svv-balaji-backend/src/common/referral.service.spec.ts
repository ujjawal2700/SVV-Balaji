import { BadRequestException } from '@nestjs/common';
import { ReferralService } from './referral.service';

/**
 * The refer-a-friend rules: a code must exist, belong to someone currently
 * active, and never be usable against its own owner - by phone or, when both
 * sides have one, by email. Nothing here checks IP or device, deliberately -
 * see referral.service.ts.
 */
describe('ReferralService', () => {
  let customers: any[];
  let referrals: any[];
  let referralSettings: any;
  let coinTransactions: any[];
  let orders: any[];
  let tx: any;
  let service: ReferralService;

  const stringMatch = (value: string | null | undefined, needle: string, mode?: string) => {
    if (!value) return false;
    return mode === 'insensitive'
      ? value.toLowerCase().includes(needle.toLowerCase())
      : value.includes(needle);
  };

  /** Interprets exactly the where-shapes this file's own methods produce - not a general Prisma emulator. */
  const personMatches = (person: any, clause: any): boolean =>
    clause.OR.some((cond: any) => {
      const [field] = Object.keys(cond);
      const filter = cond[field];
      return stringMatch(person[field], filter.contains, filter.mode);
    });

  beforeEach(() => {
    customers = [];
    referrals = [];
    referralSettings = null;
    coinTransactions = [];
    orders = [];
    tx = {
      customer: {
        findUnique: jest.fn(async ({ where }: any) =>
          customers.find(
            (c) => (where.id && c.id === where.id) || (where.referralCode && c.referralCode === where.referralCode),
          ) ?? null,
        ),
        update: jest.fn(async ({ where, data }: any) => {
          const row = customers.find((c) => c.id === where.id);
          if (!row) return null;
          if (data.coinBalance?.increment !== undefined) {
            row.coinBalance = (row.coinBalance ?? 0) + data.coinBalance.increment;
          } else {
            Object.assign(row, data);
          }
          return row;
        }),
      },
      referral: {
        create: jest.fn(async ({ data }: any) => {
          const row = { id: `ref-${referrals.length + 1}`, rewardedAt: null, createdAt: new Date(), ...data };
          referrals.push(row);
          return row;
        }),
        findUnique: jest.fn(async ({ where }: any) =>
          referrals.find((r) => r.id === where.id || r.refereeId === where.refereeId) ?? null,
        ),
        update: jest.fn(async ({ where, data }: any) => {
          const row = referrals.find((r) => r.id === where.id);
          Object.assign(row, data);
          return row;
        }),
        findMany: jest.fn(async ({ where }: any = {}) => {
          let rows = referrals;
          if (where?.rewardedAt === null) rows = rows.filter((r) => r.rewardedAt === null);
          if (where?.rewardedAt?.not === null) rows = rows.filter((r) => r.rewardedAt !== null);
          if (where?.createdAt?.gte) rows = rows.filter((r) => r.createdAt >= where.createdAt.gte);
          if (where?.createdAt?.lte) rows = rows.filter((r) => r.createdAt <= where.createdAt.lte);
          if (where?.referee?.channel) {
            rows = rows.filter((r) => customers.find((c) => c.id === r.refereeId)?.channel === where.referee.channel);
          }
          if (where?.OR) {
            rows = rows.filter((r) => {
              const referrer = customers.find((c) => c.id === r.referrerId);
              const referee = customers.find((c) => c.id === r.refereeId);
              return where.OR.some((cond: any) =>
                cond.referrer ? personMatches(referrer, cond.referrer) : personMatches(referee, cond.referee),
              );
            });
          }
          return rows.map((r) => ({
            ...r,
            referrer: customers.find((c) => c.id === r.referrerId) ?? null,
            referee: customers.find((c) => c.id === r.refereeId) ?? null,
            coinTransactions: coinTransactions
              .filter((t) => t.referralId === r.id)
              .map((t) => ({ ...t, order: orders.find((o) => o.id === t.orderId) ?? null })),
          }));
        }),
      },
      referralSettings: {
        findFirst: jest.fn(async () => referralSettings),
        create: jest.fn(async ({ data }: any) => {
          referralSettings = {
            id: 'rs-1',
            referrerRewardCoins: 100,
            refereeRewardCoins: 50,
            rewardTrigger: 'REGISTRATION',
            isActive: true,
            createdAt: new Date(),
            ...data,
          };
          return referralSettings;
        }),
        update: jest.fn(async ({ data }: any) => {
          // Prisma treats an explicit `undefined` in `data` as "don't touch
          // this field", unlike Object.assign - filter it out to match.
          for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) referralSettings[key] = value;
          }
          return referralSettings;
        }),
      },
      coinTransaction: {
        create: jest.fn(async ({ data }: any) => {
          const row = { id: `ct-${coinTransactions.length + 1}`, note: null, createdAt: new Date(), ...data };
          coinTransactions.push(row);
          return row;
        }),
        findMany: jest.fn(async ({ where }: any) =>
          coinTransactions
            .filter((t) => t.customerId === where.customerId)
            .map((t) => ({
              ...t,
              referral: referrals.find((r) => r.id === t.referralId)
                ? {
                    ...referrals.find((r) => r.id === t.referralId),
                    referrer: customers.find((c) => c.id === referrals.find((r) => r.id === t.referralId)?.referrerId) ?? null,
                    referee: customers.find((c) => c.id === referrals.find((r) => r.id === t.referralId)?.refereeId) ?? null,
                  }
                : null,
              order: orders.find((o) => o.id === t.orderId) ?? null,
              performedBy: null,
            }))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
        ),
      },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    service = new ReferralService();
  });

  const addCustomer = (over: Partial<any> = {}) => {
    const row = {
      id: `cust-${customers.length + 1}`,
      status: 'ACTIVE',
      phone: '9000000001',
      channel: 'B2C',
      coinBalance: 0,
      email: null,
      referralCode: null,
      ...over,
    };
    customers.push(row);
    return row;
  };

  describe('generateCode', () => {
    it('derives a code from the seed name plus a random 4-digit suffix', async () => {
      const code = await service.generateCode(tx, 'Raunak Khanam');
      expect(code).toMatch(/^RAUNAKKH\d{4}$/);
    });

    it('retries on a collision instead of returning a duplicate', async () => {
      let calls = 0;
      tx.customer.findUnique = jest.fn(async () => {
        calls += 1;
        return calls === 1 ? { id: 'existing', referralCode: 'CLASH' } : null;
      });
      const code = await service.generateCode(tx, 'Anyone');
      expect(code).toBeDefined();
      expect(calls).toBeGreaterThan(1);
    });

    it('falls back to a generic prefix when the name has no letters', async () => {
      const code = await service.generateCode(tx, '123 456');
      expect(code).toMatch(/^MEMBER\d{4}$/);
    });
  });

  describe('validate', () => {
    it('resolves an active customer by their code', async () => {
      const referrer = addCustomer({ referralCode: 'RAUNAK1234', phone: '9000000001' });
      const result = await service.validate(tx, 'RAUNAK1234', { phone: '9111111111' });
      expect(result.id).toBe(referrer.id);
    });

    it('is case-insensitive on the code', async () => {
      addCustomer({ referralCode: 'RAUNAK1234', phone: '9000000001' });
      const result = await service.validate(tx, 'raunak1234', { phone: '9111111111' });
      expect(result.referralCode).toBe('RAUNAK1234');
    });

    it('rejects a code that does not exist', async () => {
      await expect(service.validate(tx, 'NOPE0000', { phone: '9111111111' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a blank code', async () => {
      await expect(service.validate(tx, '   ', { phone: '9111111111' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a code belonging to an inactive or blacklisted customer', async () => {
      addCustomer({ referralCode: 'OLDCODE1', phone: '9000000001', status: 'BLACKLISTED' });
      await expect(service.validate(tx, 'OLDCODE1', { phone: '9111111111' })).rejects.toThrow(
        /not currently active/,
      );
    });

    it('rejects self-referral by phone', async () => {
      addCustomer({ referralCode: 'SELF0001', phone: '9111111111' });
      await expect(service.validate(tx, 'SELF0001', { phone: '9111111111' })).rejects.toThrow(
        /own referral code/,
      );
    });

    it('rejects self-referral by email when phones differ but the email matches', async () => {
      addCustomer({ referralCode: 'SELF0002', phone: '9000000001', email: 'same@example.com' });
      await expect(
        service.validate(tx, 'SELF0002', { phone: '9111111111', email: 'same@example.com' }),
      ).rejects.toThrow(/own referral code/);
    });

    it('matches email case-insensitively', async () => {
      addCustomer({ referralCode: 'SELF0003', phone: '9000000001', email: 'Same@Example.com' });
      await expect(
        service.validate(tx, 'SELF0003', { phone: '9111111111', email: 'same@example.com' }),
      ).rejects.toThrow(/own referral code/);
    });

    it('does not flag two different people who both happen to have no email on file', async () => {
      addCustomer({ referralCode: 'NOEMAIL1', phone: '9000000001', email: null });
      const result = await service.validate(tx, 'NOEMAIL1', { phone: '9111111111', email: null });
      expect(result.referralCode).toBe('NOEMAIL1');
    });

    it('rejects any code while the program is switched off, before even checking the code', async () => {
      addCustomer({ referralCode: 'RAUNAK1234', phone: '9000000001' });
      referralSettings = {
        id: 'rs-1',
        referrerRewardCoins: 100,
        refereeRewardCoins: 50,
        rewardTrigger: 'REGISTRATION',
        isActive: false,
        createdAt: new Date(),
      };
      await expect(service.validate(tx, 'RAUNAK1234', { phone: '9111111111' })).rejects.toThrow(
        /not currently active/,
      );
    });
  });

  describe('createRelationship', () => {
    it('records the relationship with the code as entered, uppercased', async () => {
      const referrer = addCustomer({ referralCode: 'RAUNAK1234' });
      await service.createRelationship(tx, referrer as any, 'cust-referee', 'raunak1234');
      expect(referrals).toHaveLength(1);
      expect(referrals[0]).toMatchObject({
        referrerId: referrer.id,
        refereeId: 'cust-referee',
        code: 'RAUNAK1234',
      });
    });
  });

  describe('settings', () => {
    it('lazily creates the default row on first read - 100/50 coins, REGISTRATION trigger, active', async () => {
      const settings = await service.getSettings(tx);
      expect(settings).toMatchObject({
        referrerRewardCoins: 100,
        refereeRewardCoins: 50,
        rewardTrigger: 'REGISTRATION',
        isActive: true,
      });
      // A second read finds the same row rather than creating another.
      const again = await service.getSettings(tx);
      expect(again.id).toBe(settings.id);
      expect(tx.referralSettings.create).toHaveBeenCalledTimes(1);
    });

    it('updates only the fields given, by staff, on the existing row', async () => {
      await service.getSettings(tx); // seed the default row
      const updated = await service.updateSettings(
        tx,
        { referrerRewardCoins: 200, rewardTrigger: 'FIRST_DELIVERY' as any },
        'staff-user-1',
      );
      expect(updated.referrerRewardCoins).toBe(200);
      expect(updated.rewardTrigger).toBe('FIRST_DELIVERY');
      expect(updated.refereeRewardCoins).toBe(50); // untouched
    });

    it('refuses a negative reward amount', async () => {
      await expect(
        service.updateSettings(tx, { referrerRewardCoins: -10 }, 'staff-user-1'),
      ).rejects.toThrow(/cannot be negative/);
      await expect(
        service.updateSettings(tx, { refereeRewardCoins: -1 }, 'staff-user-1'),
      ).rejects.toThrow(/cannot be negative/);
    });
  });

  describe('listReferrals (Super Admin reporting)', () => {
    const setUpQualifiedReferral = () => {
      const referrer = addCustomer({ name: 'Raunak Khanam', phone: '9111111111', referralCode: 'RAUNAK1234', channel: 'B2C' });
      const referee = addCustomer({ name: 'Anita Rao', phone: '9222222222', channel: 'B2C' });
      const referral = {
        id: 'ref-1',
        referrerId: referrer.id,
        refereeId: referee.id,
        code: 'RAUNAK1234',
        rewardedAt: new Date('2026-09-10'),
        createdAt: new Date('2026-09-09'),
      };
      referrals.push(referral);
      const order = { id: 'ord-1', orderNumber: 'SO-20260910-001', status: 'CONFIRMED', total: 1890 };
      orders.push(order);
      coinTransactions.push(
        { id: 'ct-1', customerId: referrer.id, amount: 100, reason: 'REFERRAL_REFERRER_REWARD', referralId: referral.id, orderId: order.id, createdAt: new Date() },
        { id: 'ct-2', customerId: referee.id, amount: 50, reason: 'REFERRAL_REFEREE_REWARD', referralId: referral.id, orderId: order.id, createdAt: new Date() },
      );
      return { referrer, referee, referral, order };
    };

    it('returns each relationship with both sides, coin amounts and the qualifying order', async () => {
      const { referrer, referee, order } = setUpQualifiedReferral();

      const rows = await service.listReferrals(tx, {});

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        qualified: true,
        referrerCoins: 100,
        refereeCoins: 50,
      });
      expect(rows[0].referrer.id).toBe(referrer.id);
      expect(rows[0].referee.id).toBe(referee.id);
      expect(rows[0].qualifyingOrder?.orderNumber).toBe(order.orderNumber);
    });

    it('a referral with no reward yet is pending, with zero coins and no order', async () => {
      const referrer = addCustomer({ name: 'Someone', referralCode: 'CODE0001' });
      const referee = addCustomer({ name: 'New Signup', phone: '9333333333' });
      referrals.push({ id: 'ref-2', referrerId: referrer.id, refereeId: referee.id, code: 'CODE0001', rewardedAt: null, createdAt: new Date() });

      const rows = await service.listReferrals(tx, {});

      expect(rows[0].qualified).toBe(false);
      expect(rows[0].referrerCoins).toBe(0);
      expect(rows[0].qualifyingOrder).toBeNull();
    });

    it('filters to only qualified or only pending', async () => {
      setUpQualifiedReferral();
      const referrer2 = addCustomer({ name: 'Second Referrer', referralCode: 'CODE0002' });
      const referee2 = addCustomer({ name: 'Second Referee', phone: '9444444444' });
      referrals.push({ id: 'ref-2', referrerId: referrer2.id, refereeId: referee2.id, code: 'CODE0002', rewardedAt: null, createdAt: new Date() });

      const qualified = await service.listReferrals(tx, { status: 'QUALIFIED' });
      const pending = await service.listReferrals(tx, { status: 'PENDING' });

      expect(qualified).toHaveLength(1);
      expect(qualified[0].qualified).toBe(true);
      expect(pending).toHaveLength(1);
      expect(pending[0].qualified).toBe(false);
    });

    it('search matches by referee even when the term is not the referrer', async () => {
      setUpQualifiedReferral(); // referrer "Raunak Khanam", referee "Anita Rao"

      const rows = await service.listReferrals(tx, { search: 'anita' });

      expect(rows).toHaveLength(1);
      expect(rows[0].referee.name).toBe('Anita Rao');
    });

    it('search matches a referral code too', async () => {
      setUpQualifiedReferral();
      const rows = await service.listReferrals(tx, { search: 'RAUNAK1234' });
      expect(rows).toHaveLength(1);
    });

    it('search with no match returns nothing', async () => {
      setUpQualifiedReferral();
      const rows = await service.listReferrals(tx, { search: 'nobody-like-this' });
      expect(rows).toHaveLength(0);
    });
  });

  describe('getCoinLedger', () => {
    it('reports the running balance, total earned, and every transaction newest first', async () => {
      const customer = addCustomer({ name: 'Raunak Khanam', coinBalance: 130 });
      coinTransactions.push(
        { id: 'ct-1', customerId: customer.id, amount: 100, reason: 'REFERRAL_REFERRER_REWARD', referralId: 'ref-1', orderId: null, createdAt: new Date('2026-09-10') },
        { id: 'ct-2', customerId: customer.id, amount: -20, reason: 'MANUAL_ADJUSTMENT', note: 'Goodwill deduction', referralId: null, orderId: null, createdAt: new Date('2026-09-11') },
        { id: 'ct-3', customerId: customer.id, amount: 50, reason: 'MANUAL_ADJUSTMENT', note: 'Bonus', referralId: null, orderId: null, createdAt: new Date('2026-09-12') },
      );

      const ledger = await service.getCoinLedger(tx, customer.id);

      expect(ledger.balance).toBe(130);
      expect(ledger.totalEarned).toBe(150); // 100 + 50, the -20 is not "earned"
      expect(ledger.totalAdjusted).toBe(30); // -20 + 50
      expect(ledger.transactions.map((t: any) => t.id)).toEqual(['ct-3', 'ct-2', 'ct-1']); // newest first
    });

    it('throws for an unknown customer', async () => {
      await expect(service.getCoinLedger(tx, 'nope')).rejects.toThrow(/not found/i);
    });
  });

  describe('adjustBalance', () => {
    it('credits a positive adjustment and records who made it', async () => {
      const customer = addCustomer({ coinBalance: 100 });

      const txn = await service.adjustBalance(tx, customer.id, { amount: 50, note: 'Goodwill bonus' }, 'staff-1');

      expect(customer.coinBalance).toBe(150);
      expect(txn.reason).toBe('MANUAL_ADJUSTMENT');
      expect(txn.performedById).toBe('staff-1');
      expect(txn.note).toBe('Goodwill bonus');
    });

    it('debits a negative adjustment (a reversal)', async () => {
      const customer = addCustomer({ coinBalance: 100 });
      await service.adjustBalance(tx, customer.id, { amount: -30, note: 'Order cancelled as fraudulent' }, 'staff-1');
      expect(customer.coinBalance).toBe(70);
    });

    it('refuses to take the balance below zero', async () => {
      const customer = addCustomer({ coinBalance: 20 });
      await expect(
        service.adjustBalance(tx, customer.id, { amount: -50, note: 'Too much' }, 'staff-1'),
      ).rejects.toThrow(/below zero/);
      expect(customer.coinBalance).toBe(20); // unchanged
    });

    it('refuses a zero amount', async () => {
      const customer = addCustomer({ coinBalance: 20 });
      await expect(
        service.adjustBalance(tx, customer.id, { amount: 0, note: 'Nothing' }, 'staff-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a blank reason', async () => {
      const customer = addCustomer({ coinBalance: 20 });
      await expect(
        service.adjustBalance(tx, customer.id, { amount: 10, note: '   ' }, 'staff-1'),
      ).rejects.toThrow(/reason is required/);
    });

    it('throws for an unknown customer', async () => {
      await expect(
        service.adjustBalance(tx, 'nope', { amount: 10, note: 'test' }, 'staff-1'),
      ).rejects.toThrow(/not found/i);
    });
  });
});
