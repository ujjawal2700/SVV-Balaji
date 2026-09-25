import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fieldVisitPlansApi } from '../api/fieldVisitPlans';
import { queryKeys } from '../api/queryKeys';
import type {
  CreateFieldVisitPlanInput,
  FieldVisitPlanQuery,
  UpdateFieldVisitPlanInput,
} from '../api/types';

export function useFieldVisitPlans(query: FieldVisitPlanQuery = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.fieldVisitPlans.list({ ...query }),
    queryFn: () => fieldVisitPlansApi.list(query),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

function useInvalidatePlans() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.fieldVisitPlans.all });
}

export function useCreateFieldVisitPlan() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: (input: CreateFieldVisitPlanInput) => fieldVisitPlansApi.create(input),
    onSuccess: invalidate,
  });
}

export function useUpdateFieldVisitPlan() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateFieldVisitPlanInput }) =>
      fieldVisitPlansApi.update(id, input),
    onSuccess: invalidate,
  });
}

export function useCancelFieldVisitPlan() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => fieldVisitPlansApi.cancel(id, reason),
    onSuccess: invalidate,
  });
}

export function useDeleteFieldVisitPlan() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: (id: string) => fieldVisitPlansApi.remove(id),
    onSuccess: invalidate,
  });
}
