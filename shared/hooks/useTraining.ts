import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../api/queryKeys';
import { trainingApi } from '../api/training';
import type {
  AddTrainingMaterialInput,
  CreateTrainingSessionInput,
  UpdateTrainingSessionInput,
} from '../api/types';

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

export function useUpdateTrainingSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTrainingSessionInput }) =>
      trainingApi.update(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.training.all });
    },
  });
}

export function useDeleteTrainingSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => trainingApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.training.all });
    },
  });
}

export function useRemoveAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, farmerId }: { id: string; farmerId: string }) =>
      trainingApi.removeAttendance(id, farmerId),
    onSuccess: () => {
      // The list carries an attendance count, so it goes stale too - not just
      // the drawer the row was removed from.
      void queryClient.invalidateQueries({ queryKey: queryKeys.training.all });
    },
  });
}

export function useRemoveTrainingMaterial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, materialId }: { id: string; materialId: string }) =>
      trainingApi.removeMaterial(id, materialId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.training.all });
    },
  });
}
