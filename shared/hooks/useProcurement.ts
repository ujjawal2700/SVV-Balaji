import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { procurementApi } from '../api/procurement';
import { queryKeys } from '../api/queryKeys';
import type {
  AddDocumentInput,
  CreateHarvestInspectionInput,
  CreateProcurementPlanInput,
  InspectionResult,
  ProcurementPlanStatus,
  UpdateHarvestInspectionInput,
  UpdateProcurementPlanInput,
} from '../api/types';

// --- Planning ---------------------------------------------------------------

export function useProcurementPlans(filters: {
  branchId?: string;
  status?: ProcurementPlanStatus;
}) {
  return useQuery({
    queryKey: queryKeys.procurementPlans.list(filters),
    queryFn: () => procurementApi.listPlans(filters),
    placeholderData: keepPreviousData,
  });
}

export function useCreateProcurementPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProcurementPlanInput) => procurementApi.createPlan(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.procurementPlans.all });
    },
  });
}

export function useSetPlanStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProcurementPlanStatus }) =>
      procurementApi.setPlanStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.procurementPlans.all });
    },
  });
}

// --- Inspection -------------------------------------------------------------

export function useHarvestInspections(filters: {
  farmerId?: string;
  result?: InspectionResult;
}) {
  return useQuery({
    queryKey: queryKeys.inspections.list(filters),
    queryFn: () => procurementApi.listInspections(filters),
    placeholderData: keepPreviousData,
  });
}

export function useHarvestInspection(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.inspections.detail(id ?? ''),
    queryFn: () => procurementApi.getInspection(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateHarvestInspection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateHarvestInspectionInput) => procurementApi.createInspection(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inspections.all });
      // An APPROVED inspection becomes collectable, so the collection form's
      // eligible-harvest picker is now out of date.
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
    },
  });
}

export function useAddInspectionDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AddDocumentInput }) =>
      procurementApi.addInspectionDocument(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inspections.all });
    },
  });
}

export function useUpdateProcurementPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProcurementPlanInput }) =>
      procurementApi.updatePlan(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.procurementPlans.all });
    },
  });
}

export function useDeleteProcurementPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => procurementApi.removePlan(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.procurementPlans.all });
    },
  });
}

export function useUpdateHarvestInspection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateHarvestInspectionInput }) =>
      procurementApi.updateInspection(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inspections.all });
      // The collection form's harvest picker offers APPROVED, uncollected
      // inspections only - a changed result moves a row in or out of it.
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
    },
  });
}

export function useDeleteHarvestInspection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => procurementApi.removeInspection(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inspections.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
    },
  });
}
