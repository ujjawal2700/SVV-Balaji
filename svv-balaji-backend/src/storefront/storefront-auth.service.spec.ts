import { BadRequestException, ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { StorefrontAuthService } from './storefront-auth.service';
import { SequenceService } from '../common/sequence.service';
import { ReferralService } from '../common/referral.service';

/**
 * The storefront is the first surface in this system where somebody outside
 * the company authenticates. These tests pin the two properties that make
 * that safe: an account cannot be created or signed into without a code that
 * was actually issued and matches, and a B2B registration cannot place an
 * order until staff have approved it - self-service ends at the phone
 * verification, not at the commercial relationship.
 */
describe('StorefrontAuthService', () => {
  let accounts: any[];
  let customers: any[];
  let challenges: any[];
  let referrals: any[];
  let referralSettings: any;
  let coinTransactions: any[];
  let sessions: any[];
  let counters: Record<string, number>;
  let prisma: any;
  let service: StorefrontAuthService;

  const nowPlus = (ms: number) => new Date(Date.now() + ms);

  beforeEach(() => {
    process.env.CUSTOMER_OTP_MODE = 'mock';
    process.env.CUSTOMER_OTP_MOCK_CODE = '123456';
    process.env.CUSTOMER_JWT_ACCESS_SECRET = 'test-customer-access-secret';
    process.env.CUSTOMER_JWT_REFRESH_SECRET = 'test-customer-refresh-secret';
    process.env.JWT_ACCESS_SECRET = 'test-staff-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-staff-refresh-secret';

    accounts = [];
    customers = [];
    challenges = [];
    referrals = [];
    referralSettings = null;
    coinTransactions = [];
    sessions = [];
    counters = {};

    prisma = {
      customerAccount: {
        findUnique: jest.fn(async ({ where }) =>
          accounts.find((a) => a.id === where.id || a.phone === where.phone) ?? null,
        ),
        findFirst: jest.fn(async ({ where }) => {
          return (
            accounts.find((a) => {
              if (where.gstin && a.gstin !== where.gstin) return false;
              if (where.status?.not && a.status === where.status.not) return false;
              return true;
            }) ?? null
          );
        }),
        create: jest.fn(async ({ data }) => {
          const row = { id: `acct-${accounts.length + 1}`, ...data };
          accounts.push(row);
          return row;
        }),
        update: jest.fn(async ({ where, data }) => {
          const row = accounts.find((a) => a.id === where.id);
          Object.assign(row, data);
          return row;
        }),
        updateMany: jest.fn(async ({ where, data }) => {
          accounts.filter((a) => a.id === where.id).forEach((a) => Object.assign(a, data));
          return { count: 1 };
        }),
        findMany: jest.fn(async () => accounts),
      },
      customerOtpChallenge: {
        count: jest.fn(async ({ where }) =>
          challenges.filter((c) => c.phone === where.phone && c.createdAt >= where.createdAt.gte).length,
        ),
        create: jest.fn(async ({ data }) => {
          const row = {
            id: `otp-${challenges.length + 1}`,
            attempts: 0,
            consumedAt: null,
            createdAt: new Date(),
            ...data,
          };
          challenges.push(row);
          return row;
        }),
        findFirst: jest.fn(async ({ where }) =>
          challenges
            .filter((c) => c.phone === where.phone && c.consumedAt === null)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
        ),
        updateMany: jest.fn(async ({ where, data }) => {
          const rows = challenges.filter((c) => c.id === where.id && (where.consumedAt !== null || c.consumedAt === null));
          rows.forEach((r) => Object.assign(r, data));
          return { count: rows.length };
        }),
        update: jest.fn(async ({ where, data }) => {
          const row = challenges.find((c) => c.id === where.id);
          if (data.attempts?.increment !== undefined) {
            row.attempts += data.attempts.increment;
          } else {
            Object.assign(row, data);
          }
          return row;
        }),
      },
      customer: {
        create: jest.fn(async ({ data }) => {
          const row = { id: `cust-${customers.length + 1}`, coinBalance: 0, ...data };
          customers.push(row);
          return row;
        }),
        findFirst: jest.fn(async ({ where }) =>
          customers.find((c) => where.gstin && c.gstin === where.gstin) ?? null,
        ),
        findUnique: jest.fn(async ({ where }) =>
          customers.find((c) => (where.id && c.id === where.id) || (where.referralCode && c.referralCode === where.referralCode)) ?? null,
        ),
        update: jest.fn(async ({ where, data }) => {
          const row = customers.find((c) => c.id === where.id);
          if (!row) return null;
          if (data.coinBalance?.increment) {
            row.coinBalance = (row.coinBalance ?? 0) + data.coinBalance.increment;
          } else {
            Object.assign(row, data);
          }
          return row;
        }),
      },
      referral: {
        create: jest.fn(async ({ data }) => {
          const row = { id: `ref-${referrals.length + 1}`, rewardedAt: null, createdAt: new Date(), ...data };
          referrals.push(row);
          return row;
        }),
        findUnique: jest.fn(async ({ where }) =>
          referrals.find((r) => r.id === where.id || r.refereeId === where.refereeId) ?? null,
        ),
        update: jest.fn(async ({ where, data }) => {
          const row = referrals.find((r) => r.id === where.id);
          Object.assign(row, data);
          return row;
        }),
      },
      referralSettings: {
        findFirst: jest.fn(async () => referralSettings),
        create: jest.fn(async ({ data }) => {
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
        update: jest.fn(async ({ data }) => {
          for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) (referralSettings as any)[key] = value;
          }
          return referralSettings;
        }),
      },
      coinTransaction: {
        create: jest.fn(async ({ data }: any) => {
          const row = { id: `ct-${coinTransactions.length + 1}`, createdAt: new Date(), ...data };
          coinTransactions.push(row);
          return row;
        }),
      },
      sequenceCounter: {
        findUnique: jest.fn(async ({ where }) =>
          counters[where.key] === undefined ? null : { key: where.key, lastNumber: counters[where.key] },
        ),
        create: jest.fn(async ({ data }) => {
          counters[data.key] = data.lastNumber;
        }),
        update: jest.fn(async ({ where, data }) => {
          counters[where.key] = (counters[where.key] ?? 0) + data.lastNumber.increment;
          return { key: where.key, lastNumber: counters[where.key] };
        }),
      },
      customerSession: {
        create: jest.fn(async ({ data }) => {
          const row = { id: `sess-${sessions.length + 1}`, revokedAt: null, ...data };
          sessions.push(row);
          return row;
        }),
        update: jest.fn(async ({ where, data }) => Object.assign(sessions.find((x) => x.id === where.id), data)),
        findUnique: jest.fn(async ({ where }) => {
          const row = sessions.find((x) => x.id === where.id);
          return row ? { ...row, account: accounts.find((a) => a.id === row.accountId) } : null;
        }),
        updateMany: jest.fn(async ({ where, data }) => {
          const rows = sessions.filter((x) => (!where.id || x.id === where.id) && (!where.accountId || x.accountId === where.accountId) && x.revokedAt === null);
          rows.forEach((r) => Object.assign(r, data));
          return { count: rows.length };
        }),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };

    const jwtService = {
      signAsync: jest.fn(async (payload: any) => `signed.${JSON.stringify(payload)}`),
      verifyAsync: jest.fn(async (token: string) => {
        if (!token.startsWith('signed.')) throw new Error('bad token');
        return JSON.parse(token.slice('signed.'.length));
      }),
    };

    service = new StorefrontAuthService(prisma, jwtService as any, new SequenceService(), new ReferralService());
  });

  const requestAndGetCode = async (phone: string) => {
    const res = await service.requestOtp(phone);
    return res.devCode as string;
  };

  describe('phone normalisation', () => {
    it('accepts +91-prefixed, 0-prefixed and bare 10-digit forms as the same number', async () => {
      const code = await requestAndGetCode('+91 91119 66732');
      const session1 = await service.verifyOtp({ phone: '9111966732', code } as any);
      expect((session1 as any).account.phone).toBe('9111966732');

      const code2 = await requestAndGetCode('09111966732');
      await service.verifyOtp({ phone: '9111966732', code: code2 } as any);
      // Same account, not a second one - the second verify signs into acct-1.
      expect(accounts.filter((a) => a.phone === '9111966732')).toHaveLength(1);
    });

    it('rejects a number that is not a valid Indian mobile', async () => {
      await expect(service.requestOtp('12345')).rejects.toThrow(BadRequestException);
      await expect(service.requestOtp('5555555555')).rejects.toThrow(BadRequestException); // starts 5
    });
  });

  describe('OTP verification', () => {
    it('rejects a code that does not match', async () => {
      await service.requestOtp('9111966732');
      await expect(
        service.verifyOtp({ phone: '9111966732', code: '000000' } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a code after it has already been consumed (replay)', async () => {
      const code = await requestAndGetCode('9111966732');
      await service.verifyOtp({ phone: '9111966732', code } as any);
      await expect(
        service.verifyOtp({ phone: '9111966732', code } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an expired challenge', async () => {
      const code = await requestAndGetCode('9111966732');
      challenges[challenges.length - 1].expiresAt = nowPlus(-1000);
      await expect(
        service.verifyOtp({ phone: '9111966732', code } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('locks out after too many wrong attempts even with the right code available', async () => {
      const code = await requestAndGetCode('9111966732');
      for (let i = 0; i < 5; i++) {
        await expect(
          service.verifyOtp({ phone: '9111966732', code: '000000' } as any),
        ).rejects.toThrow(UnauthorizedException);
      }
      await expect(
        service.verifyOtp({ phone: '9111966732', code } as any),
      ).rejects.toThrow(/too many/i);
    });

    it('rate-limits repeated OTP requests for the same number', async () => {
      for (let i = 0; i < 5; i++) await service.requestOtp('9111966732');
      await expect(service.requestOtp('9111966732')).rejects.toThrow(HttpException);
    });
  });

  describe('B2C self-provisioning', () => {
    it('creates an ACTIVE account and a linked Customer on first verified login', async () => {
      const code = await requestAndGetCode('9111966732');
      const session: any = await service.verifyOtp({
        phone: '9111966732',
        code,
        fullName: 'Test Shopper',
      } as any);

      expect(session.accessToken).toBeDefined();
      expect(session.account.channel).toBe('B2C');
      expect(session.account.status).toBe('ACTIVE');
      expect(session.account.customerId).toBeDefined();
      expect(customers).toHaveLength(1);
      expect(customers[0].customerCode).toBe('CUST-B2C-000001');
    });

    it('does not create a second account or customer on a repeat login', async () => {
      const code1 = await requestAndGetCode('9111966732');
      await service.verifyOtp({ phone: '9111966732', code: code1 } as any);

      const code2 = await requestAndGetCode('9111966732');
      await service.verifyOtp({ phone: '9111966732', code: code2 } as any);

      expect(accounts).toHaveLength(1);
      expect(customers).toHaveLength(1);
    });
  });

  describe('B2B retailer registration', () => {
    const registerDto = (over: Partial<any> = {}) => ({
      phone: '9000011111',
      fullName: 'Ramesh Kumar',
      businessName: 'Sri Balaji Provision Store',
      gstin: '29ABCDE1234F1Z5',
      addressLine: '12 Market Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
      ...over,
    });

    it('creates a PENDING_APPROVAL account, not a session, and no Customer yet', async () => {
      const code = await requestAndGetCode('9000011111');
      const result = await service.registerRetailer({ ...registerDto(), code } as any);

      expect(result.status).toBe('PENDING_APPROVAL');
      expect(accounts).toHaveLength(1);
      expect(accounts[0].customerId).toBeUndefined();
      expect(customers).toHaveLength(0);
    });

    it('refuses an invalid GSTIN', async () => {
      const code = await requestAndGetCode('9000011111');
      await expect(
        service.registerRetailer({ ...registerDto({ gstin: 'not-a-gstin' }), code } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('a pending retailer cannot sign in - gets a pending message, not a token', async () => {
      const code1 = await requestAndGetCode('9000011111');
      await service.registerRetailer({ ...registerDto(), code: code1 } as any);

      const code2 = await requestAndGetCode('9000011111');
      const attempt: any = await service.verifyOtp({ phone: '9000011111', code: code2 } as any);

      expect(attempt.pending).toBe(true);
      expect(attempt.accessToken).toBeUndefined();
    });

    it('approval creates the Customer record and lets the account sign in', async () => {
      const code1 = await requestAndGetCode('9000011111');
      await service.registerRetailer({ ...registerDto(), code: code1 } as any);

      const approved: any = await service.approveAccount(accounts[0].id, 'staff-user-1');
      expect(approved.status).toBe('ACTIVE');
      expect(approved.customerId).toBeDefined();
      expect(customers[0].customerCode).toBe('CUST-B2B-000001');
      expect(customers[0].type).toBe('RETAILER');

      const code2 = await requestAndGetCode('9000011111');
      const session: any = await service.verifyOtp({ phone: '9000011111', code: code2 } as any);
      expect(session.accessToken).toBeDefined();
      expect(session.account.channel).toBe('B2B');
    });

    it('a rejected account cannot sign in and the reason is surfaced', async () => {
      const code1 = await requestAndGetCode('9000011111');
      await service.registerRetailer({ ...registerDto(), code: code1 } as any);
      await service.rejectAccount(accounts[0].id, 'staff-user-1', { reason: 'GSTIN mismatch' } as any);

      const code2 = await requestAndGetCode('9000011111');
      await expect(
        service.verifyOtp({ phone: '9000011111', code: code2 } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses to approve twice', async () => {
      const code = await requestAndGetCode('9000011111');
      await service.registerRetailer({ ...registerDto(), code } as any);
      await service.approveAccount(accounts[0].id, 'staff-user-1');
      await expect(service.approveAccount(accounts[0].id, 'staff-user-1')).rejects.toThrow(BadRequestException);
    });

    it('refuses two retailers sharing the same GSTIN', async () => {
      const code1 = await requestAndGetCode('9000011111');
      await service.registerRetailer({ ...registerDto(), code: code1 } as any);

      const code2 = await requestAndGetCode('9222233334');
      await expect(
        service.registerRetailer({ ...registerDto({ phone: '9222233334' }), code: code2 } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('referrals', () => {
    it('every new customer gets a unique referral code, B2C and B2B alike', async () => {
      const code1 = await requestAndGetCode('9111966732');
      await service.verifyOtp({ phone: '9111966732', code: code1 } as any);

      const code2 = await requestAndGetCode('9000011111');
      await service.registerRetailer({
        phone: '9000011111',
        fullName: 'Ramesh Kumar',
        businessName: 'Sri Balaji Provision Store',
        gstin: '29ABCDE1234F1Z5',
        addressLine: '12 Market Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
        code: code2,
      } as any);
      await service.approveAccount(accounts[1].id, 'staff-user-1');

      expect(customers[0].referralCode).toEqual(expect.any(String));
      expect(customers[1].referralCode).toEqual(expect.any(String));
      expect(customers[0].referralCode).not.toBe(customers[1].referralCode);
    });

    it('a valid code creates a Referral row linking referrer and referee on B2C signup', async () => {
      const code1 = await requestAndGetCode('9111111111');
      await service.verifyOtp({ phone: '9111111111', code: code1, fullName: 'First Shopper' } as any);
      const referrerCode = customers[0].referralCode;

      const code2 = await requestAndGetCode('9222222222');
      await service.verifyOtp({
        phone: '9222222222',
        code: code2,
        fullName: 'Second Shopper',
        referralCode: referrerCode,
      } as any);

      expect(referrals).toHaveLength(1);
      expect(referrals[0].referrerId).toBe(customers[0].id);
      expect(referrals[0].refereeId).toBe(customers[1].id);
    });

    it('an unknown referral code fails the whole sign-in rather than silently dropping it', async () => {
      const code = await requestAndGetCode('9222222222');
      await expect(
        service.verifyOtp({ phone: '9222222222', code, referralCode: 'DOESNOTEXIST' } as any),
      ).rejects.toThrow(BadRequestException);

      // Nothing half-created: no account, no customer.
      expect(accounts).toHaveLength(0);
      expect(customers).toHaveLength(0);
    });

    it('cannot refer yourself - a code whose phone matches the applicant is rejected', async () => {
      // A Customer row with this phone already exists (however it got
      // there - staff-entered, or approved earlier) and holds its own
      // referral code. Nothing prevents that same phone from later going
      // through the B2B signup form and typing that exact code in.
      customers.push({
        id: 'cust-existing',
        phone: '9000011111',
        email: null,
        status: 'ACTIVE',
        referralCode: 'OWNCODE1',
      });

      const code = await requestAndGetCode('9000011111');
      await expect(
        service.registerRetailer({
          phone: '9000011111',
          fullName: 'Ramesh Kumar',
          businessName: 'Sri Balaji Provision Store',
          gstin: '29ABCDE1234F1Z5',
          addressLine: '12 Market Road',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560001',
          referralCode: 'OWNCODE1',
          code,
        } as any),
      ).rejects.toThrow(/own referral code/);
    });

    it('B2B validates the code at registration submission, before anything is created', async () => {
      const code = await requestAndGetCode('9000011111');
      await expect(
        service.registerRetailer({
          phone: '9000011111',
          fullName: 'Ramesh Kumar',
          businessName: 'Sri Balaji Provision Store',
          gstin: '29ABCDE1234F1Z5',
          addressLine: '12 Market Road',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560001',
          referralCode: 'DOESNOTEXIST',
          code,
        } as any),
      ).rejects.toThrow(BadRequestException);

      expect(accounts).toHaveLength(0);
    });

    it('B2B creates the Referral relationship on approval, from the code stored at registration', async () => {
      const referrerCode1 = await requestAndGetCode('9111111111');
      await service.verifyOtp({ phone: '9111111111', code: referrerCode1, fullName: 'Referrer Shopper' } as any);
      const referrerCode = customers[0].referralCode;

      const code = await requestAndGetCode('9000011111');
      await service.registerRetailer({
        phone: '9000011111',
        fullName: 'Ramesh Kumar',
        businessName: 'Sri Balaji Provision Store',
        gstin: '29ABCDE1234F1Z5',
        addressLine: '12 Market Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
        referralCode: referrerCode,
        code,
      } as any);

      expect(referrals).toHaveLength(0); // not yet - only submitted, not approved

      await service.approveAccount(accounts[1].id, 'staff-user-1');

      expect(referrals).toHaveLength(1);
      expect(referrals[0].referrerId).toBe(customers[0].id);
      expect(referrals[0].refereeId).toBe(customers[1].id);
    });

    it('approval still succeeds if the stored referrer is no longer valid - the referral is skipped, not the approval', async () => {
      const code = await requestAndGetCode('9000011111');
      await service.registerRetailer({
        phone: '9000011111',
        fullName: 'Ramesh Kumar',
        businessName: 'Sri Balaji Provision Store',
        gstin: '29ABCDE1234F1Z5',
        addressLine: '12 Market Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
        code,
      } as any);
      // Simulate a code that was valid at submission but no longer resolves
      // by the time staff get to it (referrer deleted their account, code
      // typo'd past what live-check would catch, etc).
      accounts[0].referralCode = 'GONE0000';

      const approved: any = await service.approveAccount(accounts[0].id, 'staff-user-1');
      expect(approved.status).toBe('ACTIVE');
      expect(referrals).toHaveLength(0);
    });

    describe('reward crediting', () => {
      it('credits both sides on a B2C signup under the default settings (REGISTRATION trigger)', async () => {
        const code1 = await requestAndGetCode('9111111111');
        await service.verifyOtp({ phone: '9111111111', code: code1, fullName: 'First Shopper' } as any);
        const referrerCode = customers[0].referralCode;

        const code2 = await requestAndGetCode('9222222222');
        await service.verifyOtp({
          phone: '9222222222',
          code: code2,
          fullName: 'Second Shopper',
          referralCode: referrerCode,
        } as any);

        expect(customers[0].coinBalance).toBe(100);
        expect(customers[1].coinBalance).toBe(50);
        expect(referrals[0].rewardedAt).not.toBeNull();
        expect(coinTransactions).toHaveLength(2);
      });

      it('does not credit anything when the trigger is set to an order-based event', async () => {
        referralSettings = {
          id: 'rs-1',
          referrerRewardCoins: 100,
          refereeRewardCoins: 50,
          rewardTrigger: 'FIRST_ORDER',
          isActive: true,
          createdAt: new Date(),
        };

        const code1 = await requestAndGetCode('9111111111');
        await service.verifyOtp({ phone: '9111111111', code: code1, fullName: 'First Shopper' } as any);
        const referrerCode = customers[0].referralCode;

        const code2 = await requestAndGetCode('9222222222');
        await service.verifyOtp({
          phone: '9222222222',
          code: code2,
          fullName: 'Second Shopper',
          referralCode: referrerCode,
        } as any);

        expect(customers[0].coinBalance).toBe(0);
        expect(referrals[0].rewardedAt).toBeNull();
      });

      it('credits both sides on B2B approval under the default settings', async () => {
        const referrerCode1 = await requestAndGetCode('9111111111');
        await service.verifyOtp({ phone: '9111111111', code: referrerCode1, fullName: 'Referrer Shopper' } as any);
        const referrerCode = customers[0].referralCode;

        const code = await requestAndGetCode('9000011111');
        await service.registerRetailer({
          phone: '9000011111',
          fullName: 'Ramesh Kumar',
          businessName: 'Sri Balaji Provision Store',
          gstin: '29ABCDE1234F1Z5',
          addressLine: '12 Market Road',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560001',
          referralCode: referrerCode,
          code,
        } as any);

        expect(customers[0].coinBalance).toBe(0); // not yet - only submitted, not approved

        await service.approveAccount(accounts[1].id, 'staff-user-1');

        expect(customers[0].coinBalance).toBe(100);
        expect(customers[1].coinBalance).toBe(50);
      });

      it('does not credit while the program is switched off', async () => {
        referralSettings = {
          id: 'rs-1',
          referrerRewardCoins: 100,
          refereeRewardCoins: 50,
          rewardTrigger: 'REGISTRATION',
          isActive: false,
          createdAt: new Date(),
        };

        const code1 = await requestAndGetCode('9111111111');
        await service.verifyOtp({ phone: '9111111111', code: code1, fullName: 'First Shopper' } as any);
        const referrerCode = customers[0].referralCode;

        // The program being off is also caught earlier, at code validation -
        // this confirms the signup itself is refused, not merely un-rewarded.
        const code2 = await requestAndGetCode('9222222222');
        await expect(
          service.verifyOtp({
            phone: '9222222222',
            code: code2,
            fullName: 'Second Shopper',
            referralCode: referrerCode,
          } as any),
        ).rejects.toThrow(/not currently active/);

        expect(customers[0].coinBalance).toBe(0);
      });
    });
  });

  describe('token isolation from the staff session', () => {
    it('signs the access token with the customer secret, not the staff one', async () => {
      const code = await requestAndGetCode('9111966732');
      const session: any = await service.verifyOtp({ phone: '9111966732', code } as any);

      const decoded = JSON.parse(session.accessToken.slice('signed.'.length));
      expect(decoded.typ).toBe('customer');
    });
  });

  describe('OTP hashing', () => {
    it('never stores the OTP code in plaintext', async () => {
      await service.requestOtp('9111966732');
      const stored = challenges[challenges.length - 1];
      expect(stored.codeHash).not.toBe('123456');
      expect(await bcrypt.compare('123456', stored.codeHash)).toBe(true);
    });
  });
  describe('audience separation, sessions and one-time referral', () => {
    const login = async (phone: string, extra: Record<string, unknown> = {}, audience = 'CUSTOMER') => {
      const code = await requestAndGetCode(phone);
      return service.verifyOtp({ phone, code, audience, ...extra } as any) as Promise<any>;
    };

    it('customer sign-in creates the account on first verify and flags it new', async () => {
      const first = await login('9333333331');
      expect(first.isNewAccount).toBe(true);
      const again = await login('9333333331');
      expect(again.isNewAccount).toBe(false);
      expect(customers).toHaveLength(1);
    });

    it('a referral code is honoured on first verify only - never again on later logins', async () => {
      await login('9333333331', { fullName: 'Referrer' });
      const referrerCode = customers[0].referralCode;

      await login('9333333332', { referralCode: referrerCode });
      expect(referrals).toHaveLength(1);

      // Existing customer logging in again WITH a code (even a valid one, even the same one): ignored.
      const again = await login('9333333332', { referralCode: referrerCode });
      expect(again.isNewAccount).toBe(false);
      expect(referrals).toHaveLength(1);

      // Even a garbage code on an existing account is not validated, so it cannot fail the login.
      await expect(login('9333333332', { referralCode: 'DOESNOTEXIST' })).resolves.toBeDefined();
      expect(referrals).toHaveLength(1);
    });

    it('retailer login never creates an account for an unknown number', async () => {
      const code = await requestAndGetCode('9333333340');
      await expect(
        service.verifyOtp({ phone: '9333333340', code, audience: 'RETAILER' } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(accounts).toHaveLength(0);
    });

    it('a customer number cannot sign in as a retailer and a retailer number cannot sign in as a customer', async () => {
      await login('9333333331');
      await expect(service.requestOtp('9333333331', 'RETAILER')).rejects.toThrow(ForbiddenException);

      accounts.push({ id: 'acct-r', phone: '9333333350', channel: 'B2B', status: 'ACTIVE', fullName: 'R', customerId: null });
      await expect(service.requestOtp('9333333350', 'CUSTOMER')).rejects.toThrow(ForbiddenException);
      const code = await requestAndGetCode('9333333350');
      await expect(
        service.verifyOtp({ phone: '9333333350', code, audience: 'CUSTOMER' } as any),
      ).rejects.toThrow(ForbiddenException);
      // ...and the wrong-door attempt did not burn the code.
      await expect(
        service.verifyOtp({ phone: '9333333350', code, audience: 'RETAILER' } as any),
      ).resolves.toBeDefined();
    });

    it('login creates a server-side session that the tokens point at; logout revokes it', async () => {
      const s = await login('9333333331');
      expect(sessions).toHaveLength(1);
      expect(JSON.parse(s.accessToken.slice('signed.'.length)).sid).toBe(sessions[0].id);
      await service.logout(sessions[0].id);
      expect(sessions[0].revokedAt).toBeInstanceOf(Date);
      await expect(service.refresh(s.refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('refresh rotates within the same session; replaying an old refresh token kills the session', async () => {
      const s = await login('9333333331');
      // The mocked signer is deterministic, so make the second token differ.
      (service as any).jwtService.signAsync.mockImplementation(async (p: any, o: any) => `signed.${JSON.stringify({ ...p, n: Math.random() })}`);
      const rotated: any = await service.refresh(s.refreshToken);
      expect(sessions).toHaveLength(1);
      expect(rotated.refreshToken).not.toBe(s.refreshToken);
      await expect(service.refresh(s.refreshToken)).rejects.toThrow(UnauthorizedException);
      expect(sessions[0].revokedAt).toBeInstanceOf(Date);
    });

    it('logout-all ends every device session', async () => {
      await login('9333333331');
      await login('9333333331');
      expect(sessions).toHaveLength(2);
      const r = await service.logoutAll(accounts[0].id);
      expect(r.sessionsEnded).toBe(2);
    });
  });
});
