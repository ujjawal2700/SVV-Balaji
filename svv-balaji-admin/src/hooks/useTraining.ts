import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../api/queryKeys';
import { trainingApi } from '../api/training';
import type { AddTrainingMaterialInput, CreateTrainingSessionInput } from '../api/types';

export function useTrainingSessions(branchId?: string) {
  return useQuery({
    queryKey: queryKeys.training.list(branchId),
    queryFn: () => trainingApi.list(branchId),
    placeholderData: keepPreviousData,
  });
}

export function useTrainingSession(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.training.detail(id ?? ''),
    queryFn: () => trainingApi.get(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateTrainingSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTrainingSessionInput) => trainingApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.training.all });
    },
  });
}

export function useMarkAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, farmerIds }: { id: string; farmerIds: string[] }) =>
      trainingApi.markAttendance(id, farmerIds),
    onSuccess: () => {
      // The list carries an attendance count, so both list and detail move.
      void queryClient.invalidateQueries({ queryKey: queryKeys.training.all });
    },
  });
}

export function useAddTrainingMaterial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AddTrainingMaterialInput }) =>
      trainingApi.addMaterial(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.training.all });
    },
  });
}
