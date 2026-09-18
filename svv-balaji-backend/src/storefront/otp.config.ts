import { Logger } from '@nestjs/common';
import { randomInt } from 'node:crypto';

export type OtpMode = 'mock' | 'sms';

export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 5 * 60;
/** Wrong guesses allowed against one challenge before it is spent. */
export const OTP_MAX_ATTEMPTS = 5;
/** Challenges one number may request inside OTP_REQUEST_WINDOW_SECONDS. */
export const OTP_MAX_REQUESTS_PER_WINDOW = 5;
export const OTP_REQUEST_WINDOW_SECONDS = 15 * 60;

const DEFAULT_MOCK_CODE = '123456';

/**
 * No SMS provider has been procured yet (it needs a vendor and credentials, the
 * same shape of decision as the GSP one in A-11), so the storefront runs on a
 * fixed code in development. `mock` mode changes exactly one thing: which digits
 * get generated. It does **not** add a bypass to the verification path - a mock
 * code is hashed, stored, expired and attempt-counted like any other, so there
 * is no branch in `verifyOtp` that could survive into production and accept
 * 123456 against a real challenge.
 *
 * Production is refused outright rather than defaulted, because the failure mode
 * of getting this wrong is that every account in the system opens to anyone who
 * knows six digits.
 */
export function resolveOtpMode(env: NodeJS.ProcessEnv = process.env): OtpMode {
  const isProduction = env.NODE_ENV === 'production';
  const configured = env.CUSTOMER_OTP_MODE?.trim().toLowerCase();

  if (configured && configured !== 'mock' && configured !== 'sms') {
    throw new Error(
      `CUSTOMER_OTP_MODE must be "mock" or "sms", not "${configured}"`,
    );
  }

  const mode: OtpMode = (configured as OtpMode | undefined) ?? (isProduction ? 'sms' : 'mock');

  if (mode === 'mock' && isProduction) {
    throw new Error(
      'CUSTOMER_OTP_MODE=mock is refused when NODE_ENV=production: it would accept a ' +
        'fixed code for every customer account. Configure an SMS provider and set ' +
        'CUSTOMER_OTP_MODE=sms.',
    );
  }

  return mode;
}

export function mockOtpCode(env: NodeJS.ProcessEnv = process.env): string {
  const code = env.CUSTOMER_OTP_MOCK_CODE?.trim() || DEFAULT_MOCK_CODE;
  if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code)) {
    throw new Error(`CUSTOMER_OTP_MOCK_CODE must be ${OTP_LENGTH} digits`);
  }
  return code;
}

/**
 * `randomInt` is the CSPRNG rather than `Math.random`, because this value is a
 * credential.
 */
export function generateOtpCode(mode: OtpMode, env: NodeJS.ProcessEnv = process.env): string {
  if (mode === 'mock') return mockOtpCode(env);
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
}

export function warnIfMockMode(mode: OtpMode, logger = new Logger('StorefrontAuth')) {
  if (mode === 'mock') {
    logger.warn(
      `OTP is in MOCK mode - every login code is "${mockOtpCode()}" and is returned in the ` +
        'API response. Never run this against real customers.',
    );
  }
}
