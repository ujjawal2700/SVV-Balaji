/**
 * Storefront sessions are signed with their own key pair, deliberately not the
 * staff one.
 *
 * The reason is specific: `JwtStrategy.validate()` in src/auth returns the token
 * payload as-is without re-reading the user, so anything bearing a valid
 * signature is a staff principal as far as `JwtAuthGuard` is concerned. If a
 * customer token were signed with JWT_ACCESS_SECRET it would pass that guard,
 * and would then be a staff session whose role claim it chose for itself.
 *
 * Sharing the secret is therefore refused rather than merely discouraged.
 */
function readSecret(name: string, staffSecret: string | undefined): string {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(
      `${name} is not set. Storefront sessions need their own signing key, separate from the ` +
        'staff JWT secrets - see src/storefront/customer-token.config.ts.',
    );
  }

  if (staffSecret && value === staffSecret) {
    throw new Error(
      `${name} must not equal the staff JWT secret. A storefront token signed with the staff ` +
        'key satisfies JwtAuthGuard, which would make every customer a staff principal.',
    );
  }

  return value;
}

export function customerAccessSecret(): string {
  return readSecret('CUSTOMER_JWT_ACCESS_SECRET', process.env.JWT_ACCESS_SECRET);
}

export function customerRefreshSecret(): string {
  return readSecret('CUSTOMER_JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET);
}

export const CUSTOMER_ACCESS_EXPIRES_IN = process.env.CUSTOMER_JWT_ACCESS_EXPIRES_IN ?? '30m';
/**
 * Longer than the staff 7 days: a shopper who is signed out every week stops
 * being a shopper. The account row can still be suspended server-side, which is
 * what actually ends a session.
 */
export const CUSTOMER_REFRESH_EXPIRES_IN = process.env.CUSTOMER_JWT_REFRESH_EXPIRES_IN ?? '30d';
