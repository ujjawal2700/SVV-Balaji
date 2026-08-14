import type { UserRole } from '../auth/types';

/**
 * Domain types mirroring the backend's Prisma models.
 *
 * Hand-written rather than generated, because the API exposes tailored
 * projections rather than raw models - `GET /farmers` includes a trimmed
 * `branch`, `GET /farmers/:id` includes four relation arrays that the list does
 * not. Generating from the schema would describe the database, not the wire.
 *
 * Prisma `Decimal` columns arrive as JSON strings, and `DateTime` as ISO
 * strings. Both are typed as `string` here on purpose - coercing them to
 * `number`/`Date` at the boundary hides precision loss in money and weight
 * fields, which is the last place we want it.
 */

// --- shared -----------------------------------------------------------------

export interface BranchRef {
  id: string;
  name: string;
}

export interface UserRef {
  id: string;
  fullName: string;
}

// --- Branch (FRD Section 6) -------------------------------------------------

export interface Branch {
  id: string;
  name: string;
  location: string;
  address: string;
  contactName: string | null;
  contactPhone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Update inputs are `Partial<Create…>` because every one of these endpoints is
 * a PATCH: the server applies only the keys present, and `pruneEmpty` strips
 * the empties before they are sent. Declaring them explicitly rather than
 * inlining `Partial<>` at each call site keeps the api layer readable and gives
 * one place to record where a field is deliberately NOT editable.
 */
export type UpdateBranchInput = Partial<CreateBranchInput>;

export interface CreateBranchInput {
  name: string;
  location: string;
  address: string;
  contactName?: string;
  contactPhone?: string;
}

// --- User (FRD Section 5) ---------------------------------------------------

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

/** As returned by /users - the service strips passwordHash and refreshTokenHash. */
export interface StaffUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  branchId: string | null;
  /** GET /users now includes this - previously the list showed a raw uuid. */
  branch?: BranchRef;
  createdAt: string;
  updatedAt: string;
}

/** Password is excluded on purpose - it moves through `usersApi.resetPassword`. */
export type UpdateUserInput = Partial<Omit<CreateUserInput, 'password'>>;

export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role: UserRole;
  branchId?: string;
}

// --- Farmer (FRD Sections 7-8) ----------------------------------------------

export const FARMER_STATUSES = [
  'PENDING_VERIFICATION',
  'ACTIVE',
  'INACTIVE',
  'BLACKLISTED',
  'SUSPENDED',
] as const;

export type FarmerStatus = (typeof FARMER_STATUSES)[number];

/** Statuses PATCH /farmers/:id/status accepts - note PENDING_VERIFICATION is not among them. */
export const SETTABLE_FARMER_STATUSES = [
  'ACTIVE',
  'INACTIVE',
  'BLACKLISTED',
  'SUSPENDED',
] as const;

export type SettableFarmerStatus = (typeof SETTABLE_FARMER_STATUSES)[number];

export type FarmerVerificationAction = 'APPROVED' | 'REJECTED' | 'DOCUMENTS_REQUESTED';

export interface Farmer {
  id: string;
  /** SVV-YYYY-NNNNNN. Null until the farmer is approved (FRD 8.1). */
  farmerCode: string | null;
  fullName: string;
  mobile: string;
  aadhaarNumber: string | null;
  panNumber: string | null;

  village: string;
  district: string;
  state: string;
  address: string | null;
  gpsLocation: string | null;

  farmSizeAcres: string | null;
  landType: string | null;
  irrigationType: string | null;
  cropDetails: string | null;

  bankAccountName: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  ifscCode: string | null;

  status: FarmerStatus;
  branchId: string;
  branch?: BranchRef;

  createdAt: string;
  updatedAt: string;
}

export interface FarmerVerificationLog {
  id: string;
  farmerId: string;
  action: FarmerVerificationAction;
  remarks: string | null;
  verifiedById: string;
  createdAt: string;
}

export interface FarmerAgreementSummary {
  id: string;
  cropName: string;
  variety: string | null;
  expectedQuantity: string;
  purchaseRate: string;
  agreementDate: string;
  harvestDate: string | null;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
}

export interface FarmerSeedDistributionSummary {
  id: string;
  seedName: string;
  seedVariety: string | null;
  quantity: string;
  unit: string;
  distributionDate: string;
}

export interface FarmerFieldVisitSummary {
  id: string;
  visitDate: string;
  cropName: string | null;
  cropHealth: string | null;
  cropGrowthStage: string | null;
  yieldPredictionQty: string | null;
}

/** GET /farmers/:id - the profile, with the Phase 1 history the service includes. */
export interface FarmerDetail extends Farmer {
  verificationLogs: FarmerVerificationLog[];
  agreements: FarmerAgreementSummary[];
  seedDistributions: FarmerSeedDistributionSummary[];
  fieldVisits: FarmerFieldVisitSummary[];
}

/**
 * `farmerCode` is absent from CreateFarmerInput and so cannot appear here
 * either. The code is issued once on approval and is the traceability anchor;
 * the server refuses to change it and the panel must not offer to.
 */
export type UpdateFarmerInput = Partial<CreateFarmerInput>;

export interface CreateFarmerInput {
  fullName: string;
  mobile: string;
  aadhaarNumber?: string;
  panNumber?: string;
  village: string;
  district: string;
  state: string;
  address?: string;
  gpsLocation?: string;
  farmSizeAcres?: number;
  landType?: string;
  irrigationType?: string;
  cropDetails?: string;
  bankAccountName?: string;
  bankName?: string;
  bankAccountNo?: string;
  ifscCode?: string;
  branchId: string;
}

/**
 * GET /farmers query filters.
 *
 * These are the ONLY keys the endpoint accepts. The API's ValidationPipe runs
 * with `forbidNonWhitelisted: true`, so sending anything else - a stray `page`,
 * for instance - is a 400, not an ignored parameter.
 */
export interface FarmerQuery {
  fullName?: string;
  village?: string;
  district?: string;
  state?: string;
  branchId?: string;
  status?: FarmerStatus;
}

export interface VerifyFarmerInput {
  action: FarmerVerificationAction;
  remarks?: string;
}

/** GET /farmers/:id/codes */
export interface FarmerCodes {
  farmerCode: string;
  traceabilityUrl: string;
  qrSvg: string;
  barcodeSvg: string;
}

/** Farmer as embedded in other resources' responses. */
export interface FarmerRef {
  id: string;
  fullName: string;
  farmerCode: string | null;
}

// --- Agreements (FRD Section 9) ---------------------------------------------

export const AGREEMENT_STATUSES = ['PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

export interface Agreement {
  id: string;
  farmerId: string;
  farmer?: FarmerRef;
  cropName: string;
  variety: string | null;
  expectedQuantity: string;
  purchaseRate: string;
  agreementDate: string;
  harvestDate: string | null;
  qualityStandards: string | null;
  status: AgreementStatus;
  /**
   * GET /agreements now includes this. Non-zero means the terms are fixed -
   * the screen can say so on the disabled Edit rather than waiting for the
   * server to refuse.
   */
  _count?: { harvestInspections: number };
  createdAt: string;
  updatedAt: string;
}

/**
 * `farmerId` is excluded: moving an agreement to a different farmer would
 * rewrite who the pre-season commitment was made to. The server refuses it.
 */
export type UpdateAgreementInput = Partial<Omit<CreateAgreementInput, 'farmerId'>>;

export interface CreateAgreementInput {
  farmerId: string;
  cropName: string;
  variety?: string;
  expectedQuantity: number;
  purchaseRate: number;
  agreementDate: string;
  harvestDate?: string;
  qualityStandards?: string;
}

// --- Seed & input distribution (FRD Section 10) -----------------------------

export interface SeedDistribution {
  id: string;
  farmerId: string;
  farmer?: FarmerRef;
  seedName: string;
  seedVariety: string | null;
  quantity: string;
  unit: string;
  batchNumber: string | null;
  distributionDate: string;
  distributedById: string;
  distributedBy?: UserRef;
  createdAt: string;
}

export type UpdateSeedDistributionInput = Partial<CreateSeedDistributionInput>;

export interface CreateSeedDistributionInput {
  farmerId: string;
  seedName: string;
  seedVariety?: string;
  quantity: number;
  unit?: string;
  batchNumber?: string;
  distributionDate: string;
}

// --- Training (FRD Section 11) ----------------------------------------------

export interface TrainingSession {
  id: string;
  title: string;
  description: string | null;
  scheduledDate: string;
  branchId: string;
  branch?: BranchRef;
  conductedById: string;
  conductedBy?: UserRef;
  /** Present on the list response only. */
  _count?: { attendances: number; materials: number };
  createdAt: string;
}

export interface TrainingAttendance {
  id: string;
  sessionId: string;
  farmerId: string;
  attended: boolean;
  farmer?: FarmerRef;
  createdAt: string;
}

export interface TrainingMaterial {
  id: string;
  sessionId: string;
  fileUrl: string;
  /** pdf | image | presentation | video */
  fileType: string;
  createdAt: string;
}

export interface TrainingSessionDetail extends TrainingSession {
  attendances: TrainingAttendance[];
  materials: TrainingMaterial[];
}

export type UpdateTrainingSessionInput = Partial<CreateTrainingSessionInput>;

export interface CreateTrainingSessionInput {
  title: string;
  description?: string;
  scheduledDate: string;
  branchId: string;
}

export interface AddTrainingMaterialInput {
  fileUrl: string;
  fileType: string;
}

// --- Field monitoring (FRD Section 12) --------------------------------------

export interface FieldVisit {
  id: string;
  farmerId: string;
  farmer?: FarmerRef;
  expertId: string;
  expert?: UserRef;
  branchId: string;
  branch?: BranchRef;

  visitDate: string;
  cropName: string | null;

  cropGrowthStage: string | null;
  cropHealth: string | null;
  pestStatus: string | null;
  diseaseObservation: string | null;

  fertilizerAdvice: string | null;
  irrigationAdvice: string | null;
  pestControlSuggestions: string | null;
  harvestPreparation: string | null;

  yieldPredictionQty: string | null;
  createdAt: string;
}

export interface FieldVisitDocument {
  id: string;
  fieldVisitId: string;
  fileUrl: string;
  /** photo | pdf | inspection_doc */
  fileType: string;
  createdAt: string;
}

export interface FieldVisitDetail extends FieldVisit {
  documents: FieldVisitDocument[];
}

export type UpdateFieldVisitInput = Partial<CreateFieldVisitInput>;

export interface CreateFieldVisitInput {
  farmerId: string;
  branchId: string;
  visitDate: string;
  cropName?: string;
  cropGrowthStage?: string;
  cropHealth?: string;
  pestStatus?: string;
  diseaseObservation?: string;
  fertilizerAdvice?: string;
  irrigationAdvice?: string;
  pestControlSuggestions?: string;
  harvestPreparation?: string;
  yieldPredictionQty?: number;
}

export interface AddFieldVisitDocumentInput {
  fileUrl: string;
  fileType: string;
}

// ===========================================================================
// ZONE 2 — Procurement & Raw Material Control (FRD Sections 13-17)
// ===========================================================================

export interface WarehouseRef {
  id: string;
  name: string;
}

export interface Warehouse {
  id: string;
  name: string;
  location: string;
  capacity: string | null;
  isActive: boolean;
  branchId: string;
  branch?: BranchRef;
  createdAt: string;
  updatedAt: string;
}

// --- Procurement planning (FRD 13.1) ----------------------------------------

export const PROCUREMENT_PLAN_STATUSES = [
  'DRAFT',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;

export type ProcurementPlanStatus = (typeof PROCUREMENT_PLAN_STATUSES)[number];

export interface ProcurementPlan {
  id: string;
  cropName: string;
  plannedQuantity: string;
  unit: string;
  scheduledFrom: string;
  scheduledTo: string;
  status: ProcurementPlanStatus;
  notes: string | null;
  branchId: string;
  branch?: BranchRef;
  createdById: string;
  createdBy?: UserRef;
  _count?: { inspections: number };
  createdAt: string;
  updatedAt: string;
}

export type UpdateProcurementPlanInput = Partial<CreateProcurementPlanInput>;

export interface CreateProcurementPlanInput {
  cropName: string;
  plannedQuantity: number;
  unit?: string;
  scheduledFrom: string;
  scheduledTo: string;
  branchId: string;
  notes?: string;
}

// --- Harvest inspection (FRD 13.2 - 13.5) -----------------------------------

export const INSPECTION_RESULTS = ['APPROVED', 'REJECTED', 'HOLD_FOR_REINSPECTION'] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

export interface HarvestInspectionDocument {
  id: string;
  inspectionId: string;
  fileUrl: string;
  /** crop_image | inspection_photo | pdf | quality_certificate */
  fileType: string;
  createdAt: string;
}

export interface HarvestInspection {
  id: string;
  farmerId: string;
  farmer?: FarmerRef;
  agreementId: string | null;
  agreement?: Agreement | null;
  procurementPlanId: string | null;

  cropName: string;
  inspectionDate: string;

  // FRD 13.2 checklist
  moistureLevel: string | null;
  foreignMatter: string | null;
  grainSize: string | null;
  grainColor: string | null;
  smell: string | null;
  physicalDamage: string | null;

  result: InspectionResult;
  remarks: string | null;

  inspectedById: string;
  inspectedBy?: UserRef;

  /** Present when this harvest has already been collected — a harvest is collected once. */
  collection?: { id: string; receiptNumber: string } | null;
  documents?: HarvestInspectionDocument[];

  createdAt: string;
  updatedAt: string;
}

/** `farmerId` is excluded — an APPROVED result must not be transferable to another farmer. */
export type UpdateHarvestInspectionInput = Partial<Omit<CreateHarvestInspectionInput, 'farmerId'>>;

export interface CreateHarvestInspectionInput {
  farmerId: string;
  agreementId?: string;
  procurementPlanId?: string;
  cropName: string;
  inspectionDate: string;
  moistureLevel?: number;
  foreignMatter?: number;
  grainSize?: string;
  grainColor?: string;
  smell?: string;
  physicalDamage?: string;
  result: InspectionResult;
  remarks?: string;
}

export interface AddDocumentInput {
  fileUrl: string;
  fileType: string;
}

// --- Raw material collection (FRD Section 14) -------------------------------

export const PAYMENT_STATUSES = ['PENDING', 'PARTIAL', 'PAID'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface RawMaterialCollection {
  id: string;
  inspectionId: string;
  inspection?: HarvestInspection;

  farmerId: string;
  farmer?: FarmerRef & { village?: string };
  branchId: string;
  branch?: BranchRef;

  cropName: string;
  collectionDate: string;
  collectionLocation: string | null;

  grossWeight: string;
  netWeight: string;
  unit: string;

  purchaseRate: string;
  totalAmount: string;
  paymentStatus: PaymentStatus;

  /** FRD 14.4 — RC-YYYYMMDD-NNN, issued to the farmer and the company. */
  receiptNumber: string;

  collectedById: string;
  collectedBy?: UserRef;

  /** Minted in the same transaction as the collection itself. */
  batch?: { id: string; batchNumber: string; status: BatchStatus } | null;

  createdAt: string;
  updatedAt: string;
}

/**
 * Written out rather than derived, because what is missing is the point:
 * `inspectionId`, `warehouseId` and `collectionDate` are not correctable. The
 * first is a unique relation, the second would move stock without a ledger
 * entry, and the third is encoded into the receipt and batch numbers already
 * printed on the farmer's receipt.
 */
export interface UpdateCollectionInput {
  grossWeight?: number;
  netWeight?: number;
  purchaseRate?: number;
  unit?: string;
  collectionLocation?: string;
  /** Written onto the stock ledger when the net weight changes. */
  correctionReason?: string;
}

export interface CreateCollectionInput {
  inspectionId: string;
  branchId: string;
  collectionDate: string;
  collectionLocation?: string;
  grossWeight: number;
  netWeight: number;
  unit?: string;
  /** Falls back to the pre-season agreement rate when omitted. */
  purchaseRate?: number;
  /** Books the batch straight into stock on receipt when supplied. */
  warehouseId?: string;
}

// --- Batches (FRD Section 15) -----------------------------------------------

export const BATCH_STATUSES = [
  'COLLECTED',
  'STORED',
  'UNDER_PRODUCTION',
  'PACKAGED',
  'DISPATCHED',
  'DELIVERED',
  'REJECTED',
] as const;

export type BatchStatus = (typeof BATCH_STATUSES)[number];

export interface RawMaterialBatch {
  id: string;
  /** FRD 15.1 — RM-YYYYMMDD-NNN */
  batchNumber: string;
  collectionId: string;
  farmerId: string;
  farmer?: FarmerRef;
  branchId: string;
  cropName: string;
  quantity: string;
  unit: string;
  status: BatchStatus;
  warehouseId: string | null;
  warehouse?: WarehouseRef | null;
  /**
   * GET /batches now includes the collection this batch was minted from.
   *
   * A batch has no figures of its own — quantity, crop and farmer are all
   * inherited — so Correct and Delete on the batches screen act on the
   * collection. Carrying it on the row means that screen can open the
   * correction form without a round trip per row.
   */
  collection?: {
    id: string;
    receiptNumber: string;
    collectionDate: string;
    collectionLocation: string | null;
    grossWeight: string;
    netWeight: string;
    unit: string;
    purchaseRate: string;
    totalAmount: string;
    paymentStatus: PaymentStatus;
  };
  createdAt: string;
  updatedAt: string;
}

export const MOVEMENT_TYPES = ['STOCK_IN', 'STOCK_OUT', 'TRANSFER', 'ADJUSTMENT'] as const;
export type StockMovementType = (typeof MOVEMENT_TYPES)[number];

export interface StockMovement {
  id: string;
  batchId: string;
  batch?: { id: string; batchNumber: string };
  fromWarehouseId: string | null;
  toWarehouseId: string | null;
  movementType: StockMovementType;
  quantity: string;
  unit: string;
  reason: string | null;
  performedById: string;
  performedBy?: UserRef;
  createdAt: string;
}

// --- Warehouse stock (FRD Sections 16-17) -----------------------------------

export interface WarehouseStock {
  id: string;
  warehouseId: string;
  warehouse?: WarehouseRef;
  batchId: string;
  batch?: {
    id: string;
    batchNumber: string;
    cropName: string;
    status: BatchStatus;
    farmer?: FarmerRef;
  };
  quantity: string;
  /** Counts as unavailable — a withdrawal may not dip into it. */
  reservedQuantity: string;
  unit: string;
  storageLocation: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * GET /warehouses/:id/status.
 *
 * Caveat worth knowing: `occupied` sums quantity across batches WITHOUT
 * regard to unit, so if a warehouse ever holds both KG and QUINTAL the figure
 * — and `utilisationPercent` with it — is meaningless. The occupancy view
 * computes its own per-unit breakdown rather than trusting this single number.
 */
export interface WarehouseStatus {
  warehouseId: string;
  name: string;
  capacity: number | null;
  occupied: number;
  available: number | null;
  utilisationPercent: number | null;
  distinctBatches: number;
}

export interface LowStockResult {
  threshold: number;
  count: number;
  items: WarehouseStock[];
}

export type UpdateWarehouseInput = Partial<CreateWarehouseInput>;

export interface CreateWarehouseInput {
  name: string;
  location: string;
  branchId: string;
  capacity?: number;
}

export interface StockInInput {
  batchId: string;
  quantity: number;
  storageLocation?: string;
  reason?: string;
}

export interface StockOutInput {
  batchId: string;
  quantity: number;
  reason?: string;
}

export interface TransferStockInput {
  batchId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  reason?: string;
}

export interface AdjustStockInput {
  batchId: string;
  /** The new absolute on-hand figure after a physical count, not a delta. */
  newQuantity: number;
  /** Mandatory server-side — adjustments are the movement most likely to hide a problem. */
  reason: string;
}

/** GET /batches/:batchNumber/trace — the upstream half of the chain. */
export interface BatchTrace extends RawMaterialBatch {
  farmer: FarmerRef & {
    village: string;
    district: string;
    state: string;
    gpsLocation: string | null;
  };
  branch?: BranchRef;
  collection?: RawMaterialCollection & { inspection?: HarvestInspection };
  stockMovements: StockMovement[];
}

// --- Farm-to-fork trace (FRD Section 30) ------------------------------------

export interface TraceFarmer {
  farmerCode: string | null;
  farmerName: string;
  village: string;
  district: string;
  state: string;
  gpsLocation: string | null;
  crop: string;
  rawBatchNumber: string;
  quantityUsed: string;
  procuredOn: string | null;
}

// ===========================================================================
// ZONE 3 — Processing, QA & Packaging (FRD Sections 18-23)
// ===========================================================================

// --- Product master ---------------------------------------------------------

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  unit: string;
  isActive: boolean;
  /** Present on GET /products/:id. */
  recipes?: Array<{ id: string; recipeCode: string; version: number; status: RecipeStatus }>;
  createdAt: string;
  updatedAt: string;
}

export type UpdateProductInput = Partial<CreateProductInput>;

export interface CreateProductInput {
  name: string;
  sku: string;
  unit: string;
  category?: string;
}

// --- Recipes (FRD Section 19) -----------------------------------------------

export const RECIPE_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'INACTIVE'] as const;
export type RecipeStatus = (typeof RECIPE_STATUSES)[number];

export const PRODUCTION_TYPES = ['SINGLE_GRAIN', 'MULTI_GRAIN'] as const;
export type ProductionType = (typeof PRODUCTION_TYPES)[number];

export interface RecipeIngredient {
  id: string;
  recipeId: string;
  /** Must match cropName on raw material batches — that is how consumption is validated. */
  cropName: string;
  quantity: string;
  unit: string;
  percentage: string | null;
  createdAt: string;
}

export interface Recipe {
  id: string;
  recipeCode: string;
  version: number;
  productId: string;
  product?: { id: string; name: string; sku: string };
  name: string;
  category: string | null;
  description: string | null;
  productionType: ProductionType;

  mixingRatio: string | null;
  processingSequence: string | null;
  grindingInstructions: string | null;
  roastingInstructions: string | null;
  oilExtractionProcess: string | null;
  packagingInstructions: string | null;

  batchYieldQuantity: string | null;
  unit: string;
  status: RecipeStatus;

  createdById: string;
  createdBy?: UserRef;
  approvedById: string | null;
  approvedBy?: UserRef | null;
  approvedAt: string | null;

  ingredients?: RecipeIngredient[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecipeInput {
  recipeCode: string;
  productId: string;
  name: string;
  category?: string;
  description?: string;
  productionType: ProductionType;
  ingredients: Array<{
    cropName: string;
    quantity: number;
    unit?: string;
    percentage?: number;
  }>;
  mixingRatio?: string;
  processingSequence?: string;
  grindingInstructions?: string;
  roastingInstructions?: string;
  oilExtractionProcess?: string;
  packagingInstructions?: string;
  batchYieldQuantity?: number;
  unit?: string;
}

// --- Cleaning & grading (FRD Section 18) ------------------------------------

export interface CleaningGradingRecord {
  id: string;
  rawMaterialBatchId: string;
  rawMaterialBatch?: { id: string; batchNumber: string; cropName: string };
  dustRemoved: boolean;
  stonesRemoved: boolean;
  foreignMaterialRemoved: boolean;
  impuritiesSeparated: boolean;
  grainSize: string | null;
  color: string | null;
  texture: string | null;
  moistureLevel: string | null;
  purity: string | null;
  wastageQuantity: string | null;
  qaVerified: boolean;
  remarks: string | null;
  operatorId: string;
  operator?: UserRef;
  createdAt: string;
}

export interface CreateCleaningGradingInput {
  rawMaterialBatchId: string;
  dustRemoved?: boolean;
  stonesRemoved?: boolean;
  foreignMaterialRemoved?: boolean;
  impuritiesSeparated?: boolean;
  grainSize?: string;
  color?: string;
  texture?: string;
  moistureLevel?: number;
  purity?: number;
  wastageQuantity?: number;
  qaVerified?: boolean;
  remarks?: string;
}

// --- Production (FRD Section 20) --------------------------------------------

export const PRODUCTION_STATUSES = [
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'PAUSED',
  'CANCELLED',
] as const;

export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];

export interface ProductionConsumption {
  id: string;
  productionBatchId: string;
  rawMaterialBatchId: string;
  rawMaterialBatch?: {
    id?: string;
    batchNumber: string;
    cropName: string;
    farmer?: FarmerRef;
  };
  quantityUsed: string;
  unit: string;
  createdAt: string;
}

export interface ProductionBatch {
  id: string;
  /** FRD 20.2 — PB-YYYYMMDD-NNN */
  productionBatchNumber: string;
  productId: string;
  product?: { id: string; name: string; sku: string };
  recipeId: string;
  recipe?: { recipeCode: string; version: number; name?: string; ingredients?: RecipeIngredient[] };
  /** Pinned at creation — recipes are versioned and may change afterwards. */
  recipeVersion: number;
  productionType: ProductionType;

  plannedQuantity: string;
  actualQuantity: string | null;
  productionLoss: string | null;
  unit: string;

  productionDate: string;
  status: ProductionStatus;

  machineName: string | null;
  machineNumber: string | null;
  operatorName: string | null;
  productionLine: string | null;

  branchId: string;
  branch?: BranchRef;
  createdById: string;
  createdBy?: UserRef;

  consumptions?: ProductionConsumption[];
  qualityInspections?: QualityInspection[];
  finishedGoodsBatches?: Array<{ id: string; fgBatchNumber: string; qaReleased: boolean }>;
  _count?: { consumptions: number; finishedGoodsBatches: number; qualityInspections: number };

  createdAt: string;
  updatedAt: string;
}

export interface CreateProductionBatchInput {
  recipeId: string;
  branchId: string;
  /** Where the raw material is drawn from — consumption decrements this warehouse. */
  warehouseId: string;
  productionDate: string;
  plannedQuantity: number;
  consumptions: Array<{ rawMaterialBatchId: string; quantityUsed: number }>;
  machineName?: string;
  machineNumber?: string;
  operatorName?: string;
  productionLine?: string;
}

// --- Quality (FRD Section 21) -----------------------------------------------

export const INSPECTION_STAGES = ['RAW_MATERIAL', 'IN_PROCESS', 'FINISHED_GOODS'] as const;
export type InspectionStage = (typeof INSPECTION_STAGES)[number];

export const QUALITY_RESULTS = ['PASS', 'FAIL', 'REWORK_REQUIRED'] as const;
export type QualityResult = (typeof QUALITY_RESULTS)[number];

export interface QualityInspection {
  id: string;
  stage: InspectionStage;
  rawMaterialBatchId: string | null;
  rawMaterialBatch?: { id: string; batchNumber: string } | null;
  productionBatchId: string | null;
  productionBatch?: { id: string; productionBatchNumber: string } | null;
  finishedGoodsBatchId: string | null;
  finishedGoodsBatch?: { id: string; fgBatchNumber: string } | null;

  moisture: string | null;
  purity: string | null;
  grainSize: string | null;
  color: string | null;
  foreignMatter: string | null;
  odor: string | null;

  ingredientRatio: string | null;
  mixingAccuracy: string | null;
  grindingQuality: string | null;
  temperature: string | null;
  productConsistency: string | null;

  productAppearance: string | null;
  productWeight: string | null;
  packagingQuality: string | null;
  labelAccuracy: string | null;
  shelfLifeVerified: boolean | null;

  result: QualityResult;
  remarks: string | null;
  inspectedById: string;
  inspectedBy?: UserRef;
  createdAt: string;
}

export interface CreateQualityInspectionInput {
  stage: InspectionStage;
  rawMaterialBatchId?: string;
  productionBatchId?: string;
  finishedGoodsBatchId?: string;
  moisture?: number;
  purity?: number;
  grainSize?: string;
  color?: string;
  foreignMatter?: number;
  odor?: string;
  ingredientRatio?: string;
  mixingAccuracy?: string;
  grindingQuality?: string;
  temperature?: number;
  productConsistency?: string;
  productAppearance?: string;
  productWeight?: number;
  packagingQuality?: string;
  labelAccuracy?: string;
  shelfLifeVerified?: boolean;
  result: QualityResult;
  remarks?: string;
}

// --- Packaging & finished goods (FRD Sections 22-23) ------------------------

export interface FinishedGoodsBatch {
  id: string;
  /** FRD 22.1 — FG-YYYYMMDD-NNN. This is what the consumer QR resolves to. */
  fgBatchNumber: string;
  productionBatchId: string;
  productionBatch?: { id: string; productionBatchNumber: string };
  productId: string;
  product?: { id: string; name: string; sku: string };

  packagingType: string;
  netWeight: string;
  weightUnit: string;
  mrp: string | null;
  packagingDate: string;
  manufacturingDate: string;
  expiryDate: string | null;
  shelfLifeDays: number | null;
  packCount: number;

  qrPayload: string | null;
  /** FRD 21.5 — only a released batch may be stocked or dispatched. */
  qaReleased: boolean;

  packedById: string;
  packedBy?: UserRef;
  createdAt: string;
  updatedAt: string;
}

export interface FinishedGoodsStockRow {
  id: string;
  warehouseId: string;
  warehouse?: WarehouseRef;
  fgBatchId: string;
  fgBatch?: {
    id: string;
    fgBatchNumber: string;
    netWeight: string;
    expiryDate: string | null;
    product?: { name: string; sku: string };
  };
  quantity: number;
  reservedQuantity: number;
  storageLocation: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /finished-goods/:id/label — everything needed to print the pack label. */
export interface ProductLabel {
  productName: string;
  batchNumber: string;
  manufacturingDate: string;
  expiryDate: string | null;
  netWeight: string;
  mrp: string | null;
  packagingDate: string;
  shelfLifeDays: number | null;
  traceabilityUrl: string;
  qrSvg: string;
  barcodeSvg: string;
}

export interface CreateFinishedGoodsBatchInput {
  productionBatchId: string;
  packagingType: string;
  netWeight: number;
  weightUnit?: string;
  packCount: number;
  mrp?: number;
  packagingDate: string;
  manufacturingDate: string;
  expiryDate?: string;
  shelfLifeDays?: number;
}

export interface StockFinishedGoodsInput {
  warehouseId: string;
  quantity: number;
  storageLocation?: string;
}

/** GET /trace/:fgBatchNumber — what a consumer QR scan resolves to. */
export interface FinishedGoodsTrace {
  product: { id: string; name: string; sku: string; category: string | null };
  finishedBatch: {
    fgBatchNumber: string;
    manufacturingDate: string;
    expiryDate: string | null;
    packagingDate: string;
    packagingType: string;
    netWeight: string;
    qaReleased: boolean;
  };
  production: {
    productionBatchNumber: string;
    productionDate: string;
    recipe: { recipeCode: string; version: number; name: string } | null;
    recipeVersionUsed: number;
    branch: BranchRef | null;
  };
  quality: Array<{ stage: string; result: string; createdAt: string }>;
  farmers: TraceFarmer[];
  traceabilityUrl: string | null;
}


/**
 * Plot counts on a farmer row, added 16 Aug so the field app can show how much
 * of a farmer's land has actually been mapped without a request per row.
 *
 * Optional because the list endpoint does not return it yet — the field screens
 * fall back to fetching per farmer when they need detail. Making it required
 * would break every existing screen that builds a Farmer object.
 */
export interface FarmerPlotCounts {
  plotCount?: number;
  mappedAcres?: string;
}
