import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qualityApi } from '../api/quality';
import { queryKeys } from '../api/queryKeys';
import type { CreateQualityInspectionInput, InspectionStage, QualityResult } from '../api/types';

export function useQualityInspections(filters: {
  stage?: InspectionStage;
  result?: QualityResult;
}) {
  return useQuery({
    queryKey: queryKeys.quality.list(filters),
    queryFn: () => qualityApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

/**
 * An inspection can reject a raw material batch or withdraw a finished batch's
 * QA release, so it invalidates far more than the inspection list — the batch,
 * production and finished-goods views all show the consequence.
 */
export function useCreateQualityInspection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateQualityInspectionInput) => qualityApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.quality.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.productionBatches.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.finishedGoods.all });
    },
  });
}

export function useReleaseBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fgBatchId: string) => qualityApi.release(fgBatchId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.finishedGoods.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.quality.all });
    },
  });
}
