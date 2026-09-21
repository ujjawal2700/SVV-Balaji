import { api } from './client';
import { unwrap } from './envelope';
import type { BackwardTrace, ForwardTrace, SetBatchHoldInput, SetBatchHoldResult } from './types';

export const recallApi = {
  /** Every order and customer that received an FG batch or a raw material lot. */
  async forward(code: string): Promise<ForwardTrace> {
    const response = await api.get<ForwardTrace>('/recall/forward', { params: { code } });
    return unwrap<ForwardTrace>(response.data);
  },

  /** Machine, milling loss, raw lots, weighing slips, payouts and FIFO check behind a pack. */
  async backward(fgBatchNumber: string): Promise<BackwardTrace> {
    const response = await api.get<BackwardTrace>(`/recall/backward/${encodeURIComponent(fgBatchNumber)}`);
    return unwrap<BackwardTrace>(response.data);
  },

  async setHold(input: SetBatchHoldInput): Promise<SetBatchHoldResult> {
    const response = await api.post<SetBatchHoldResult>('/recall/hold', input);
    return unwrap<SetBatchHoldResult>(response.data);
  },
};
