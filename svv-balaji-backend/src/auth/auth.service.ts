import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from './permissions/permissions.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { VerifyTwoFactorLoginDto, EnableTwoFactorDto, DisableTwoFactorDto } from './dto/2fa.dto';
import { UpdateProfileDto, ChangePasswordDto } from './dto/profile.dto';
import { encryptSecret, decryptSecret } from './crypto.util';
import {
  generateBase32Secret,
  generateOtpAuthUrl,
  generateQrCodeDataUrl,
  verifyTotp,
  generateRecoveryCodes,
} from './totp.util';

/**
 * Session handling for every client of this API - the admin web panel and the
 * field, sales and delivery apps.
 *
 * Access tokens are deliberately short-lived (15 minutes by default), so a
 * refresh route is not optional: without it every panel session dies a quarter
 * of an hour after sign-in with no way back.
 *
 * Two properties are load-bearing:
 *
 *   1. **Refresh tokens rotate.** Every successful refresh issues a new pair and
 *      stores the hash of the new refresh token, which invalidates the one just
 *      used. A token can therefore be spent exactly once.
 *   2. **A refresh token that does not match the stored hash kills the session.**
 *      That happens either because it was already rotated away (a replay) or
 *      because it was stolen. Neither is a case where handing out fresh
 *      credentials is the right answer.
 *
 * Known limitation, deliberately not worked around here: `User.refreshTokenHash`
 * is a single column, so one user has one live session. Signing in on the panel
 * ends the session on their phone. Supporting concurrent sessions needs a
 * separate sessions table and a migration - raised in DEV_LOG rather than
 * changed unilaterally.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly permissions: PermissionsService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.isTwoFactorEnabled) {
      const payload = {
        sub: user.id,
        email: user.email,
        purpose: '2fa_login',
      };
      const twoFactorToken = await this.jwtService.signAsync(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: '5m',
      });
      return { requiresTwoFactor: true, twoFactorToken };
    }

    return this.issueSession(user);
  }

  /**
   * Verifies a 2FA login challenge using the short-lived twoFactorToken.
   */
  async verifyTwoFactorLogin(dto: VerifyTwoFactorLoginDto) {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(dto.twoFactorToken, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException('2FA token is invalid or has expired');
    }

    if (payload.purpose !== '2fa_login') {
      throw new UnauthorizedException('Invalid token purpose');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ACTIVE' || !user.isTwoFactorEnabled || !user.twoFactorSecret) {
      throw new UnauthorizedException('2FA is not enabled or user is invalid');
    }

    const secret = decryptSecret(user.twoFactorSecret);
    const code = dto.code.trim();
    let isValid = false;

    // Check if it's a 6-digit TOTP
    if (code.length === 6 && /^\d+$/.test(code)) {
      isValid = verifyTotp(code, secret);
    } else {
      // Check if it matches a recovery code
      const codes = user.twoFactorRecoveryCodes || [];
      for (let i = 0; i < codes.length; i++) {
        const matches = await bcrypt.compare(code, codes[i]);
        if (matches) {
          isValid = true;
          // Burn the recovery code
          codes.splice(i, 1);
          await this.prisma.user.update({
            where: { id: user.id },
            data: { twoFactorRecoveryCodes: codes },
          });
          break;
        }
      }
    }

    if (!isValid) {
      throw new UnauthorizedException('Invalid two-factor authentication code');
    }

    return this.issueSession(user);
  }

  /**
   * Exchanges a valid refresh token for a fresh pair. The presented token must
   * both carry a valid signature AND match the hash currently stored against
   * the user - a signature alone is not enough, otherwise logging out would
   * not actually end anything.
   */
  async refresh(dto: RefreshTokenDto) {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(dto.refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or has expired');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });

    // No stored hash means the user has logged out (or never logged in on this
    // deployment). Treat it the same as a bad token - say nothing useful.
    if (!user || user.status !== 'ACTIVE' || !user.refreshTokenHash) {
      throw new UnauthorizedException('Session is no longer valid - sign in again');
    }

    const matches = await bcrypt.compare(dto.refreshToken, user.refreshTokenHash);
    if (!matches) {
      // Correctly signed but not the token we are holding: either a replay of a
      // token already rotated away, or a stolen one. End the session outright
      // rather than reissuing - the legitimate holder can sign in again.
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenHash: null },
      });
      throw new UnauthorizedException('Session is no longer valid - sign in again');
    }

    return this.issueSession(user);
  }

  /**
   * Ends the session by discarding the stored refresh hash. The access token
   * already issued stays valid until it expires - that is the accepted
   * trade-off of stateless JWTs, and is why the access lifetime is short.
   */
  async logout(userId: string) {
    await this.prisma.user.updateMany({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    return { success: true };
  }

  /**
   * The signed-in user's own profile, and everything they are permitted to do.
   *
   * The permission list is served from here rather than carried as a claim in
   * the access token, and that is a deliberate cost. A claim would save this
   * lookup, but it would also mean that revoking someone's access did nothing
   * until their token expired - up to fifteen minutes of somebody continuing to
   * approve farmers after being told they no longer can. Permissions are read
   * per request from a cache the guard shares, so a change lands on the next
   * call.
   *
   * The panel calls this on boot and after every refresh to build its menu.
   */
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { branch: { select: { id: true, name: true, location: true } } },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Session is no longer valid - sign in again');
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
      status: user.status,
      branchId: user.branchId,
      branch: user.branch,
      isTwoFactorEnabled: user.isTwoFactorEnabled,
      createdAt: user.createdAt,
      permissions: await this.permissions.listFor(user.role),
    };
  }

  // --- Profile & Password Management ---

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Check uniqueness if email changed
    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing && existing.id !== userId) {
      throw new UnauthorizedException('Email is already in use');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: dto.fullName,
        email: normalizedEmail,
        phone: dto.phone,
      },
      include: { branch: { select: { id: true, name: true, location: true } } },
    });

    return {
      id: updated.id,
      email: updated.email,
      fullName: updated.fullName,
      phone: updated.phone,
      role: updated.role,
      status: updated.status,
      branchId: updated.branchId,
      branch: updated.branch,
      isTwoFactorEnabled: updated.isTwoFactorEnabled,
      createdAt: updated.createdAt,
      permissions: await this.permissions.listFor(updated.role),
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const matches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const isSame = await bcrypt.compare(dto.newPassword, user.passwordHash);
    if (isSame) {
      throw new UnauthorizedException('New password cannot be the same as the current password');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    // Update password and invalidate all existing sessions
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, refreshTokenHash: null },
    });

    return { success: true };
  }

  // --- Two-Factor Authentication (2FA) ---

  async generateTwoFactorSetup(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const secret = generateBase32Secret();
    const encryptedSecret = encryptSecret(secret);

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorTempSecret: encryptedSecret },
    });

    const otpauthUrl = generateOtpAuthUrl(secret, user.email);
    const qrCodeDataUrl = await generateQrCodeDataUrl(otpauthUrl);

    return { secret, qrCodeDataUrl };
  }

  async enableTwoFactor(userId: string, dto: EnableTwoFactorDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorTempSecret) {
      throw new UnauthorizedException('2FA setup not initiated');
    }

    const secret = decryptSecret(user.twoFactorTempSecret);
    const isValid = verifyTotp(dto.code, secret);

    if (!isValid) {
      throw new UnauthorizedException('Invalid two-factor authentication code');
    }

    const recoveryCodes = generateRecoveryCodes(10);
    const hashedCodes = await Promise.all(recoveryCodes.map((c) => bcrypt.hash(c, 10)));

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isTwoFactorEnabled: true,
        twoFactorSecret: user.twoFactorTempSecret,
        twoFactorTempSecret: null,
        twoFactorRecoveryCodes: hashedCodes,
      },
    });

    return { recoveryCodes };
  }

  async disableTwoFactor(userId: string, dto: DisableTwoFactorDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const matches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Incorrect password');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isTwoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorTempSecret: null,
        twoFactorRecoveryCodes: [],
      },
    });

    return { success: true };
  }

  /**
   * Mints an access/refresh pair and records the hash of the refresh token.
   * Single source of truth for token issuance - login and refresh both come
   * through here so the two can never drift apart in claims or lifetime.
   */
  private async issueSession(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    });

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        branchId: user.branchId,
        // Sent on login so the panel can render its menu on the first paint
        // rather than flashing an empty sidebar while /auth/me is in flight.
        permissions: await this.permissions.listFor(user.role),
      },
    };
  }
}
