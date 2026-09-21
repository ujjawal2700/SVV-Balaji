import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../api/queryKeys';
import { recallApi } from '../api/recall';
import type { SetBatchHoldInput } from '../api/types';

/** Lookups, not live filters: only fire once a code has been submitted. */
export function useForwardTrace(code: string | undefined) {
  return useQuery({
    queryKey: queryKeys.recall.forward(code ?? ''),
    queryFn: () => recallApi.forward(code as string),
    enabled: Boolean(code),
    retry: false,
  });
}

export function useBackwardTrace(fgBatchNumber: string | undefined) {
  return useQuery({
    queryKey: queryKeys.recall.backward(fgBatchNumber ?? ''),
    queryFn: () => recallApi.backward(fgBatchNumber as string),
    enabled: Boolean(fgBatchNumber),
    retry: false,
  });
}

export function useSetBatchHold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetBatchHoldInput) => recallApi.setHold(input),
    onSuccess: () => {
      // Hold status shows up in the recall views and the staff pack trace.
      void queryClient.invalidateQueries({ queryKey: queryKeys.recall.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.trace.all });
    },
  });
}
