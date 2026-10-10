import { api } from './client';
import { pruneEmpty } from './envelope';

/**
 * Machine master, machine utilisation and production cost (backend
 * `src/production/machines.*` and `production-cost.*`). Client decision
 * 10 Oct 2026: cost = raw + labour + machine + loss + other; utilisation =
 * machine list + runs.
 */

export interface Machine {
  id: string;
  code: string;
  name: string;
  machineNumber: string | null;
  productionLine: string | null;
  branchId: string;
  branch?: { id: string; name: string };
  capacityPerHour: number | null;
  hoursPerDay: number;
  isActive: boolean;
  notes: string | null;
  _count?: { productionBatches: number };
}

export interface MachineInput {
  name: string;
  machineNumber?: string;
  productionLine?: string;
  branchId: string;
  capacityPerHour?: number;
  hoursPerDay?: number;
  notes?: string;
  isActive?: boolean;
}

export interface MachineRun {
  id: string;
  productionBatchNumber: string;
  product: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  productionDate: string;
  actualQuantity: number | null;
  unit: string;
  hours: number | null;
}

export interface MachineUtilisationRow {
  machine: Machine;
  runs: number;
  completedRuns: number;
  inProgressRuns: number;
  runsWithoutTimes: number;
  runHours: number;
  outputQuantity: number;
  availableHours: number;
  utilisationPercent: number | null;
  recentRuns: MachineRun[];
}

export interface MachineUtilisation {
  from: string;
  to: string;
  machines: MachineUtilisationRow[];
  runsWithoutMachine: number;
}

export interface OtherCost {
  label: string;
  amount: number;
}

export interface ProductionCostSheet {
  productionBatchId: string;
  productionBatchNumber: string;
  status: string;
  recorded: boolean;
  recordedAt: string | null;
  unit: string;
  outputQuantity: number | null;
  consumedQuantity: number;
  processLossQuantity: number | null;
  rawMaterial: {
    amount: number;
    overridden: boolean;
    automatic: number;
    lines: Array<{ batchNumber: string; quantityUsed: number; rate: number | null; cost: number | null }>;
    missingRate: string[];
  };
  labourCost: number | null;
  machineCost: number | null;
  lossCost: number | null;
  otherCosts: OtherCost[];
  otherTotal: number;
  totalCost: number;
  costPerUnit: number | null;
}

export interface ProductionCostInput {
  /** null = use the automatic figure. Leave out to keep what is there. */
  rawMaterialCost?: number | null;
  labourCost?: number;
  machineCost?: number;
  lossCost?: number;
  otherCosts?: OtherCost[];
}

export interface ProductionCostReport {
  from: string;
  to: string;
  totals: {
    runs: number;
    costedRuns: number;
    uncostedRuns: number;
    rawMaterialCost: number;
    labourCost: number;
    machineCost: number;
    lossCost: number;
    otherCost: number;
    totalCost: number;
  };
  byProduct: Array<{ productId: string; product: string; runs: number; outputQuantity: number; totalCost: number; unit: string; averageCostPerUnit: number | null }>;
  runs: Array<{
    id: string;
    productionBatchNumber: string;
    productionDate: string;
    completedAt: string | null;
    product: { id: string; name: string; sku: string };
    machine: { code: string | null; name: string } | null;
    outputQuantity: number | null;
    unit: string;
    costRecorded: boolean;
    rawMaterialCost: number | null;
    labourCost: number | null;
    machineCost: number | null;
    lossCost: number | null;
    otherCost: number | null;
    totalCost: number | null;
    costPerUnit: number | null;
  }>;
}

export const machinesApi = {
  async list(params: { branchId?: string; activeOnly?: boolean } = {}): Promise<Machine[]> {
    return (await api.get<Machine[]>('/machines', { params: pruneEmpty(params) })).data;
  },
  async create(input: MachineInput): Promise<Machine> {
    return (await api.post<Machine>('/machines', pruneEmpty(input))).data;
  },
  async update(id: string, input: Partial<MachineInput>): Promise<Machine> {
    return (await api.patch<Machine>(`/machines/${id}`, input)).data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/machines/${id}`);
  },
  async utilisation(params: { from?: string; to?: string; branchId?: string }): Promise<MachineUtilisation> {
    return (await api.get<MachineUtilisation>('/machines/utilisation', { params: pruneEmpty(params) })).data;
  },
};

export const productionCostApi = {
  async get(productionBatchId: string): Promise<ProductionCostSheet> {
    return (await api.get<ProductionCostSheet>(`/production-batches/${productionBatchId}/cost`)).data;
  },
  async record(productionBatchId: string, input: ProductionCostInput): Promise<ProductionCostSheet> {
    return (await api.put<ProductionCostSheet>(`/production-batches/${productionBatchId}/cost`, input)).data;
  },
  async report(params: { from?: string; to?: string; branchId?: string; productId?: string }): Promise<ProductionCostReport> {
    return (await api.get<ProductionCostReport>('/production-cost/report', { params: pruneEmpty(params) })).data;
  },
};
