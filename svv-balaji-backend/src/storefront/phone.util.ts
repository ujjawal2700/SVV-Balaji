import { BadRequestException } from '@nestjs/common';

/**
 * Indian mobile numbers start 6-9 and are 10 digits. Landlines and the 1800
 * series cannot receive an SMS, so they cannot be an account.
 */
const INDIAN_MOBILE = /^[6-9]\d{9}$/;

/**
 * Reduces every way a person might type their own number to the one form we
 * store.
 *
 * This matters more than it looks: `phone` is the unique key on
 * CustomerAccount, so "+91 98765 43210", "09876543210" and "9876543210"
 * normalising differently would let the same person hold three accounts, each
 * with its own order history, and make "log in with your number" fail for
 * whichever spelling they did not use at signup.
 */
export function normalisePhone(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '');

  // 91 is only stripped at length 12, never from a 10-digit number - 9198765432
  // is a legitimate mobile beginning with 91, not +91 8765432.
  let local = digits;
  if (local.length === 12 && local.startsWith('91')) {
    local = local.slice(2);
  } else if (local.length === 11 && local.startsWith('0')) {
    local = local.slice(1);
  }

  if (!INDIAN_MOBILE.test(local)) {
    throw new BadRequestException(
      `"${raw}" is not a valid Indian mobile number - expected 10 digits starting 6-9`,
    );
  }

  return local;
}

/** Last four digits only, for display and log lines that must not carry a full number. */
export function maskPhone(phone: string): string {
  return phone.length === 10 ? `******${phone.slice(-4)}` : '******';
}
