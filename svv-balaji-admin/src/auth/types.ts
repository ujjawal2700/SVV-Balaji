/**
 * Moved to `shared/` on 16 August 2026, when the Agriculture Expert app became
 * a second front end.
 *
 * The definition now lives in `shared/auth/types.ts` and is compiled into both apps, so the
 * API contract cannot drift between them. This file re-exports it rather than
 * disappearing, so the many imports across this app did not all have to change
 * in one commit.
 *
 * New code should import from `@shared/auth/types` directly. This shim can go once
 * nothing references it.
 */
export * from '../../../shared/auth/types';
