import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs';

/** Order columns staff must never receive: the doorstep OTP exists to be read out by the CUSTOMER. */
const SECRET_KEYS = new Set(['deliveryOtp']);

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  // Anything that serialises itself (Prisma Decimal, Date, Buffer) is a leaf, not a bag of fields to copy.
  if (value && typeof value === 'object' && typeof (value as { toJSON?: unknown }).toJSON !== 'function') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!SECRET_KEYS.has(k)) out[k] = strip(v);
    }
    return out;
  }
  return value;
}

/**
 * Applied to every staff-facing order controller. A whitelist per query would be
 * safer in theory, but these controllers return whole order rows in many shapes;
 * removing the secret at the boundary means a new endpoint cannot leak it by
 * forgetting to.
 */
@Injectable()
export class StripOrderSecretsInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(map(strip));
  }
}
