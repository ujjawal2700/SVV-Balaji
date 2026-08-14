import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The session lifecycle is an auth boundary, so the tests here lock down the
 * properties that make it one rather than just the happy path:
 *
 *   - a refresh token is spendable exactly once (rotation)
 *   - replaying a spent token ends the session rather than reissuing
 *   - logout genuinely invalidates the refresh token, not just the client copy
 *   - a signature alone is never sufficient - the stored hash must match too
 */
describe('AuthService - session lifecycle', () => {
  const ACCESS_SECRET = 'test_access_secret';
  const REFRESH_SECRET = 'test_refresh_secret';

  let users: Record<string, any>;
  let prisma: any;
  let jwt: any;
  let service: AuthService;
  let tokenCounter: number;

  /**
   * Stand-in for JwtService. Tokens are `<secret>.<sub>.<nonce>` - enough to
   * exercise signature checking and rotation without pulling in real JWT
   * signing, and the nonce guarantees each issued token is distinct.
   */
  const makeJwt = () => ({
    signAsync: jest.fn(async (payload: any, opts: any) => {
      tokenCounter += 1;
      return `${opts.secret}.${payload.sub}.${tokenCounter}`;
    }),
    verifyAsync: jest.fn(async (token: string, opts: any) => {
      const [secret, sub] = token.split('.');
      if (secret !== opts.secret) throw new Error('invalid signature');
      return { sub, email: users[sub]?.email, role: users[sub]?.role, branchId: null };
    }),
  });

  beforeEach(async () => {
    process.env.JWT_ACCESS_SECRET = ACCESS_SECRET;
    process.env.JWT_REFRESH_SECRET = REFRESH_SECRET;
    tokenCounter = 0;

    users = {
      'user-1': {
        id: 'user-1',
        email: 'admin@svvbalaji.com',
        passwordHash: await bcrypt.hash('ChangeMe@123', 4),
        fullName: 'Super Admin',
        phone: null,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        branchId: null,
        branch: null,
        refreshTokenHash: null,
        createdAt: new Date(),
      },
    };

    prisma = {
      user: {
        findUnique: jest.fn(async ({ where }: any) => {
          if (where.id) return users[where.id] ?? null;
          return Object.values(users).find((u: any) => u.email === where.email) ?? null;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          users[where.id] = { ...users[where.id], ...data };
          return users[where.id];
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          if (users[where.id]) users[where.id] = { ...users[where.id], ...data };
          return { count: 1 };
        }),
      },
    };

    const mockPermissions = {
      listFor: jest.fn().mockResolvedValue(['DASHBOARD_VIEW']),
    };

    jwt = makeJwt();
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt,
      mockPermissions as any,
    );
  });

  const login = () => service.login({ email: 'admin@svvbalaji.com', password: 'ChangeMe@123' });

  describe('login', () => {
    it('returns an access and refresh token for valid credentials', async () => {
      const result = await login();
      expect(result.accessToken).toContain(ACCESS_SECRET);
      expect(result.refreshToken).toContain(REFRESH_SECRET);
      expect(result.user).toMatchObject({ id: 'user-1', role: 'SUPER_ADMIN' });
    });

    it('never leaks the password hash', async () => {
      const result = await login();
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user).not.toHaveProperty('refreshTokenHash');
    });

    it('stores a HASH of the refresh token, not the token itself', async () => {
      const result = await login();
      const stored = users['user-1'].refreshTokenHash;
      expect(stored).toBeTruthy();
      expect(stored).not.toEqual(result.refreshToken);
      await expect(bcrypt.compare(result.refreshToken, stored)).resolves.toBe(true);
    });

    it('rejects a wrong password', async () => {
      await expect(
        service.login({ email: 'admin@svvbalaji.com', password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a user who is not ACTIVE', async () => {
      users['user-1'].status = 'SUSPENDED';
      await expect(login()).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('exchanges a valid refresh token for a new pair', async () => {
      const first = await login();
      const second = await service.refresh({ refreshToken: first.refreshToken });

      expect(second.accessToken).toContain(ACCESS_SECRET);
      expect(second.refreshToken).toContain(REFRESH_SECRET);
      expect(second.refreshToken).not.toEqual(first.refreshToken);
    });

    it('rotates: the token just used cannot be spent a second time', async () => {
      const first = await login();
      await service.refresh({ refreshToken: first.refreshToken });

      await expect(service.refresh({ refreshToken: first.refreshToken })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('ends the session entirely when a rotated-away token is replayed', async () => {
      const first = await login();
      const second = await service.refresh({ refreshToken: first.refreshToken });

      // Replaying the spent token is either theft or a broken client. Either
      // way the current session dies with it.
      await expect(service.refresh({ refreshToken: first.refreshToken })).rejects.toThrow();
      expect(users['user-1'].refreshTokenHash).toBeNull();

      await expect(service.refresh({ refreshToken: second.refreshToken })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a token signed with the access secret', async () => {
      const session = await login();
      await expect(
        service.refresh({ refreshToken: session.accessToken }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a well-formed token once the user has logged out', async () => {
      const session = await login();
      await service.logout('user-1');

      await expect(
        service.refresh({ refreshToken: session.refreshToken }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a token for a user who has since been suspended', async () => {
      const session = await login();
      users['user-1'].status = 'SUSPENDED';

      await expect(
        service.refresh({ refreshToken: session.refreshToken }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('clears the stored refresh hash', async () => {
      await login();
      expect(users['user-1'].refreshTokenHash).toBeTruthy();

      await service.logout('user-1');
      expect(users['user-1'].refreshTokenHash).toBeNull();
    });

    it('is idempotent', async () => {
      await login();
      await service.logout('user-1');
      await expect(service.logout('user-1')).resolves.toEqual({ success: true });
    });
  });

  describe('me', () => {
    it('returns role and branch for navigation, and no secrets', async () => {
      const profile: any = await service.me('user-1');

      expect(profile).toMatchObject({
        id: 'user-1',
        email: 'admin@svvbalaji.com',
        role: 'SUPER_ADMIN',
      });
      expect(profile).not.toHaveProperty('passwordHash');
      expect(profile).not.toHaveProperty('refreshTokenHash');
    });

    it('refuses a user who is no longer active', async () => {
      users['user-1'].status = 'INACTIVE';
      await expect(service.me('user-1')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
