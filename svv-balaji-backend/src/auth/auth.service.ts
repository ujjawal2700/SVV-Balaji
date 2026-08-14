import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from './permissions/permissions.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.dto';
import { JwtPayload } from './strategies/jwt.strategy';

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
      createdAt: user.createdAt,
      permissions: await this.permissions.listFor(user.role),
    };
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
