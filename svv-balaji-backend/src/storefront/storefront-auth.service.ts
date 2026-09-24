import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  CustomerAccount,
  CustomerAccountStatus,
  CustomerOtpPurpose,
  CustomerStatus,
  CustomerType,
  PaymentTerms,
  SalesChannel,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/sequence.service';
import { ReferralService } from '../common/referral.service';
import {
  AuthAudience,
  RegisterRetailerDto,
  RejectAccountDto,
  UpdateStorefrontProfileDto,
  VerifyOtpDto,
} from './dto/storefront-auth.dto';
import { normalisePhone, maskPhone } from './phone.util';
import {
  OTP_MAX_ATTEMPTS,
  OTP_MAX_REQUESTS_PER_WINDOW,
  OTP_REQUEST_WINDOW_SECONDS,
  OTP_TTL_SECONDS,
  generateOtpCode,
  resolveOtpMode,
  warnIfMockMode,
} from './otp.config';
import {
  CUSTOMER_ACCESS_EXPIRES_IN,
  CUSTOMER_REFRESH_EXPIRES_IN,
  customerAccessSecret,
  customerRefreshSecret,
} from './customer-token.config';
import type { CustomerJwtPayload } from './strategies/customer-jwt.strategy';

/** Where a sign-in came from - stored on the session so a person can see and end their devices. */
export interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Refresh tokens are stored as SHA-256, not bcrypt: bcrypt only reads the first 72 bytes, and a JWT's
 * first 72 bytes are the constant header plus the start of the payload - identical for every token of
 * the same session - so a bcrypt hash could not tell a rotated token from the current one.
 */
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const tokenMatches = (token: string, hash: string) => {
  const a = Buffer.from(hashToken(token));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** Mirrors CUSTOMER_REFRESH_EXPIRES_IN ('30d' by default) so the DB row and the token expire together. */
function refreshLifetimeMs(): number {
  const m = /^(\d+)([smhd])$/.exec(CUSTOMER_REFRESH_EXPIRES_IN);
  if (!m) return 30 * DAY_MS;
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: DAY_MS }[m[2] as 's' | 'm' | 'h' | 'd'];
  return Number(m[1]) * unit;
}

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * Every field on CustomerAccount a staff screen may see - explicitly not
 * `refreshTokenHash`. A bcrypt hash is not the token itself, but it has no
 * business leaving the database in a list response either.
 */
const ACCOUNT_STAFF_SELECT = {
  id: true,
  phone: true,
  email: true,
  fullName: true,
  channel: true,
  status: true,
  phoneVerifiedAt: true,
  lastLoginAt: true,
  customerId: true,
  businessName: true,
  gstin: true,
  pan: true,
  addressLine: true,
  city: true,
  district: true,
  state: true,
  pincode: true,
  reviewedById: true,
  reviewedAt: true,
  rejectionReason: true,
  /** The code this applicant entered at signup, if any - see ReferralService. */
  referralCode: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { id: true, customerCode: true, referralCode: true } },
} as const;

/**
 * Storefront identity: OTP sign-in for consumers, a reviewed registration for
 * retailers. Deliberately separate from AuthService (src/auth) - see
 * customer-token.config.ts for why the token signing key must not be shared,
 * and prisma/schema.prisma's storefront-identity block for why login
 * (CustomerAccount) and the commercial record (Customer) are two tables.
 */
@Injectable()
export class StorefrontAuthService {
  private readonly logger = new Logger(StorefrontAuthService.name);
  private readonly otpMode = resolveOtpMode();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly sequence: SequenceService,
    private readonly referrals: ReferralService,
  ) {
    warnIfMockMode(this.otpMode, this.logger);
  }

  // --- OTP --------------------------------------------------------------

  /**
   * Issues a challenge for a phone number regardless of whether an account
   * exists yet - not existing is exactly the state a first-time consumer is
   * in, and the account is created on successful verification, not before.
   */
  async requestOtp(rawPhone: string, audience?: AuthAudience) {
    const phone = normalisePhone(rawPhone);

    const windowStart = new Date(Date.now() - OTP_REQUEST_WINDOW_SECONDS * 1000);
    const recentCount = await this.prisma.customerOtpChallenge.count({
      where: { phone, createdAt: { gte: windowStart } },
    });
    if (recentCount >= OTP_MAX_REQUESTS_PER_WINDOW) {
      throw new HttpException(
        'Too many codes requested for this number. Try again in a few minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const account = await this.prisma.customerAccount.findUnique({ where: { phone } });
    if (audience && account) this.assertAudience(account, audience);
    const purpose: CustomerOtpPurpose = account
      ? CustomerOtpPurpose.LOGIN
      : CustomerOtpPurpose.REGISTRATION;

    const code = generateOtpCode(this.otpMode);
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

    await this.prisma.customerOtpChallenge.create({
      data: { phone, codeHash, purpose, expiresAt, accountId: account?.id },
    });

    // A real SMS provider is not procured yet (A-11-shaped decision, see
    // otp.config.ts) - this is where its `send()` call goes, guarded by the
    // same `this.otpMode === 'sms'` branch. In mock mode the code is handed
    // back in the response instead, so the storefront can sign in end to end
    // against a real session without a vendor account.
    this.logger.log(`OTP requested for ${maskPhone(phone)} (${purpose})`);

    return {
      phone,
      purpose,
      ttlSeconds: OTP_TTL_SECONDS,
      mode: this.otpMode,
      ...(this.otpMode === 'mock' ? { devCode: code } : {}),
    };
  }

  /**
   * Universal login: an unknown phone self-provisions as a B2C consumer (there
   * is nothing to approve - a consumer is not a credit relationship). A known
   * phone signs in as whatever it already is; channel and status are read from
   * the account, never chosen by the caller, which is the "role decided by the
   * server, not a toggle" requirement this replaces.
   */
  async verifyOtp(dto: VerifyOtpDto, meta: SessionMeta = {}) {
    const phone = normalisePhone(dto.phone);
    const existingBefore = await this.prisma.customerAccount.findUnique({ where: { phone } });

    // Audience is checked BEFORE the code is consumed: a wrong-door attempt must not burn the OTP,
    // and a retailer login must never fall through to creating a consumer.
    if (existingBefore) this.assertAudience(existingBefore, dto.audience);
    else if (dto.audience === 'RETAILER') {
      throw new ForbiddenException('No retailer account exists for this number. Register your business first.');
    }

    await this.consumeChallenge(phone, dto.code);

    let account = existingBefore;
    let isNewAccount = false;

    if (!account) {
      // First successful verification of an unknown number - the only moment a customer is created,
      // and therefore the only moment a referral code is looked at.
      account = await this.provisionConsumer(phone, dto.fullName, dto.referralCode);
      isNewAccount = true;
    } else if (account.status === CustomerAccountStatus.PENDING_VERIFICATION) {
      account = await this.prisma.customerAccount.update({
        where: { id: account.id },
        data: { phoneVerifiedAt: new Date(), status: CustomerAccountStatus.ACTIVE },
      });
      // A consumer left half-created (no Customer row yet) is completed here - that IS its creation.
      if (account.channel === SalesChannel.B2C && !account.customerId) {
        account = await this.attachConsumerCustomerRecord(account, dto.referralCode);
        isNewAccount = true;
      }
    }
    // Any other existing account: strictly a login. dto.referralCode is neither validated nor stored.

    const session = await this.sessionFor(account, meta, { touchLogin: true });
    return 'pending' in session ? session : { ...session, isNewAccount };
  }

  /** A retailer number cannot sign in on the customer screen, and a customer number cannot on the retailer one. */
  private assertAudience(account: CustomerAccount, audience: AuthAudience) {
    if (audience === 'CUSTOMER' && account.channel === SalesChannel.B2B) {
      throw new ForbiddenException('This number is registered as a retailer. Use the retailer sign-in.');
    }
    if (audience === 'RETAILER' && account.channel !== SalesChannel.B2B) {
      throw new ForbiddenException('This number is registered as a customer, not a retailer.');
    }
  }

  /**
   * A retailer's signup. Verifies the same OTP challenge type used for login,
   * then stores the business details as PENDING_APPROVAL - no session, no
   * Customer row, no credit terms, until staff review the GSTIN and approve.
   */
  async registerRetailer(dto: RegisterRetailerDto & { code: string }) {
    const phone = normalisePhone(dto.phone);
    await this.consumeChallenge(phone, dto.code);

    const gstin = dto.gstin.trim().toUpperCase();
    if (!GSTIN_PATTERN.test(gstin)) {
      throw new BadRequestException(
        `"${gstin}" is not a valid GSTIN - expected 15 characters, e.g. 29ABCDE1234F1Z5`,
      );
    }

    const existing = await this.prisma.customerAccount.findUnique({ where: { phone } });
    if (existing && existing.status !== CustomerAccountStatus.PENDING_VERIFICATION) {
      throw new BadRequestException(
        existing.status === CustomerAccountStatus.PENDING_APPROVAL
          ? 'This number already has a registration awaiting review.'
          : 'This number already has an account. Sign in instead of registering again.',
      );
    }

    const gstinClash = await this.prisma.customerAccount.findFirst({
      where: { gstin, status: { not: CustomerAccountStatus.REJECTED } },
    });
    if (gstinClash) {
      throw new BadRequestException(`GSTIN ${gstin} is already registered.`);
    }

    // Validated now, immediately, so a typo is caught while the applicant is
    // still on the form - not re-validated by consuming anything, so this can
    // safely reject without having touched CustomerOtpChallenge or written a
    // row. The relationship itself is only created on approval (see
    // approveAccount), which is the actual "successful registration" for a
    // channel with a review gate.
    let referralCode: string | undefined;
    if (dto.referralCode) {
      await this.referrals.validate(this.prisma, dto.referralCode, { phone, email: dto.email });
      referralCode = dto.referralCode.trim().toUpperCase();
    }

    const data = {
      phone,
      email: undefined,
      fullName: dto.fullName,
      channel: SalesChannel.B2B,
      status: CustomerAccountStatus.PENDING_APPROVAL,
      phoneVerifiedAt: new Date(),
      businessName: dto.businessName,
      gstin,
      pan: dto.pan?.trim().toUpperCase(),
      addressLine: dto.addressLine,
      city: dto.city,
      district: dto.district,
      state: dto.state,
      pincode: dto.pincode,
      referralCode,
    };

    const account = existing
      ? await this.prisma.customerAccount.update({ where: { id: existing.id }, data })
      : await this.prisma.customerAccount.create({ data });

    this.logger.log(`Retailer registration submitted: ${account.businessName} (${maskPhone(phone)})`);

    return {
      status: account.status,
      message: 'Registration submitted. You can sign in once it has been reviewed.',
    };
  }

  private async consumeChallenge(phone: string, code: string) {
    const challenge = await this.prisma.customerOtpChallenge.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      throw new UnauthorizedException('Request a new code - none is active for this number.');
    }
    if (challenge.expiresAt < new Date()) {
      throw new UnauthorizedException('This code has expired. Request a new one.');
    }
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedException('Too many incorrect attempts. Request a new code.');
    }

    const matches = await bcrypt.compare(code, challenge.codeHash);
    if (!matches) {
      await this.prisma.customerOtpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Incorrect code.');
    }

    // Single use, even under a double-submit: only the request that flips consumedAt from null wins.
    const claimed = await this.prisma.customerOtpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new UnauthorizedException('This code was already used. Request a new one.');
    }

    return challenge;
  }

  private async provisionConsumer(phone: string, fullName?: string, referralCode?: string) {
    // Validated here, before anything is created - this account is about to
    // be created ACTIVE with phoneVerifiedAt already set (there is no
    // approval gate on B2C), unlike the PENDING_VERIFICATION repair path
    // below, which can safely retry. If a bad code were only caught inside
    // attachConsumerCustomerRecord's transaction, the CustomerAccount row
    // created just before it would already exist as ACTIVE with no
    // customerId and no way for a retry to reach the attachment branch again
    // - a permanently broken account. Failing before that row exists avoids
    // creating it at all.
    if (referralCode) {
      await this.referrals.validate(this.prisma, referralCode, { phone });
    }

    const account = await this.prisma.customerAccount.create({
      data: {
        phone,
        fullName: fullName?.trim() || `Customer ${phone.slice(-4)}`,
        channel: SalesChannel.B2C,
        status: CustomerAccountStatus.ACTIVE,
        phoneVerifiedAt: new Date(),
      },
    });
    return this.attachConsumerCustomerRecord(account, referralCode);
  }

  /**
   * Every verified B2C login gets a Customer row immediately - there is no
   * approval gate on this channel, and the sales module (allocation, pricing,
   * traceability) is written against Customer, not CustomerAccount.
   *
   * A referral code is validated (and, if bad, rejected) *before* the
   * customer row is created - this is the only moment a B2C signup happens,
   * so unlike the B2B path there is no later "best effort" pass. A typo here
   * fails the whole sign-in rather than silently dropping the referral,
   * because the point of validating at all is that the applicant is present
   * to fix it.
   */
  private async attachConsumerCustomerRecord(account: CustomerAccount, referralCode?: string) {
    const { updated, referred } = await this.prisma.$transaction(async (tx) => {
      const referrer = referralCode
        ? await this.referrals.validate(tx, referralCode, { phone: account.phone, email: account.email })
        : null;

      const customerCode = await this.sequence.nextInSeries(tx, 'CUST-B2C');
      const code = await this.referrals.generateCode(tx, account.fullName);

      const customer = await tx.customer.create({
        data: {
          customerCode,
          referralCode: code,
          channel: SalesChannel.B2C,
          type: CustomerType.CONSUMER,
          name: account.fullName,
          phone: account.phone,
          email: account.email,
          billingAddress: account.addressLine ?? 'Not provided',
          paymentTerms: PaymentTerms.PREPAID,
          status: CustomerStatus.ACTIVE,
        },
      });

      if (referrer) {
        await this.referrals.createRelationship(tx, referrer, customer.id, referralCode!);
      }

      const updated = await tx.customerAccount.update({
        where: { id: account.id },
        data: { customerId: customer.id },
      });

      return { updated, referred: Boolean(referrer) };
    });

    // Deliberately outside the transaction above and best-effort: a bug in
    // reward crediting must never undo a consumer's sign-in. See
    // ReferralService's note on why these three trigger methods take the
    // real PrismaService rather than a nested tx.
    if (referred) {
      await this.referrals.onAccountVerified(this.prisma, updated.customerId!).catch((err) => {
        this.logger.warn(`Referral reward check failed for new customer ${updated.customerId}: ${err instanceof Error ? err.message : String(err)}`);
      });
    }

    return updated;
  }

  // --- Session ------------------------------------------------------------

  private async sessionFor(
    account: CustomerAccount,
    meta: SessionMeta,
    opts: { touchLogin?: boolean; reuseSessionId?: string } = {},
  ) {
    if (account.status === CustomerAccountStatus.PENDING_APPROVAL) {
      return {
        pending: true as const,
        status: account.status,
        message: 'Your registration is awaiting approval. You will be able to sign in once it is reviewed.',
      };
    }
    if (account.status === CustomerAccountStatus.REJECTED) {
      throw new ForbiddenException(
        account.rejectionReason
          ? `Registration was not approved: ${account.rejectionReason}`
          : 'Registration was not approved.',
      );
    }
    if (account.status !== CustomerAccountStatus.ACTIVE) {
      throw new ForbiddenException('This account has been suspended.');
    }

    const expiresAt = new Date(Date.now() + refreshLifetimeMs());
    // The row is created (or, on refresh, reused) first so its id can ride in both tokens.
    const sessionId =
      opts.reuseSessionId ??
      (
        await this.prisma.customerSession.create({
          data: {
            accountId: account.id,
            refreshTokenHash: 'pending',
            userAgent: meta.userAgent?.slice(0, 300),
            ipAddress: meta.ipAddress?.slice(0, 64),
            expiresAt,
          },
          select: { id: true },
        })
      ).id;

    const payload: CustomerJwtPayload = {
      sub: account.id,
      phone: account.phone,
      channel: account.channel,
      typ: 'customer',
      customerId: account.customerId,
      sid: sessionId,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: customerAccessSecret(),
      expiresIn: CUSTOMER_ACCESS_EXPIRES_IN,
      jwtid: randomUUID(),
    });
    // A unique jti makes every rotated token distinct even within the same second (same iat), which
    // is what lets a replayed old refresh token be told apart from the current one.
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: customerRefreshSecret(),
      expiresIn: CUSTOMER_REFRESH_EXPIRES_IN,
      jwtid: randomUUID(),
    });

    await this.prisma.customerSession.update({
      where: { id: sessionId },
      data: {
        refreshTokenHash: hashToken(refreshToken),
        lastUsedAt: new Date(),
      },
    });
    if (opts.touchLogin) {
      await this.prisma.customerAccount.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });
    }

    // Fetched separately rather than carried on `account` so the very first response already carries
    // the customer's own referral code.
    const customer = account.customerId
      ? await this.prisma.customer.findUnique({
          where: { id: account.customerId },
          select: { id: true, customerCode: true, status: true, referralCode: true },
        })
      : null;

    return {
      accessToken,
      refreshToken,
      account: this.toPublicAccount(account, customer),
    };
  }

  async refresh(refreshToken: string) {
    let payload: CustomerJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<CustomerJwtPayload>(refreshToken, {
        secret: customerRefreshSecret(),
      });
    } catch {
      throw new UnauthorizedException('Session is no longer valid - sign in again');
    }
    if (payload.typ !== 'customer' || !payload.sid) {
      throw new UnauthorizedException('Session is no longer valid - sign in again');
    }

    const session = await this.prisma.customerSession.findUnique({
      where: { id: payload.sid },
      include: { account: true },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.accountId !== payload.sub) {
      throw new UnauthorizedException('Session is no longer valid - sign in again');
    }

    const matches = tokenMatches(refreshToken, session.refreshTokenHash);
    if (!matches) {
      // An already-rotated refresh token being replayed: assume it leaked and end the session.
      await this.revokeSession(session.id, 'refresh token reuse');
      throw new UnauthorizedException('Session is no longer valid - sign in again');
    }

    return this.sessionFor(session.account, {}, { reuseSessionId: session.id });
  }

  private revokeSession(sessionId: string, reason: string) {
    return this.prisma.customerSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** Ends THIS device's session. The access token stops working on the very next request. */
  async logout(sessionId: string) {
    await this.revokeSession(sessionId, 'logout');
    return { success: true };
  }

  /**
   * Logout that still works when the access token has already expired: any token of the session,
   * even an expired one, is enough to name the session - signature is verified, expiry is not.
   * Idempotent, and never reveals whether the token was good.
   */
  async logoutWithTokens(tokens: { refreshToken?: string; accessToken?: string }) {
    const attempts: Array<[string | undefined, string]> = [
      [tokens.refreshToken, customerRefreshSecret()],
      [tokens.accessToken, customerAccessSecret()],
    ];
    for (const [token, secret] of attempts) {
      if (!token) continue;
      try {
        const p = await this.jwtService.verifyAsync<CustomerJwtPayload>(token, { secret, ignoreExpiration: true });
        if (p.typ === 'customer' && p.sid) await this.revokeSession(p.sid, 'logout');
      } catch {
        // not a token of ours - nothing to revoke
      }
    }
    return { success: true };
  }

  /** Ends every session of the account (all devices). */
  async logoutAll(accountId: string) {
    const r = await this.prisma.customerSession.updateMany({
      where: { accountId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'logout-all' },
    });
    return { success: true, sessionsEnded: r.count };
  }

  async me(accountId: string) {
    const account = await this.prisma.customerAccount.findUnique({
      where: { id: accountId },
      include: { customer: { select: { id: true, customerCode: true, status: true, referralCode: true } } },
    });
    if (!account) throw new UnauthorizedException('Session is no longer valid - sign in again');
    return { ...this.toPublicAccount(account, account.customer), ...(await this.profileExtras(account)) };
  }

  /** Real profile facts only: when they joined, their saved address, and (retailers) their credit position. */
  private async profileExtras(account: CustomerAccount) {
    const base = {
      memberSince: account.createdAt,
      addressLine: account.addressLine,
      city: account.city,
      state: account.state,
      pincode: account.pincode,
      creditLimit: null as number | null,
      creditUsed: null as number | null,
    };
    if (!account.customerId || account.channel !== SalesChannel.B2B) return base;

    const [customer, open] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: account.customerId }, select: { creditLimit: true } }),
      this.prisma.order.aggregate({
        where: {
          customerId: account.customerId,
          paymentMode: 'CREDIT',
          paymentStatus: { not: 'PAID' },
          status: { not: 'CANCELLED' },
        },
        _sum: { total: true },
      }),
    ]);
    return {
      ...base,
      creditLimit: customer?.creditLimit ? Number(customer.creditLimit) : 0,
      creditUsed: Number(open._sum.total ?? 0),
    };
  }

  async updateProfile(accountId: string, dto: UpdateStorefrontProfileDto) {
    const account = await this.prisma.customerAccount.update({
      where: { id: accountId },
      data: { fullName: dto.fullName, email: dto.email },
    });
    return this.toPublicAccount(account);
  }

  private toPublicAccount(
    account: CustomerAccount,
    customer?: { id: string; customerCode: string; status: string; referralCode: string } | null,
  ) {
    return {
      id: account.id,
      phone: account.phone,
      fullName: account.fullName,
      email: account.email,
      channel: account.channel,
      status: account.status,
      customerId: account.customerId,
      customer,
      /** The code this person can share to refer someone else - null until they have a Customer row. */
      referralCode: customer?.referralCode ?? null,
      businessName: account.businessName,
      gstin: account.gstin,
    };
  }

  // --- Staff review (retailer approval queue) ------------------------------

  async listAccounts(filters: { channel?: SalesChannel; search?: string }) {
    return this.prisma.customerAccount.findMany({
      where: {
        channel: filters.channel,
        OR: filters.search
          ? [
              { fullName: { contains: filters.search, mode: 'insensitive' } },
              { businessName: { contains: filters.search, mode: 'insensitive' } },
              { phone: { contains: filters.search } },
              { gstin: { contains: filters.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      orderBy: { createdAt: 'desc' },
      select: ACCOUNT_STAFF_SELECT,
    });
  }

  async getAccount(id: string) {
    const account = await this.prisma.customerAccount.findUnique({ where: { id }, select: ACCOUNT_STAFF_SELECT });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  async approveAccount(id: string, reviewerId: string) {
    const account = await this.prisma.customerAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Account not found');
    if (account.status !== CustomerAccountStatus.PENDING_APPROVAL) {
      throw new BadRequestException(`Only a pending registration can be approved - this one is ${account.status}`);
    }
    if (!account.gstin || !account.businessName || !account.addressLine) {
      throw new BadRequestException('Registration is missing required business details');
    }

    const gstinClash = await this.prisma.customer.findFirst({
      where: { gstin: account.gstin, status: { not: CustomerStatus.INACTIVE } },
    });
    if (gstinClash) {
      throw new BadRequestException(
        `GSTIN ${account.gstin} is already registered to ${gstinClash.name} (${gstinClash.customerCode})`,
      );
    }

    const { updated, referred } = await this.prisma.$transaction(async (tx) => {
      const customerCode = await this.sequence.nextInSeries(tx, 'CUST-B2B');
      const referralCode = await this.referrals.generateCode(tx, account.businessName!);

      const customer = await tx.customer.create({
        data: {
          customerCode,
          referralCode,
          channel: SalesChannel.B2B,
          type: CustomerType.RETAILER,
          name: account.businessName!,
          contactName: account.fullName,
          phone: account.phone,
          email: account.email,
          gstin: account.gstin,
          billingAddress: account.addressLine!,
          city: account.city,
          district: account.district,
          state: account.state,
          pincode: account.pincode,
          paymentTerms: PaymentTerms.PREPAID,
          status: CustomerStatus.ACTIVE,
        },
      });

      let referred = false;
      if (account.referralCode) {
        try {
          const referrer = await this.referrals.validate(tx, account.referralCode, {
            phone: account.phone,
            email: account.email,
          });
          await this.referrals.createRelationship(tx, referrer, customer.id, account.referralCode);
          referred = true;
        } catch (err) {
          // Best-effort only: the referrer may have gone inactive, been
          // blacklisted, or the whole program been switched off in the time
          // this application sat in the queue. That must not block approving
          // an otherwise-legitimate business - only the referral credit is
          // lost, and it's worth knowing that happened.
          this.logger.warn(
            `Referral code "${account.referralCode}" on approved account ${account.id} no longer resolves: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      const updated = await tx.customerAccount.update({
        where: { id: account.id },
        data: {
          status: CustomerAccountStatus.ACTIVE,
          customerId: customer.id,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
        },
        select: ACCOUNT_STAFF_SELECT,
      });

      return { updated, referred };
    });

    // Outside the transaction and best-effort, same reasoning as the B2C
    // path in attachConsumerCustomerRecord - a reward-crediting bug must
    // never undo an approval.
    if (referred && updated.customerId) {
      await this.referrals.onAccountVerified(this.prisma, updated.customerId).catch((err) => {
        this.logger.warn(`Referral reward check failed for approved account ${updated.id}: ${err instanceof Error ? err.message : String(err)}`);
      });
    }

    return updated;
  }

  /**
   * Live check for the signup form - lets the applicant know a code is good
   * (or exactly why it isn't) before they submit, without creating anything.
   * Public: whoever is filling in the form has not signed in yet.
   */
  async checkReferralCode(rawCode: string, rawPhone: string) {
    if (!rawCode?.trim()) {
      throw new BadRequestException('Referral code is required');
    }
    const phone = normalisePhone(rawPhone);
    const referrer = await this.referrals.validate(this.prisma, rawCode, { phone });
    return { valid: true as const, referrerName: referrer.name };
  }

  /**
   * Public: Returns the current active referral program rules (coin amounts, trigger & FAQs)
   * so the storefront Refer & Earn page can show live rates and dynamic FAQs.
   */
  async getReferralProgram() {
    const settings = await this.referrals.getSettings(this.prisma);
    return {
      isActive: settings.isActive,
      referrerRewardCoins: settings.referrerRewardCoins,
      refereeRewardCoins: settings.refereeRewardCoins,
      rewardTrigger: settings.rewardTrigger,
      customerFaqs: settings.customerFaqs,
      retailerFaqs: settings.retailerFaqs,
    };
  }

  /**
   * Authenticated: Returns the customer's referral metrics, code and referral list.
   */
  async getMyReferralSummary(accountId: string) {
    const account = await this.prisma.customerAccount.findUnique({
      where: { id: accountId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            referralCode: true,
            coinBalance: true,
          },
        },
      },
    });

    if (!account?.customer) {
      return {
        referralCode: null,
        coinBalance: 0,
        totalReferred: 0,
        successfulReferrals: 0,
        pendingReferrals: 0,
        totalCoinsEarned: 0,
        referrals: [],
        appliedReferral: null,
        canApplyReferralCode: false,
      };
    }

    const customerId = account.customer.id;
    const [referrals, coinTxns, appliedReferral, ordersPlaced] = await Promise.all([
      this.prisma.referral.findMany({
        where: { referrerId: customerId },
        orderBy: { createdAt: 'desc' },
        include: {
          referee: {
            select: {
              id: true,
              name: true,
              phone: true,
              customerCode: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.coinTransaction.findMany({
        where: {
          customerId,
          reason: 'REFERRAL_REFERRER_REWARD',
        },
      }),
      this.prisma.referral.findUnique({
        where: { refereeId: customerId },
        include: { referrer: { select: { name: true, referralCode: true } } },
      }),
      this.prisma.order.count({ where: { customerId } }),
    ]);

    const totalCoinsEarned = coinTxns.reduce((sum, tx) => sum + tx.amount, 0);
    const successfulReferrals = referrals.filter((r) => r.rewardedAt !== null).length;
    const pendingReferrals = referrals.filter((r) => r.rewardedAt === null).length;

    return {
      referralCode: account.customer.referralCode,
      coinBalance: account.customer.coinBalance,
      totalReferred: referrals.length,
      successfulReferrals,
      pendingReferrals,
      totalCoinsEarned,
      appliedReferral: appliedReferral
        ? {
            code: appliedReferral.code,
            referrerName: appliedReferral.referrer.name,
            status: appliedReferral.rewardedAt ? ('QUALIFIED' as const) : ('PENDING' as const),
            rewardedAt: appliedReferral.rewardedAt,
          }
        : null,
      // A referral code can only be attached before this customer has ever
      // placed an order and only once - matches the `refereeId` unique
      // constraint on Referral, checked again server-side in applyReferralCode.
      canApplyReferralCode: !appliedReferral && ordersPlaced === 0,
      referrals: referrals.map((r) => {
        const refereeNameParts = (r.referee?.name || 'Friend').trim().split(/\s+/);
        const displayName = refereeNameParts.length > 1
          ? `${refereeNameParts[0]} ${refereeNameParts[1][0]}.`
          : refereeNameParts[0];
        const rawPhone = r.referee?.phone || '';
        const maskedPhone = rawPhone.length >= 6
          ? `${rawPhone.slice(0, 3)}****${rawPhone.slice(-3)}`
          : rawPhone;

        return {
          id: r.id,
          code: r.code,
          refereeName: displayName,
          refereeMaskedPhone: maskedPhone,
          createdAt: r.createdAt,
          rewardedAt: r.rewardedAt,
          status: r.rewardedAt ? ('QUALIFIED' as const) : ('PENDING' as const),
        };
      }),
    };
  }

  /**
   * Authenticated: lets an existing customer attach a referral code after
   * signup, for the one legitimate case the original OTP-verify flow doesn't
   * cover - they didn't have a code handy at signup time but got one later.
   * Only allowed once (refereeId is unique on Referral) and only before their
   * first order, so it can't be used to retroactively "discount" a shopping
   * history that already happened without one.
   */
  async applyReferralCode(accountId: string, rawCode: string) {
    const account = await this.prisma.customerAccount.findUnique({
      where: { id: accountId },
      include: { customer: true },
    });
    if (!account?.customer) {
      throw new BadRequestException('No customer profile found for this account');
    }

    const customer = account.customer;

    const [existing, ordersPlaced] = await Promise.all([
      this.prisma.referral.findUnique({ where: { refereeId: customer.id } }),
      this.prisma.order.count({ where: { customerId: customer.id } }),
    ]);
    if (existing) {
      throw new BadRequestException('A referral code is already applied to your account');
    }
    if (ordersPlaced > 0) {
      throw new BadRequestException('Referral codes can only be applied before your first order');
    }

    const referrer = await this.prisma.$transaction(async (tx) => {
      const ref = await this.referrals.validate(tx, rawCode, {
        phone: customer.phone,
        email: customer.email,
      });
      await this.referrals.createRelationship(tx, ref, customer.id, rawCode);
      return ref;
    });

    try {
      await this.referrals.onAccountVerified(this.prisma, customer.id);
    } catch (err) {
      this.logger.warn(`Referral reward crediting failed after apply for customer ${customer.id}: ${err}`);
    }

    return { applied: true as const, referrerName: referrer.name, code: rawCode.trim().toUpperCase() };
  }

  async rejectAccount(id: string, reviewerId: string, dto: RejectAccountDto) {
    const account = await this.prisma.customerAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Account not found');
    if (account.status !== CustomerAccountStatus.PENDING_APPROVAL) {
      throw new BadRequestException(`Only a pending registration can be rejected - this one is ${account.status}`);
    }

    return this.prisma.customerAccount.update({
      where: { id: account.id },
      data: {
        status: CustomerAccountStatus.REJECTED,
        rejectionReason: dto.reason,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
      select: ACCOUNT_STAFF_SELECT,
    });
  }
}
