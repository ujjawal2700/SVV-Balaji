/**
 * Shim, same pattern as `useProduction.ts` in this folder: the real hooks live
 * in `shared/hooks/useYieldTracking.ts` so the admin panel and any future
 * front end share one API contract.
 */
export * from '../../../shared/hooks/useYieldTracking';
