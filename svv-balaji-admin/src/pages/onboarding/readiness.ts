/**
 * Moved to `shared/validation/farmerReadiness.ts` on 20 August 2026.
 *
 * There were two copies of this — one here and one in the field app — both
 * mirroring the same server rule. Two mirrors of one rule drift, and the
 * drift is silent: a farmer shows as ready in one app and blocked in the
 * other. One definition now, compiled into both.
 *
 * New code should import from `@shared/validation/farmerReadiness` directly.
 */
export * from '../../../../shared/validation/farmerReadiness';
