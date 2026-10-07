import { Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AFFILIATE_COOKIE, readCookie, signClickId, verifyClickCookie } from './affiliate.logic';

/**
 * The aff_tracker cookie: HTTP-only (page scripts cannot read or forge it),
 * signed (an edited value is ignored), path "/".
 *
 * SameSite: the storefront and the API share one origin in production
 * (svvbalaji.com + svvbalaji.com/api, see the customer app's vite.config.ts),
 * so "lax" is right. A split deployment (storefront and API on different
 * sites) needs AFFILIATE_COOKIE_SAMESITE=none, which also forces Secure.
 */
@Injectable()
export class AffiliateTrackingCookie {
  private readonly logger = new Logger(AffiliateTrackingCookie.name);
  private readonly secret: string;
  private readonly sameSite: 'lax' | 'strict' | 'none';
  private readonly secure: boolean;

  constructor() {
    const secret = process.env.AFFILIATE_COOKIE_SECRET || process.env.CUSTOMER_JWT_ACCESS_SECRET;
    if (!secret) this.logger.warn('AFFILIATE_COOKIE_SECRET is not set - using an insecure development secret');
    this.secret = secret || 'dev-affiliate-cookie-secret';
    const ss = (process.env.AFFILIATE_COOKIE_SAMESITE ?? 'lax').toLowerCase();
    this.sameSite = ss === 'none' || ss === 'strict' ? ss : 'lax';
    this.secure = this.sameSite === 'none' || (process.env.AFFILIATE_COOKIE_SECURE ?? (process.env.NODE_ENV === 'production' ? 'true' : 'false')) === 'true';
  }

  /** Overwrites any earlier cookie - last click wins. */
  set(res: Response, clickId: string, days: number) {
    res.cookie(AFFILIATE_COOKIE, signClickId(clickId, this.secret), {
      httpOnly: true,
      sameSite: this.sameSite,
      secure: this.secure,
      path: '/',
      maxAge: days * 24 * 60 * 60 * 1000,
    });
  }

  /** The click id in the request's cookie, if present and correctly signed. */
  clickIdFrom(req: Request): string | null {
    return verifyClickCookie(readCookie(req.headers.cookie, AFFILIATE_COOKIE), this.secret);
  }
}
