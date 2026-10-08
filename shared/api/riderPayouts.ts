import { api } from './client';
import { pruneEmpty } from './envelope';

/** Rider pay settlement (backend `src/delivery/earnings/payouts.service.ts`). */

export type RiderPayoutMethod = 'BANK_TRANSFER' | 'UPI' | 'CASH';
export type RiderPayoutStatus = 'PAID' | 'VOIDED';

export const PAYOUT_METHOD_LABEL: Record<RiderPayoutMethod, string> = { BANK_TRANSFER: 'Bank transfer', UPI: 'UPI', CASH: 'Cash' };

type RiderRef = { id: string; code: string | null; fullName: string; phone: string };

export interface PayoutDueRow {
  rider: RiderRef & { status: string; warehouse: { id: string; name: string } | null };
  owed: number;
  lines: number;
  oldestUnpaid: string | null;
  cashHeld: number;
  lastPaidAt: string | null;
}

export interface PayoutLine {
  id: string;
  type: string;
  amount: number;
  earnedAt: string;
  note: string | null;
  taskNumber: string | null;
  orderNumber: string | null;
}

export interface PayoutPreview {
  rider: RiderRef;
  upTo: string;
  gross: number;
  cashHeld: number;
  maxCashOffset: number;
  lines: PayoutLine[];
}

export interface RiderPayout {
  id: string;
  payoutNumber: string;
  rider: RiderRef;
  upTo: string;
  status: RiderPayoutStatus;
  grossAmount: number;
  cashOffset: number;
  netPaid: number;
  lineCount: number;
  method: RiderPayoutMethod;
  reference: string | null;
  note: string | null;
  paidAt: string;
  recordedBy: { fullName: string };
  voidedAt: string | null;
  voidReason: string | null;
  voidedBy?: { fullName: string } | null;
  earnings?: PayoutLine[];
}

export interface RecordPayoutInput {
  upTo: string;
  method: RiderPayoutMethod;
  reference?: string;
  cashOffset?: number;
  note?: string;
}

const d = <T>(p: Promise<{ data: T }>) => p.then((r) => r.data);

export const riderPayoutsApi = {
  due: (q: { upTo?: string; warehouseId?: string } = {}) =>
    d<{ upTo: string; totals: { owed: number; riders: number }; rows: PayoutDueRow[] }>(api.get('/rider-payouts/due', { params: pruneEmpty(q) })),
  preview: (riderId: string, upTo: string) => d<PayoutPreview>(api.get(`/riders/${riderId}/payouts/preview`, { params: { upTo } })),
  record: (riderId: string, input: RecordPayoutInput) => d<RiderPayout>(api.post(`/riders/${riderId}/payouts`, input)),
  list: (q: { riderId?: string; status?: RiderPayoutStatus; from?: string; to?: string; page?: number; limit?: number } = {}) =>
    d<{ data: RiderPayout[]; meta: { page: number; limit: number; total: number }; summary: { gross: number; cashOffset: number; netPaid: number } }>(
      api.get('/rider-payouts', { params: pruneEmpty(q) }),
    ),
  get: (id: string) => d<RiderPayout>(api.get(`/rider-payouts/${id}`)),
  void: (id: string, reason: string) => d<RiderPayout>(api.post(`/rider-payouts/${id}/void`, { reason })),
};
