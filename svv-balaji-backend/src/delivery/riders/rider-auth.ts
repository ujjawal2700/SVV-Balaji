import {
  BadRequestException,
  ConflictException,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard, PassportStrategy } from '@nestjs/passport';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Rider, RiderOtpPurpose, RiderStatus, VehicleType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { createHash, randomUUID } from 'node:crypto';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import {
  generateOtpCode,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_REQUESTS_PER_WINDOW,
  OTP_REQUEST_WINDOW_SECONDS,
  OTP_TTL_SECONDS,
  resolveOtpMode,
} from '../../storefront/otp.config';

// ---------------------------------------------------------------- secrets

function readSecret(name: string, others: Array<string | undefined>): string {
  const value = process.env[name];
  if (!value || value.trim().length < 32) {
    throw new Error(`${name} is not set (32+ chars). Rider sessions need their own signing key - see src/delivery/riders/rider-auth.ts.`);
  }
  if (others.some((o) => o && o === value)) {
    throw new Error(`${name} must differ from the staff and customer JWT secrets, or a rider token could pass their guards.`);
  }
  return value;
}
export const riderAccessSecret = () =>
  readSecret('RIDER_JWT_ACCESS_SECRET', [process.env.JWT_ACCESS_SECRET, process.env.CUSTOMER_JWT_ACCESS_SECRET]);
export const riderRefreshSecret = () =>
  readSecret('RIDER_JWT_REFRESH_SECRET', [process.env.JWT_REFRESH_SECRET, process.env.CUSTOMER_JWT_REFRESH_SECRET]);
const ACCESS_TTL = process.env.RIDER_JWT_ACCESS_EXPIRES_IN ?? '12h';
const REFRESH_TTL_DAYS = 30;
/** The token just replaced still works this long (lost-response retries on mobile data). */
const REFRESH_GRACE_MS = 2 * 60_000;

// ---------------------------------------------------------------- token + guard

export interface RiderJwtPayload {
  sub: string;
  typ: 'rider';
  sid: string;
  status: RiderStatus;
}

/** Rider tokens: `typ: 'rider'` + a live RiderSession, re-checked on every request. */
@Injectable()
export class RiderJwtStrategy extends PassportStrategy(Strategy, 'rider-jwt') {
  constructor(private readonly prisma: PrismaService) {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), ignoreExpiration: false, secretOrKey: riderAccessSecret() });
  }

  async validate(payload: RiderJwtPayload) {
    if (payload?.typ !== 'rider' || !payload.sid) throw new UnauthorizedException('This token is not a rider session');
    const session = await this.prisma.riderSession.findUnique({
      where: { id: payload.sid },
      select: { riderId: true, revokedAt: true, expiresAt: true, rider: { select: { status: true } } },
    });
    if (!session || session.riderId !== payload.sub || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Session is no longer valid - sign in again');
    }
    if (session.rider.status === RiderStatus.SUSPENDED || session.rider.status === RiderStatus.REJECTED) {
      throw new UnauthorizedException('This rider account is not active');
    }
    return { ...payload, status: session.rider.status };
  }
}

@Injectable()
export class RiderJwtAuthGuard extends AuthGuard('rider-jwt') {}

export const CurrentRider = createParamDecorator((_: unknown, ctx: ExecutionContext): RiderJwtPayload => ctx.switchToHttp().getRequest().user);

// ---------------------------------------------------------------- DTOs

const PHONE = /^[6-9]\d{9}$/;
const normalisePhone = (p: string) => {
  const d = (p ?? '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  if (!PHONE.test(d)) throw new BadRequestException('Enter a valid 10-digit Indian mobile number');
  return d;
};

export class RiderSignupDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80) fullName!: string;
  @ApiProperty({ example: '9876543210' }) @IsString() phone!: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiProperty({ minLength: 8 }) @IsString() @MinLength(8) @MaxLength(72) password!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) city?: string;
  @ApiPropertyOptional({ enum: VehicleType }) @IsOptional() @IsEnum(VehicleType) vehicleType?: VehicleType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) vehicleNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) licenceNumber?: string;
  @ApiPropertyOptional({ description: 'Licence / ID photo URL from POST /rider/uploads/signup' })
  @IsOptional() @IsString() @MaxLength(500) documentUrl?: string;
}

export class RiderPhoneDto {
  @ApiProperty() @IsString() phone!: string;
}

export class RiderVerifyDto {
  @ApiProperty() @IsString() phone!: string;
  @ApiProperty() @Matches(/^\d{4,8}$/) code!: string;
}

export class RiderLoginDto {
  @ApiProperty({ description: 'Mobile number or email' }) @IsString() @MaxLength(120) identifier!: string;
  @ApiProperty() @IsString() @MaxLength(72) password!: string;
}

export class RiderRefreshDto {
  @ApiProperty() @IsString() refreshToken!: string;
}

export class RiderResetPasswordDto {
  @ApiProperty() @IsString() phone!: string;
  @ApiProperty() @Matches(/^\d{4,8}$/) code!: string;
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(72) newPassword!: string;
}

// ---------------------------------------------------------------- service

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Rider self sign-up and login.
 *
 *   sign up -> OTP to the phone -> verify -> PENDING_APPROVAL -> staff approve
 *   (outlet assigned) -> ACTIVE -> can go online and take tasks.
 *
 * A pending rider may sign in (the app shows "under review"); suspended or
 * rejected riders may not. OTP uses the storefront's mode (mock code in dev).
 */
@Injectable()
export class RiderAuthService {
  private readonly logger = new Logger(RiderAuthService.name);
  private readonly otpMode = resolveOtpMode();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private async issueOtp(phone: string, purpose: RiderOtpPurpose, riderId: string) {
    const since = new Date(Date.now() - OTP_REQUEST_WINDOW_SECONDS * 1000);
    const recent = await this.prisma.riderOtp.count({ where: { phone, createdAt: { gte: since } } });
    if (recent >= OTP_MAX_REQUESTS_PER_WINDOW) {
      throw new HttpException('Too many codes requested. Try again in a few minutes.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = generateOtpCode(this.otpMode);
    await this.prisma.riderOtp.create({
      data: { phone, purpose, riderId, codeHash: sha256(code), expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000) },
    });
    // No SMS vendor yet (same gap as the storefront): mock mode returns the code.
    return { sent: true, expiresInSeconds: OTP_TTL_SECONDS, ...(this.otpMode === 'mock' ? { devCode: code, mode: 'mock' } : {}) };
  }

  /** Atomically consume the latest live code; wrong codes count towards the limit. */
  private async consumeOtp(phone: string, purpose: RiderOtpPurpose, code: string) {
    const otp = await this.prisma.riderOtp.findFirst({
      where: { phone, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw new BadRequestException('The code has expired. Request a new one.');
    if (otp.attempts >= OTP_MAX_ATTEMPTS) throw new BadRequestException('Too many wrong attempts. Request a new code.');
    if (otp.codeHash !== sha256(code)) {
      await this.prisma.riderOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException('Incorrect code');
    }
    const used = await this.prisma.riderOtp.updateMany({ where: { id: otp.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (used.count !== 1) throw new BadRequestException('This code was already used');
    return otp;
  }

  async signup(dto: RiderSignupDto) {
    const phone = normalisePhone(dto.phone);
    const email = dto.email?.trim().toLowerCase() || null;
    const existing = await this.prisma.rider.findUnique({ where: { phone } });
    if (existing && existing.status !== RiderStatus.PENDING_VERIFICATION) {
      throw new ConflictException('This mobile number is already registered. Sign in instead.');
    }
    if (email) {
      const byEmail = await this.prisma.rider.findUnique({ where: { email } });
      if (byEmail && byEmail.id !== existing?.id) throw new ConflictException('This email is already registered');
    }
    const data = {
      fullName: dto.fullName.trim(),
      email,
      passwordHash: await bcrypt.hash(dto.password, 10),
      city: dto.city?.trim() || null,
      vehicleType: dto.vehicleType ?? null,
      vehicleNumber: dto.vehicleNumber?.trim().toUpperCase() || null,
      licenceNumber: dto.licenceNumber?.trim().toUpperCase() || null,
      documentUrl: dto.documentUrl ?? null,
    };
    // An unverified earlier attempt with the same phone is simply replaced.
    const rider = existing
      ? await this.prisma.rider.update({ where: { id: existing.id }, data })
      : await this.prisma.rider.create({ data: { ...data, phone } });
    return { riderId: rider.id, ...(await this.issueOtp(phone, RiderOtpPurpose.VERIFY_PHONE, rider.id)) };
  }

  async resendVerification(dto: RiderPhoneDto) {
    const phone = normalisePhone(dto.phone);
    const rider = await this.prisma.rider.findUnique({ where: { phone } });
    if (!rider || rider.status !== RiderStatus.PENDING_VERIFICATION) throw new BadRequestException('Nothing to verify for this number');
    return this.issueOtp(phone, RiderOtpPurpose.VERIFY_PHONE, rider.id);
  }

  /** Verifying the phone completes sign-up and signs the rider in (status PENDING_APPROVAL). */
  async verifyPhone(dto: RiderVerifyDto, userAgent?: string) {
    const phone = normalisePhone(dto.phone);
    const rider = await this.prisma.rider.findUnique({ where: { phone } });
    if (!rider) throw new BadRequestException('Sign up first');
    await this.consumeOtp(phone, RiderOtpPurpose.VERIFY_PHONE, dto.code);
    const updated =
      rider.status === RiderStatus.PENDING_VERIFICATION
        ? await this.prisma.rider.update({ where: { id: rider.id }, data: { status: RiderStatus.PENDING_APPROVAL, phoneVerifiedAt: new Date() } })
        : rider;
    return this.startSession(updated, userAgent);
  }

  async login(dto: RiderLoginDto, userAgent?: string) {
    const id = dto.identifier.trim();
    const rider = id.includes('@')
      ? await this.prisma.rider.findUnique({ where: { email: id.toLowerCase() } })
      : await this.prisma.rider.findUnique({ where: { phone: (() => { try { return normalisePhone(id); } catch { return '-'; } })() } });
    // Same message for unknown user and wrong password.
    if (!rider || !(await bcrypt.compare(dto.password, rider.passwordHash))) {
      throw new UnauthorizedException('Incorrect mobile/email or password');
    }
    if (rider.status === RiderStatus.PENDING_VERIFICATION) {
      throw new ForbiddenException({ code: 'PHONE_NOT_VERIFIED', message: 'Verify your mobile number to finish signing up', phone: rider.phone });
    }
    if (rider.status === RiderStatus.SUSPENDED) throw new ForbiddenException({ code: 'SUSPENDED', message: 'Your rider account is suspended. Contact your outlet manager.' });
    if (rider.status === RiderStatus.REJECTED) {
      throw new ForbiddenException({ code: 'REJECTED', message: `Your application was not approved${rider.rejectionReason ? `: ${rider.rejectionReason}` : ''}` });
    }
    return this.startSession(rider, userAgent);
  }

  private async startSession(rider: Rider, userAgent?: string) {
    const session = await this.prisma.riderSession.create({
      data: { riderId: rider.id, refreshTokenHash: '-', expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 864e5), userAgent: userAgent?.slice(0, 200) },
    });
    return this.tokens(rider, session.id);
  }

  private async tokens(rider: Rider, sid: string) {
    const payload: RiderJwtPayload = { sub: rider.id, typ: 'rider', sid, status: rider.status };
    const accessToken = await this.jwt.signAsync(payload, { secret: riderAccessSecret(), expiresIn: ACCESS_TTL });
    const refreshToken = await this.jwt.signAsync({ sub: rider.id, typ: 'rider-refresh', sid, jti: randomUUID() }, { secret: riderRefreshSecret(), expiresIn: `${REFRESH_TTL_DAYS}d` });
    const current = await this.prisma.riderSession.findUnique({ where: { id: sid }, select: { refreshTokenHash: true } });
    await this.prisma.riderSession.update({
      where: { id: sid },
      data: {
        refreshTokenHash: sha256(refreshToken),
        previousRefreshHash: current && current.refreshTokenHash !== '-' ? current.refreshTokenHash : null,
        rotatedAt: new Date(),
        lastUsedAt: new Date(),
      },
    });
    return { accessToken, refreshToken, rider: this.publicRider(rider) };
  }

  async refresh(dto: RiderRefreshDto) {
    let claims: { sub: string; sid: string; typ: string };
    try {
      claims = await this.jwt.verifyAsync(dto.refreshToken, { secret: riderRefreshSecret() });
    } catch {
      throw new UnauthorizedException('Session expired - sign in again');
    }
    if (claims.typ !== 'rider-refresh') throw new UnauthorizedException('Not a rider refresh token');
    const session = await this.prisma.riderSession.findUnique({ where: { id: claims.sid }, include: { rider: true } });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.riderId !== claims.sub) {
      throw new UnauthorizedException('Session expired - sign in again');
    }
    const presented = sha256(dto.refreshToken);
    const inGrace = session.previousRefreshHash === presented && session.rotatedAt && Date.now() - session.rotatedAt.getTime() < REFRESH_GRACE_MS;
    if (session.refreshTokenHash !== presented && !inGrace) {
      // An older rotated token came back: someone else may hold it. End the session.
      await this.prisma.riderSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      this.logger.warn(`Refresh token reuse for rider ${session.riderId}; session revoked`);
      throw new UnauthorizedException('Session expired - sign in again');
    }
    if (session.rider.status === RiderStatus.SUSPENDED || session.rider.status === RiderStatus.REJECTED) {
      throw new UnauthorizedException('This rider account is not active');
    }
    return this.tokens(session.rider, session.id);
  }

  async logout(sid: string) {
    await this.prisma.riderSession.updateMany({ where: { id: sid, revokedAt: null }, data: { revokedAt: new Date() } });
    return { signedOut: true };
  }

  async forgotPassword(dto: RiderPhoneDto) {
    const phone = normalisePhone(dto.phone);
    const rider = await this.prisma.rider.findUnique({ where: { phone } });
    // Do not reveal whether the number is registered.
    if (!rider || rider.status === RiderStatus.PENDING_VERIFICATION) return { sent: true, expiresInSeconds: OTP_TTL_SECONDS };
    return this.issueOtp(phone, RiderOtpPurpose.RESET_PASSWORD, rider.id);
  }

  async resetPassword(dto: RiderResetPasswordDto) {
    const phone = normalisePhone(dto.phone);
    const rider = await this.prisma.rider.findUnique({ where: { phone } });
    if (!rider) throw new BadRequestException('Incorrect code');
    await this.consumeOtp(phone, RiderOtpPurpose.RESET_PASSWORD, dto.code);
    await this.prisma.$transaction([
      this.prisma.rider.update({ where: { id: rider.id }, data: { passwordHash: await bcrypt.hash(dto.newPassword, 10) } }),
      // Every other device is signed out.
      this.prisma.riderSession.updateMany({ where: { riderId: rider.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { reset: true };
  }

  publicRider(r: Rider & { warehouse?: { id: string; name: string } | null }) {
    return {
      id: r.id,
      code: r.code,
      fullName: r.fullName,
      phone: r.phone,
      email: r.email,
      status: r.status,
      city: r.city,
      vehicleType: r.vehicleType,
      vehicleNumber: r.vehicleNumber,
      photoUrl: r.photoUrl,
      availability: r.availability,
      warehouse: r.warehouse ?? null,
      rejectionReason: r.status === RiderStatus.REJECTED ? r.rejectionReason : null,
    };
  }
}
