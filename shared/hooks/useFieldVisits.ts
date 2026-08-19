import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fieldVisitsApi } from '../api/fieldVisits';
import { queryKeys } from '../api/queryKeys';
import type {
  AddFieldVisitDocumentInput,
  CreateFieldVisitInput,
  UpdateFieldVisitInput,
} from '../api/types';

export function useFieldVisits(filters: { farmerId?: string; expertId?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.fieldVisits.list(filters),
    queryFn: () => fieldVisitsApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function useFieldVisit(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.fieldVisits.detail(id ?? ''),
    queryFn: () => fieldVisitsApi.get(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateFieldVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateFieldVisitInput) => fieldVisitsApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.fieldVisits.all });
      // Field visits appear on the farmer profile too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.farmers.all });
    },
  });
}

export function useAddFieldVisitDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AddFieldVisitDocumentInput }) =>
      fieldVisitsApi.addDocument(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.fieldVisits.all });
    },
  });
}

export function useUpdateFieldVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateFieldVisitInput }) =>
      fieldVisitsApi.update(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.fieldVisits.all });
    },
  });
}

export function useDeleteFieldVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => fieldVisitsApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.fieldVisits.all });
    },
  });
}

export function useRemoveFieldVisitDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, documentId }: { id: string; documentId: string }) =>
      fieldVisitsApi.removeDocument(id, documentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.fieldVisits.all });
    },
  });
}
