import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../api/queryKeys';
import { traceApi } from '../api/trace';

/**
 * Only runs once a batch number has actually been submitted — this is a lookup,
 * not a live filter, and firing a request per keystroke would mostly produce
 * 404s.
 */
export function useFinishedGoodsTrace(fgBatchNumber: string | undefined) {
  return useQuery({
    queryKey: queryKeys.trace.finishedGoods(fgBatchNumber ?? ''),
    queryFn: () => traceApi.finishedGoods(fgBatchNumber as string),
    enabled: Boolean(fgBatchNumber),
    retry: false,
    // A pack's history is immutable once made.
    staleTime: Infinity,
  });
}
