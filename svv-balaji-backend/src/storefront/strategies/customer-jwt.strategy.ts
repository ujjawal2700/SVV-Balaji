import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { customerAccessSecret } from '../customer-token.config';

export interface CustomerJwtPayload {
  sub: string;
  phone: string;
  channel: string;
  /// Present on every storefront token and checked below. Belt to the
  /// separate-secret braces: even if the two secrets were ever misconfigured to
  /// the same value, a staff token still would not carry this.
  typ: 'customer';
  /// The CustomerSession this token belongs to. Re-checked on every request, so logout/expiry bite at once.
  sid: string;
  /// The commercial record, once there is one. Null for a retailer awaiting
  /// approval, which is why it cannot be assumed present.
  customerId: string | null;
}

/**
 * Registered as 'customer-jwt', a different passport strategy name from the
 * staff 'jwt'. The two never share a guard, a secret or a token shape.
 */
@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(Strategy, 'customer-jwt') {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: customerAccessSecret(),
    });
  }

  async validate(payload: CustomerJwtPayload) {
    if (payload?.typ !== 'customer') {
      throw new UnauthorizedException('This token is not a storefront session');
    }
    if (!payload.sid) throw new UnauthorizedException('Session is no longer valid - sign in again');

    const session = await this.prisma.customerSession.findUnique({
      where: { id: payload.sid },
      select: { accountId: true, revokedAt: true, expiresAt: true, account: { select: { status: true } } },
    });
    if (
      !session ||
      session.accountId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.account.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Session is no longer valid - sign in again');
    }
    return payload;
  }
}
