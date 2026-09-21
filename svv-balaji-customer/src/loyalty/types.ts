import type { LoyaltyHistoryItem, LoyaltyProgram } from '../api/loyalty';

/**
 * What screens read via `useLoyalty()`. All of it is the server's answer to
 * "what is this account's balance and what are the program's rules" - there is
 * no client-side rate table, tier or arithmetic.
 */
export interface LoyaltyApi {
  /** True while the balance is being fetched for the first time. */
  isLoading: boolean;
  /** Program is on for this account's channel. False for guests. */
  enabled: boolean;
  points: number;
  pointsValueInr: number;
  lifetimePoints: number;
  program: LoyaltyProgram | null;
  expiringSoon: { points: number; on: string } | null;
  history: LoyaltyHistoryItem[];
}
