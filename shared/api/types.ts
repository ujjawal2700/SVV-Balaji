import type { LoyaltyEligibility } from './loyalty';
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
  role?: UserRole;
  email?: string;
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
  /** FRD 6.2 — who is accountable for this branch. Null between appointments. */
  managerId: string | null;
  manager?: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    status: UserStatus;
  } | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * FRD 6.4 / 6.5 — one branch's numbers for a period.
 *
 * Two things here are deliberately shaped to resist a misleading report.
 * Quantities are grouped by unit rather than summed, because KG and QUINTAL do
 * not add up; and `utilisationPercent` is null whenever a branch's stock spans
 * more than one unit, rather than producing a ratio over incompatible numbers.
 */
export interface BranchPerformance {
  branchId: string;
  branchName: string;
  managerName: string | null;
  from: string;
  to: string;

  procurement: {
    collections: number;
    quantityByUnit: Record<string, number>;
    totalValue: number;
    farmersSupplying: number;
    inspections: number;
    inspectionsApproved: number;
  };

  production: {
    batches: number;
    completed: number;
    plannedQuantity: number;
    actualQuantity: number;
    totalLoss: number;
    yieldPercent: number | null;
  };

  sales: {
    orders: number;
    delivered: number;
    cancelled: number;
    revenue: number;
    outstanding: number;
  };

  inventory: {
    warehouses: number;
    rawMaterialByUnit: Record<string, number>;
    finishedGoodsPacks: number;
    totalCapacity: number;
    /** Null when the branch holds stock in more than one unit. */
    utilisationPercent: number | null;
  };

  /**
   * FRD 6.4 names "operational efficiency" without defining it, so it is
   * defined as three rates the branch controls, each also returned separately
   * so a poor composite can be explained rather than merely reported. A
   * component with no data is excluded from the mean, not scored as zero.
   */
  efficiency: {
    productionYieldPercent: number | null;
    inspectionApprovalPercent: number | null;
    /** Only measurable for orders delivered since 19 Aug, when the timestamps landed. */
    onTimeDeliveryPercent: number | null;
    overallPercent: number | null;
  };
}

export interface BranchPerformanceQuery {
  /** ISO date. Defaults to 30 days ago. */
  from?: string;
  /** ISO date. Defaults to today. */
  to?: string;
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
  /** FRD 7.1 Family Details. Free text, advisory — never blocks approval. */
  familyDetails: string | null;

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

  createdById?: string | null;
  createdBy?: UserRef;

  // --- FRD 7.6 Farmer Performance -------------------------------------------
  // Persisted on the farmer so FRD 7.4 can filter and sort on the rating.
  // Null everywhere means unrated, which is NOT the same as zero — a farmer who
  // has never supplied has not been measured, and must not sort below one who
  // supplies badly.

  /** Composite 0–100, or null when there is no procurement history. */
  qualityRating: string | null;
  cropQualityScore: string | null;
  deliveryTimelinessScore: string | null;
  procurementQuantityScore: string | null;
  performanceUpdatedAt: string | null;

  createdAt: string;
  updatedAt: string;
}

/** One FRD 7.6 parameter. `score` is null when nothing feeds it. */
export interface PerformanceComponent {
  score: number | null;
  /** How many records produced the score. Zero means no basis. */
  sampleSize: number;
  /** Plain English — show this, never a bare number. */
  explanation: string;
}

/**
 * FRD 7.6 in full, recomputed live.
 *
 * `complaintRecords` is always unscored: FRD 32 does not exist, so it is
 * excluded from the average rather than counted as clean. Showing it anyway is
 * deliberate — a missing input the user can see is better than one they cannot.
 */
export interface FarmerPerformance {
  farmerId: string;
  cropQuality: PerformanceComponent;
  deliveryTimeliness: PerformanceComponent;
  procurementQuantity: PerformanceComponent;
  complaintRecords: PerformanceComponent;
  overallRating: number | null;
  /** The same figure as 0–5, for display only. */
  stars: number | null;
  totalDelivered: string;
  totalCollections: number;
  computedAt: string;
}

/** A field FRD 7.1 asks for that this farmer has not supplied. */
export interface MissingField {
  key: string;
  label: string;
  group: 'Personal' | 'Address' | 'Farm' | 'Bank';
  /** Why it matters — shown to whoever has to go and collect it. */
  reason: string;
}

/**
 * What still blocks approval (FRD 7.1).
 *
 * The same assessment the server's approval gate applies, exposed so the panel
 * can show the gap up front instead of letting someone click Approve and read
 * a refusal.
 */
export interface RegistrationReadiness {
  canApprove: boolean;
  missingRequired: MissingField[];
  /** PAN, GPS and family details. Reported, never blocking. */
  missingAdvisory: MissingField[];
  completenessPercent: number;
}

export interface FarmerVerificationLog {
  id: string;
  farmerId: string;
  action: FarmerVerificationAction;
  remarks: string | null;
  verifiedById: string;
  verifiedBy?: UserRef;
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
  qualityStandards?: string | null;
}

export interface FarmerSeedDistributionSummary {
  id: string;
  seedName: string;
  seedVariety: string | null;
  quantity: string;
  unit: string;
  distributionDate: string;
  batchNumber?: string | null;
}

export interface FarmerFieldVisitSummary {
  id: string;
  visitDate: string;
  cropName: string | null;
  cropHealth: string | null;
  cropGrowthStage: string | null;
  yieldPredictionQty: string | null;
  diseaseObservation?: string | null;
  harvestPreparation?: string | null;
  fertilizerAdvice?: string | null;
  pestControlSuggestions?: string | null;
  irrigationAdvice?: string | null;
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
  /** FRD 7.4 Crop — substring match against the farmer's recorded crop details. */
  crop?: string;
  /**
   * FRD 7.4 Quality Rating — farmers rated at or above this (0–100).
   * Unrated farmers are excluded: "not measured" is not "meets your bar".
   */
  minRating?: number;
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

export type UpdateFieldVisitInput = Partial<Omit<CreateFieldVisitInput, 'planId'>>;

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
  /**
   * FRD 12.1 - the planned visit this fulfils. Create only: the server marks the
   * plan COMPLETED and links it. Refused on update.
   */
  planId?: string;
}

export interface AddFieldVisitDocumentInput {
  fileUrl: string;
  fileType: string;
}

// --- Planned field visits (FRD 12.1) ---------------------------------------

export const FIELD_VISIT_PLAN_STATUSES = ['PLANNED', 'COMPLETED', 'CANCELLED'] as const;
export type FieldVisitPlanStatus = (typeof FIELD_VISIT_PLAN_STATUSES)[number];

export interface FieldVisitPlan {
  id: string;
  farmerId: string;
  farmer?: FarmerRef & { village?: string; district?: string; mobile?: string };
  branchId: string;
  branch?: BranchRef;
  /** The executive expected to make the visit. */
  expertId: string;
  expert?: UserRef;
  createdById: string;
  createdBy?: UserRef;
  plannedDate: string;
  purpose: string | null;
  cropName: string | null;
  notes: string | null;
  status: FieldVisitPlanStatus;
  completedVisitId: string | null;
  completedVisit?: { id: string; visitDate: string } | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFieldVisitPlanInput {
  farmerId: string;
  /** YYYY-MM-DD. */
  plannedDate: string;
  branchId?: string;
  /** Defaults server-side to whoever is planning. */
  expertId?: string;
  purpose?: string;
  cropName?: string;
  notes?: string;
}

/** The farmer is fixed; cancel and re-plan to move a visit to someone else. */
export type UpdateFieldVisitPlanInput = Partial<Omit<CreateFieldVisitPlanInput, 'farmerId'>>;

export interface FieldVisitPlanQuery {
  farmerId?: string;
  expertId?: string;
  status?: FieldVisitPlanStatus;
  /** YYYY-MM-DD, inclusive. */
  from?: string;
  /** YYYY-MM-DD, inclusive. */
  to?: string;
}

// --- Field report (FRD 12.7) ----------------------------------------------

export type FieldReportSeverity = 'HIGH' | 'MEDIUM' | 'INFO';
export type FieldReportRisk = 'LOW' | 'MEDIUM' | 'HIGH';
export type HarvestStage = 'NOT_READY' | 'APPROACHING' | 'READY' | 'OVERDUE' | 'UNKNOWN';

/**
 * GET /field-visits/:id/report. Generated on every read from the visit and the
 * records around it, so it always matches the visit it describes.
 */
export interface FieldReport {
  reportNumber: string;
  generatedAt: string;
  visit: {
    id: string;
    visitDate: string;
    recordedAt: string;
    expert: UserRef | null;
    branch: BranchRef | null;
    cropName: string | null;
    cropGrowthStage: string | null;
    cropHealth: string | null;
    pestStatus: string | null;
    diseaseObservation: string | null;
    yieldPredictionQty: number | null;
    documents: FieldVisitDocument[];
  };
  farmer: {
    id: string;
    fullName: string;
    farmerCode: string | null;
    mobile: string;
    village: string;
    district: string;
    state: string;
    gpsLocation: string | null;
    landType: string | null;
    irrigationType: string | null;
    qualityRating: number | null;
    status: FarmerStatus;
  };
  land: {
    registeredAcres: number | null;
    mappedAcres: number;
    plotCount: number;
    plots: Array<{
      id: string;
      name: string;
      surveyNumber: string | null;
      areaAcres: number | null;
      currentCrop: string | null;
      expectedHarvest: string | null;
    }>;
  };
  agreement: {
    id: string;
    cropName: string;
    variety: string | null;
    expectedQuantity: number | null;
    purchaseRate: number | null;
    harvestDate: string | null;
    status: AgreementStatus;
  } | null;
  recommendations: {
    fertilizer: string | null;
    irrigation: string | null;
    pestControl: string | null;
    harvestPreparation: string | null;
  };
  harvestOutlook: {
    predictedYieldKg: number | null;
    contractedKg: number | null;
    percentOfContract: number | null;
    expectedHarvestDate: string | null;
    daysToHarvest: number | null;
    stage: HarvestStage;
    hasHarvestInspection: boolean;
    summary: string;
  };
  riskLevel: FieldReportRisk;
  flags: Array<{ severity: FieldReportSeverity; message: string }>;
  nextSteps: { procurement: string[]; production: string[] };
  previousVisit: {
    id: string;
    visitDate: string;
    daysBefore: number;
    cropHealth: string | null;
    cropGrowthStage: string | null;
    pestStatus: string | null;
    yieldPredictionQty: number | null;
  } | null;
  plan: { id: string; plannedDate: string; purpose: string | null } | null;
  /** This is visit N to this farmer. */
  visitNumber: number;
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
  /** CENTRAL ships by courier; OUTLET is a franchise store delivering locally. */
  kind?: 'CENTRAL' | 'OUTLET';
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  serviceRadiusKm?: string | null;
  contactPhone?: string | null;
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

  /** Which of the farmer's plots this harvest came from. Optional throughout. */
  plotId: string | null;
  plot?: {
    id: string;
    name: string;
    surveyNumber: string | null;
    gpsLocation: string | null;
  } | null;

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
  /** Optional - a farmer whose land is not mapped yet is still inspectable. */
  plotId?: string;
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

/**
 * FRD 26.4. FAILED and REFUNDED added 20 Aug.
 *
 * FAILED is not PENDING: pending means nobody has tried, failed means someone
 * tried and it bounced. REFUNDED is terminal — money returned is not a
 * receivable, and the credit check excludes it for that reason.
 */
export const PAYMENT_STATUSES = ['PENDING', 'PARTIAL', 'PAID', 'FAILED', 'REFUNDED'] as const;
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

export const MOVEMENT_TYPES = ['PRODUCTION_INWARD', 'STOCK_IN', 'STOCK_OUT', 'TRANSFER', 'ADJUSTMENT'] as const;
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
  kind?: 'CENTRAL' | 'OUTLET';
  city?: string;
  state?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
  serviceRadiusKm?: number;
  contactPhone?: string;
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

  /**
   * The specific field this crop grew in.
   *
   * Null for harvests collected before plots existed, or from a farmer whose
   * land was never mapped - the page falls back to the village, which is a
   * coarser answer rather than a broken one.
   *
   * Note the two GPS points mean different things: `gpsLocation` above is where
   * the FARMER is, this one is where the CROP grew. On a scattered smallholding
   * they can be kilometres apart, and it is this one a consumer is actually
   * being shown.
   */
  plot: {
    id: string;
    name: string;
    surveyNumber: string | null;
    areaAcres: string;
    soilType: string | null;
    irrigationType: string | null;
    waterSource: string | null;
    currentCrop: string | null;
    sowingDate: string | null;
    expectedHarvest: string | null;
    gpsLocation: string | null;
  } | null;
}

// ===========================================================================
// ZONE 3 — Processing, QA & Packaging (FRD Sections 18-23)
// ===========================================================================

// --- Category (catalogue taxonomy, added 16 Sep) ----------------------------

/** The relation shape embedded on a Product - not the full Category record. */
export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  displayOrder: number;
  isActive: boolean;
  parentId: string | null;
  /** Loyalty default for products filed here; INHERIT follows the parent, then the program default. */
  loyaltyEligibility?: LoyaltyEligibility;
  /** Present on list/detail. */
  parent?: { id: string; name: string } | null;
  /** Present on GET /categories/:id only. */
  children?: Array<{ id: string; name: string; isActive: boolean }>;
  /** Present on list - how many child categories and products reference it, for the delete guard. */
  _count?: { children: number; products: number };
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryInput {
  name: string;
  /** Auto-derived from the name if left blank. */
  slug?: string;
  description?: string;
  imageUrl?: string;
  parentId?: string;
  loyaltyEligibility?: LoyaltyEligibility;
  displayOrder?: number;
}

export type UpdateCategoryInput = Partial<CreateCategoryInput>;

/** GET /storefront/categories - active categories only, nested two levels deep. */
export interface CategoryTreeNode {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  children: CategoryTreeNode[];
}

// --- Banners (storefront hero/promo CMS, added 18 Sep) ---------------------

export type BannerPlacement = 'HOMEPAGE' | 'CATEGORIES_PAGE' | 'PRODUCTS_PAGE';
export type BannerAudience = 'ALL' | 'B2C' | 'B2B';

export interface Banner {
  id: string;
  title: string;
  badgeText: string | null;
  description: string;
  imageUrl: string;
  ctaTextPrimary: string;
  ctaLinkPrimary: string;
  ctaTextSecondary: string | null;
  ctaLinkSecondary: string | null;
  backgroundColor: string;
  textColor: string;
  targetAudience: BannerAudience;
  placement: BannerPlacement;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBannerInput {
  title: string;
  badgeText?: string;
  description: string;
  imageUrl: string;
  ctaTextPrimary: string;
  ctaLinkPrimary: string;
  ctaTextSecondary?: string;
  ctaLinkSecondary?: string;
  backgroundColor?: string;
  textColor?: string;
  targetAudience?: BannerAudience;
  placement?: BannerPlacement;
  displayOrder?: number;
  isActive?: boolean;
}

export type UpdateBannerInput = Partial<CreateBannerInput>;

// --- Schemes (homepage "Today's Schemes & Offers" CMS, added 18 Sep) -------

export interface Scheme {
  id: string;
  tag: string;
  title: string;
  subtitle: string;
  ctaText: string;
  ctaLink: string;
  backgroundColor: string;
  textColor: string;
  badgeColor: string;
  badgeTextColor: string;
  buttonColor: string;
  buttonTextColor: string;
  targetAudience: BannerAudience;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSchemeInput {
  tag: string;
  title: string;
  subtitle: string;
  ctaText: string;
  ctaLink?: string;
  backgroundColor?: string;
  textColor?: string;
  badgeColor?: string;
  badgeTextColor?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  targetAudience?: BannerAudience;
  displayOrder?: number;
  isActive?: boolean;
}

export type UpdateSchemeInput = Partial<CreateSchemeInput>;

// --- Product master ---------------------------------------------------------

/** The category a product sits in, with its parent so a leaf reads "Atta & Flour > Chakki Atta". */
export interface CategoryRefWithParent extends CategoryRef {
  parent?: CategoryRef | null;
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  sku: string;
  unit: string | null;
  /** Decimal - serialised as a string by Prisma. */
  mrp: string | null;
  images: string[];
  displayOrder: number;
  isActive: boolean;
}

export interface ProductSpecification {
  id?: string;
  label: string;
  value: string;
}

export interface ProductFaq {
  id?: string;
  question: string;
  answer: string;
}

export interface ProductOffer {
  id?: string;
  title: string;
  description: string;
}

/** One quantity break of a price ladder, as the form edits it. */
export interface PriceTierInput {
  minQuantity: number;
  /** Per-unit price, excl. GST. Send this OR totalPrice. */
  unitPrice?: number;
  /** Total for minQuantity units, excl. GST. The server derives the per-unit price. */
  totalPrice?: number;
}

/** What one sellable unit (the product itself, or one variant) charges, per channel. */
export interface ChannelPricingInput {
  b2cPrice?: number;
  b2bTiers?: PriceTierInput[];
}

export interface ProductPricingInput extends ChannelPricingInput {
  gstRatePercent?: number;
}

/** One live rule, as GET /products/:id reports it back for the form to prefill. */
export interface LivePriceRule {
  id: string;
  customerType: string | null;
  minQuantity: number;
  /** Per-unit, excl. GST - what the order engine bills. */
  unitPrice: number;
  /** The total this tier was typed as, when entered as a total for minQuantity units. */
  tierTotal: number | null;
  gstRatePercent: number;
  effectiveFrom: string;
}

/** GET /products/:id -> `pricing`: what is charged today, by channel, for the product and each variant. */
export interface ProductLivePricing {
  asOf: string;
  B2B: LivePriceRule[];
  B2C: LivePriceRule[];
  variants: Array<{
    id: string;
    name: string;
    sku: string;
    B2B: LivePriceRule[];
    B2C: LivePriceRule[];
  }>;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  categoryId: string | null;
  category: CategoryRefWithParent | null;
  unit: string;
  isActive: boolean;

  /** Shopper-facing copy - null until staff write it. */
  description: string | null;
  images: string[];
  showOnStorefront: boolean;
  slug: string | null;
  metaTitle: string | null;
  metaDescription: string | null;

  /** Available quantity at or below this flags LOW on the inventory screen. */
  reorderPoint: number | null;
  /** Available quantity at or below this flags CRITICAL. */
  safetyStock: number | null;
  allowBackorder: boolean;

  // --- Product detail page content ---------------------------------------
  brand: string | null;
  packLabel: string | null;
  /** Decimal - serialised as a string by Prisma. */
  mrp: string | null;
  badge: string | null;
  hsnCode: string | null;
  rating: string | null;
  reviewCount: number | null;
  highlights: string[];
  manufacturer: string | null;
  countryOfOrigin: string | null;
  shelfLife: string | null;
  disclaimer: string | null;
  returnPolicy: string | null;
  warranty: string | null;
  minOrderQuantity: number | null;
  maxOrderQuantity: number | null;
  moqB2B: number | null;
  maxOrderQuantityB2B: number | null;
  packBoxSize: number | null;
  bulkAvailable: boolean;
  gstInvoiceAvailable: boolean;
  businessSupportContact: string | null;
  deliveryTerms: string | null;
  isTopPick: boolean;
  isDailyStaple: boolean;
  /** Per-product loyalty override; INHERIT follows the category, then the program default. */
  loyaltyEligibility: LoyaltyEligibility;
  /** true = the B2B tier table is entered as totals for each quantity. */
  b2bTiersAreTotals: boolean;

  /** Present on GET /products/:id. */
  recipes?: Array<{ id: string; recipeCode: string; version: number; status: RecipeStatus }>;
  variants?: ProductVariant[];
  specifications?: ProductSpecification[];
  faqs?: ProductFaq[];
  offers?: ProductOffer[];
  /** Present on GET /products/:id. */
  pricing?: ProductLivePricing;

  /** Present on the list - headline prices and pack-size count, so the master table needs no per-row call. */
  b2cPrice?: number | null;
  b2bPrice?: number | null;
  _count?: { variants: number };

  createdAt: string;
  updatedAt: string;
}

export type UpdateProductInput = Partial<CreateProductInput>;

export interface ProductVariantInput {
  /** Omit to create; pass an existing id to update in place. */
  id?: string;
  name: string;
  sku: string;
  unit?: string;
  mrp?: number;
  images?: string[];
  isActive?: boolean;
  pricing?: ChannelPricingInput;
}

export interface CreateProductInput {
  name: string;
  sku: string;
  unit: string;
  categoryId?: string;
  description?: string;
  images?: string[];
  showOnStorefront?: boolean;
  slug?: string;
  metaTitle?: string;
  metaDescription?: string;
  reorderPoint?: number;
  safetyStock?: number;
  allowBackorder?: boolean;

  brand?: string;
  packLabel?: string;
  mrp?: number;
  badge?: string;
  hsnCode?: string;
  rating?: number;
  reviewCount?: number;
  highlights?: string[];
  manufacturer?: string;
  countryOfOrigin?: string;
  shelfLife?: string;
  disclaimer?: string;
  returnPolicy?: string;
  warranty?: string;
  minOrderQuantity?: number;
  maxOrderQuantity?: number;
  moqB2B?: number;
  maxOrderQuantityB2B?: number;
  packBoxSize?: number;
  bulkAvailable?: boolean;
  gstInvoiceAvailable?: boolean;
  businessSupportContact?: string;
  deliveryTerms?: string;
  isTopPick?: boolean;
  isDailyStaple?: boolean;
  loyaltyEligibility?: LoyaltyEligibility;
  b2bTiersAreTotals?: boolean;

  /** Each list is authoritative when present, and left untouched when omitted. Array order is display order. */
  variants?: ProductVariantInput[];
  specifications?: ProductSpecification[];
  faqs?: ProductFaq[];
  offers?: ProductOffer[];
  pricing?: ProductPricingInput;
}

// --- Storefront catalogue (GET /storefront/catalogue/*) ---------------------

export type StorefrontChannel = 'B2B' | 'B2C';

export interface StorefrontPrice {
  /** Exclusive of GST - what the order engine bills against. */
  unitPrice: number;
  /** Exclusive price plus GST, rounded server-side. This is what a shopper reads. */
  unitPriceInclGst: number;
  gstRatePercent: number;
  currency: string;
}

export interface StorefrontPriceTier {
  minQuantity: number;
  /** Null on the last break - "100+". */
  maxQuantity: number | null;
  /** Exclusive of GST. */
  unitPrice: number;
  /** Inclusive of GST - the default display. */
  unitPriceInclGst: number;
  gstRatePercent: number;
  /** The total the tier was entered as ("5 packs for 2750"), or null when entered per unit. */
  tierTotal: number | null;
  /** Per-unit price (excl. GST) vs MRP, 2dp - computed server-side. Null without an MRP. */
  discountPercent: number | null;
}

/** What a listing card needs. */
export interface StorefrontProductCard {
  id: string;
  slug: string | null;
  name: string;
  sku: string;
  category: CategoryRef | null;
  unit: string;
  images: string[];
  price: StorefrontPrice | null;
  inStock: boolean;
  allowBackorder: boolean;
  brand: string | null;
  packLabel: string | null;
  mrp: number | null;
  badge: string | null;
  rating: number | null;
  reviewCount: number | null;
}

export interface StorefrontVariant {
  id: string;
  name: string;
  sku: string;
  unit: string;
  mrp: number | null;
  images: string[];
  price: StorefrontPrice | null;
  /** This pack size's own quantity-break ladder for the requested channel. */
  priceTiers: StorefrontPriceTier[];
}

/** GET /storefront/catalogue/products/:idOrSlug - every product-page section. */
export interface StorefrontProductDetail extends StorefrontProductCard {
  /** Detail only: the parent rides along so the breadcrumb can link a subcategory back to its main category. */
  category: CategoryRefWithParent | null;
  description: string | null;
  availableQuantity: number;
  highlights: string[];
  hsnCode: string | null;
  manufacturer: string | null;
  countryOfOrigin: string | null;
  shelfLife: string | null;
  disclaimer: string | null;
  returnPolicy: string | null;
  warranty: string | null;
  orderLimits: {
    minOrderQuantity: number;
    maxOrderQuantity: number | null;
    moqB2B: number;
    maxOrderQuantityB2B: number | null;
    packBoxSize: number | null;
    bulkAvailable: boolean;
    allowBackorder: boolean;
  };
  businessInfo: {
    gstInvoiceAvailable: boolean;
    businessSupportContact: string | null;
    deliveryTerms: string | null;
  };
  specifications: Array<{ label: string; value: string }>;
  faqs: Array<{ question: string; answer: string }>;
  offers: Array<{ title: string; description: string }>;
  variants: StorefrontVariant[];
  priceTiers: StorefrontPriceTier[];
  /** How many customers gave each star, from real reviews. */
  ratingBreakdown: Record<'1' | '2' | '3' | '4' | '5', number>;
  /** Newest customer ratings (up to 20), with their review text when they wrote one. */
  reviews: StorefrontProductReview[];
}

export interface StorefrontProductReview {
  id: string;
  rating: number;
  /** Null when the shopper only gave stars. */
  comment: string | null;
  /** First name + last initial - never a full name or phone. */
  author: string;
  /** Left from a delivered order. */
  verifiedPurchase: boolean;
  date: string;
}

export type StockStatus = 'OK' | 'LOW' | 'CRITICAL';

/** One row of GET /products/stock-summary - sellable quantity vs. threshold, aggregated across every warehouse. */
export interface ProductStockSummary {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  category: CategoryRef | null;
  availableQuantity: number;
  reorderPoint: number;
  safetyStock: number;
  allowBackorder: boolean;
  status: StockStatus;
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
  /** By-product recovered during cleaning with resale value (bran, choker, husk) — distinct from wastageQuantity, which is pure loss. */
  byProductQuantity: string | null;
  byProductName: string | null;
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
  byProductQuantity?: number;
  byProductName?: string;
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

export interface CompleteProductionInput {
  actualQuantity: number;
  byProductQuantity?: number;
  byProductName?: string;
  byProductRevenue?: number;
}

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
  /** By-product recovered during this run with resale value (e.g. oil cake) — distinct from productionLoss, which is pure loss. */
  byProductQuantity: string | null;
  byProductName: string | null;
  byProductRevenue: string | null;
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

// --- Loss / Yield Tracking ---------------------------------------------------
// Read-only aggregation over the existing Cleaning & Grading, Production and
// Finished Goods phases above. Adds no new phase.

export type YieldStageName = 'CLEANING_GRADING' | 'PRODUCTION' | 'FINISHED_GOODS';
export type YieldAlertLevel = 'NORMAL' | 'HIGH';

export interface YieldStageBreakdown {
  stage: YieldStageName;
  inputQuantity: number;
  outputQuantity: number;
  lossQuantity: number;
  lossPercent: number | null;
  byProductQuantity: number;
}

export interface YieldChain {
  productionBatchId: string;
  productionBatchNumber: string;
  productId: string;
  productName: string;
  branchId: string;
  machineName: string | null;
  machineNumber: string | null;
  productionDate: string;
  stages: YieldStageBreakdown[];
  totalInput: number;
  totalLoss: number;
  totalByProduct: number;
  finalOutput: number;
  overallYieldPercent: number | null;
  totalLossPercent: number | null;
  alertLevel: YieldAlertLevel;
  fgBatchNumbers: string[];
}

export interface YieldChainListResult {
  data: YieldChain[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface YieldChainQuery {
  productId?: string;
  branchId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface FarmerYieldQuality {
  farmerId: string;
  farmerCode: string | null;
  fullName: string;
  rawMaterialBatches: number;
  averageLossPercent: number | null;
  flagged: boolean;
}

export interface MachineYieldHealth {
  machineName: string;
  machineNumber: string | null;
  totalRuns: number;
  historicalAverageLossPercent: number;
  flaggedRuns: Array<{
    productionBatchId: string;
    productionBatchNumber: string;
    lossPercent: number;
    productionDate: string;
  }>;
  needsMaintenanceReview: boolean;
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
    holdStatus: BatchHoldStatus;
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

// ---------------------------------------------------------------------------
// Zone 4 — Sales (WS2.5)
// ---------------------------------------------------------------------------

export const SALES_CHANNELS = ['B2B', 'B2C'] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];

export const CUSTOMER_TYPES = ['DISTRIBUTOR', 'RETAILER', 'INSTITUTIONAL', 'CONSUMER'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const PAYMENT_TERMS = ['PREPAID', 'CREDIT_7', 'CREDIT_15', 'CREDIT_30', 'CREDIT_45'] as const;
export type PaymentTerms = (typeof PAYMENT_TERMS)[number];

export type CustomerStatus = 'ACTIVE' | 'INACTIVE' | 'BLACKLISTED';

/**
 * One registry, two channels.
 *
 * The optional fields are not optional by accident: a B2C consumer has no
 * GSTIN, no credit limit and no assigned executive, and asking for them would
 * be asking for data that does not exist. Which fields apply is decided by
 * `channel`, which is fixed at registration.
 */
export interface Customer {
  id: string;
  customerCode: string;
  channel: SalesChannel;
  type: CustomerType;

  name: string;
  contactName: string | null;
  phone: string;
  email: string | null;

  /** B2B only. It is what goes on the tax invoice. */
  gstin: string | null;

  billingAddress: string;
  shippingAddress: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;

  /** B2B only. Null means no credit — everything is prepaid. */
  creditLimit: string | null;
  paymentTerms: PaymentTerms;

  status: CustomerStatus;
  branchId: string | null;
  branch?: BranchRef | null;
  assignedToId: string | null;
  assignedTo?: UserRef | null;

  /** Auto-generated, unique — this customer's own shareable refer-a-friend code. */
  referralCode: string;

  /** Set if a referral code was used at this customer's signup. Null for staff-created or unreferred customers. */
  referredAs?: { referrer: { id: string; name: string; customerCode: string; referralCode: string } } | null;

  /** Running coin total — see ReferralSettings and CoinTransaction. */
  coinBalance: number;

  /** Last 20, newest first. Only present on the single-customer GET, not the list. */
  orders?: {
    id: string;
    orderNumber: string;
    orderDate: string;
    status: OrderStatus;
    total: string;
    paymentStatus: PaymentStatus;
  }[];

  createdAt: string;
  updatedAt: string;
}

export interface CustomerCredit {
  customerId: string;
  creditLimit: number | null;
  /** Unpaid on confirmed-and-beyond orders. */
  outstanding: number;
  /** Null when there is no limit set. */
  availableCredit: number | null;
}

export interface CustomerWalletTransaction {
  id: string;
  amount: number;
  reason: string;
  note: string | null;
  createdAt: string;
  order?: { orderNumber: string } | null;
}

export interface CustomerWallet {
  balance: number;
  totalEarned: number;
  totalUsed: number;
  transactions: CustomerWalletTransaction[];
}

export interface CustomerProductReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  product: { id: string; name: string; sku: string };
  order?: { orderNumber: string } | null;
}

export interface CustomerWishlistItem {
  productId: string;
  createdAt: string;
  product: { id: string; name: string; sku: string; unit: string; images: string[] };
}

export type SupportTicketCategory = 'ORDER_ISSUE' | 'PAYMENT_REFUND' | 'DELIVERY_DELAY' | 'ACCOUNT_GST' | 'OTHER';
export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type SupportTicketPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export interface CustomerSupportTicket {
  id: string;
  ticketNumber: string;
  category: SupportTicketCategory;
  subject: string;
  description: string;
  orderNumber: string | null;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  resolutionNote: string | null;
  resolvedAt: string | null;
  resolvedBy?: { id: string; fullName: string } | null;
  createdAt: string;
}

export interface CustomerQuery {
  channel?: SalesChannel;
  type?: CustomerType;
  status?: CustomerStatus;
  /** One box across name, customer code, phone and GSTIN — the server decides which matched. */
  search?: string;
  branchId?: string;
}

export interface CreateCustomerInput {
  channel: SalesChannel;
  type: CustomerType;
  name: string;
  contactName?: string;
  phone: string;
  email?: string;
  gstin?: string;
  /** Required for B2B (tax invoice). Optional for a quick B2C registration. */
  billingAddress?: string;
  shippingAddress?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  creditLimit?: number;
  paymentTerms?: PaymentTerms;
  branchId?: string;
  assignedToId?: string;
  /** Create only. Defaults to ACTIVE. */
  status?: CustomerStatus;
  /** Create only. Another customer's referral code, if this signup was referred. */
  referredByCode?: string;
}

/** Channel is absent on purpose — the server refuses to change it. */
export type UpdateCustomerInput = Omit<Partial<CreateCustomerInput>, 'channel'>;

// --- Pricing ---------------------------------------------------------------

/**
 * A dated price rule, not a price.
 *
 * `effectiveTo` null means "current". A rule is never edited: superseding closes
 * the old one and opens a new one, so an invoice raised in June still resolves
 * to June's rate years later.
 */
export interface PriceList {
  id: string;
  productId: string;
  product?: { id: string; name: string; sku: string };
  channel: SalesChannel;
  /** Null means the rule applies to every customer type in the channel. */
  customerType: CustomerType | null;
  unitPrice: string;
  currency: string;
  gstRatePercent: string;
  minQuantity: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  createdBy?: UserRef;
  createdAt: string;
  updatedAt: string;
}

/**
 * What GET /price-lists actually accepts. Nothing more.
 *
 * There is deliberately no `customerType` here: the endpoint does not take one,
 * and a field the server ignores is worse than no field — the filter appears to
 * work and quietly returns everything. The screen narrows by customer type in
 * the browser instead, and says so.
 */
export interface PriceListQuery {
  productId?: string;
  channel?: SalesChannel;
  activeOnly?: boolean;
}

export interface PriceComparison {
  productId: string;
  b2b: PriceList | null;
  b2c: PriceList | null;
}

export interface CreatePriceListInput {
  productId: string;
  channel: SalesChannel;
  customerType?: CustomerType;
  unitPrice: number;
  gstRatePercent?: number;
  minQuantity?: number;
  effectiveFrom: string;
}

/**
 * Note what is absent: `minQuantity`.
 *
 * SupersedePriceDto does not accept it, and the API runs
 * `forbidNonWhitelisted` — sending it is a 400, not a shrug. That is the right
 * behaviour: the quantity break is part of which rule this IS. Changing it
 * means opening a different rule, not re-rating this one.
 */
export interface SupersedePriceInput {
  unitPrice: number;
  effectiveFrom: string;
  gstRatePercent?: number;
}

// --- Orders ----------------------------------------------------------------

export const ORDER_STATUSES = [
  'DRAFT',
  'PLACED',
  'CONFIRMED',
  'ALLOCATED',
  'PACKED',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderItem {
  id: string;
  productId: string;
  product?: { id: string; name: string; sku: string };
  quantity: number;
  unitPrice: string;
  /** Which price rule produced this line — the answer to an invoice dispute. */
  priceListId: string | null;
  priceList?: { id: string; effectiveFrom: string; minQuantity: number } | null;
  gstRatePercent: string;
  lineSubtotal: string;
  lineTax: string;
  lineTotal: string;
}

/**
 * A batch reserved against an order line.
 *
 * `releasedAt` non-null means the reservation was given back — the order was
 * cancelled or re-allocated. The row is kept deliberately (A-13): "you
 * allocated me FG-...-003 and then cancelled" needs an answer in the data.
 */
export interface OrderAllocation {
  id: string;
  orderItemId: string;
  fgBatchId: string;
  fgBatch?: { id: string; fgBatchNumber: string; expiryDate: string | null; qaReleased: boolean };
  warehouseId: string;
  quantity: number;
  releasedAt: string | null;
  releasedReason: string | null;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  channel: SalesChannel;
  customerId: string;
  customer?: { id: string; customerCode: string; name: string; channel: SalesChannel; phone?: string | null; gstin?: string | null };
  status: OrderStatus;
  orderDate: string;
  requiredByDate: string | null;
  warehouseId: string;
  warehouse?: { id: string; name: string };
  branchId: string | null;
  subtotal: string;
  taxTotal: string;
  total: string;
  paymentStatus: PaymentStatus;
  paymentTerms: PaymentTerms;
  /** FRD 24.2 — snapshotted at order time, not read from the customer now. */
  deliveryAddress: string | null;
  /** Storefront checkout fields (absent/null on staff-placed orders). */
  source?: 'STAFF' | 'STOREFRONT';
  fulfillmentMethod?: 'LOCAL' | 'SHIPROCKET' | null;
  paymentMode?: 'ONLINE' | 'COD' | 'CREDIT' | null;
  riderName?: string | null;
  riderPhone?: string | null;
  discountTotal?: string;
  deliveryFee?: string;
  couponCode?: string | null;
  etaMin?: string | null;
  etaMax?: string | null;
  distanceKm?: string | null;
  shipment?: { awb?: string | null; courier?: string | null; trackingUrl?: string | null } | null;
  notes: string | null;
  cancelledReason: string | null;
  cancelledAt: string | null;
  /** Stamped server-side at the DISPATCHED transition. Null until then. */
  dispatchedAt: string | null;
  /** Stamped server-side at the DELIVERED transition. Null until then. */
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDetail extends Order {
  items: OrderItem[];
  /** Includes released rows — filter on `releasedAt` for the live ones. */
  allocations: OrderAllocation[];
}

/**
 * What GET /orders actually accepts.
 *
 * `paymentStatus` is absent for the same reason as above — the endpoint has no
 * such parameter. The orders screen filters payment status client-side.
 */
export interface OrderQuery {
  status?: OrderStatus;
  channel?: SalesChannel;
  customerId?: string;
  warehouseId?: string;
  /** ISO date. Order date on or after. */
  from?: string;
  /** ISO date. Order date on or before. */
  to?: string;
}

export interface CreateOrderInput {
  customerId: string;
  warehouseId: string;
  orderDate?: string;
  requiredByDate?: string;
  items: Array<{ productId: string; quantity: number }>;
  /** Defaults to the customer's shipping, then billing address. */
  deliveryAddress?: string;
  notes?: string;
  /** DRAFT saves it without pricing being final. Defaults to PLACED. */
  status?: 'DRAFT' | 'PLACED';
}

export interface PlaceOrderResult {
  order: OrderDetail;
  /** Lines whose price moved between drafting and placing. Usually empty. */
  repriced: Array<{ orderItemId: string; from: number; to: number }>;
}

/** A line allocation could not fill completely (FRD 25.4). */
export interface AllocationShortfall {
  orderItemId: string;
  productId: string;
  productName: string;
  sku: string | null;
  requested: number;
  allocated: number;
  short: number;
}

export interface ReallocationResult {
  orderNumber: string;
  released: Array<{ fgBatchNumber: string; quantity: number; reason: string }>;
  allocations: Array<{ orderItemId: string; fgBatchNumber: string; quantity: number }>;
  shortfalls: Array<{ orderItemId: string; productId: string; short: number }>;
  complete: boolean;
}

export interface AllocationResult {
  order: Order;
  allocations: OrderAllocation[];
  /**
   * Lines that could not be filled in full. Empty on a clean allocation.
   *
   * Allocation takes what exists rather than refusing outright, so this is the
   * only thing standing between a partially-filled order and one that looks
   * allocated and quietly ships short. Show it.
   */
  shortfalls: AllocationShortfall[];
  complete: boolean;
}

// ---------------------------------------------------------------------------
// Storefront accounts (WS2.5 addendum, 16 Sep) — the B2C/B2B self-service
// login queue. Separate from Customer: this is the *login*, approved rows are
// linked to the *commercial record* via customerId. See
// svv-balaji-backend/src/storefront/ for the reasoning.
// ---------------------------------------------------------------------------

export type CustomerAccountStatus =
  | 'PENDING_VERIFICATION'
  | 'PENDING_APPROVAL'
  | 'ACTIVE'
  | 'REJECTED'
  | 'SUSPENDED';

export interface CustomerAccount {
  id: string;
  phone: string;
  email: string | null;
  fullName: string;
  channel: SalesChannel;
  status: CustomerAccountStatus;
  phoneVerifiedAt: string | null;
  lastLoginAt: string | null;
  customerId: string | null;
  customer?: { id: string; customerCode: string; referralCode?: string } | null;

  /** Set on a B2B registration only; null for a self-provisioned B2C account. */
  businessName: string | null;
  gstin: string | null;
  pan: string | null;
  addressLine: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;

  /** The referral code this applicant entered at signup, if any — see Customer.referralCode. */
  referralCode: string | null;

  reviewedById: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface CustomerAccountQuery {
  channel?: SalesChannel;
  search?: string;
}

export interface RejectCustomerAccountInput {
  reason: string;
}

// ---------------------------------------------------------------------------
// Referral & Reward Settings (17 Sep) — the coin amounts, trigger and on/off
// switch for the refer-a-friend program. One row, read live at every
// candidate trigger event rather than frozen onto a Referral at creation —
// see svv-balaji-backend/src/common/referral.service.ts.
// ---------------------------------------------------------------------------

export type ReferralRewardTrigger =
  | 'REGISTRATION'
  | 'ACCOUNT_VERIFICATION'
  | 'FIRST_ORDER'
  | 'FIRST_DELIVERY';

export const REFERRAL_REWARD_TRIGGERS: readonly ReferralRewardTrigger[] = [
  'REGISTRATION',
  'ACCOUNT_VERIFICATION',
  'FIRST_ORDER',
  'FIRST_DELIVERY',
];

export const REFERRAL_REWARD_TRIGGER_LABELS: Record<ReferralRewardTrigger, string> = {
  REGISTRATION: 'After Registration',
  ACCOUNT_VERIFICATION: 'After Account Verification',
  FIRST_ORDER: 'After First Successful Order',
  FIRST_DELIVERY: 'After First Order Delivery',
};

export interface ReferralFaqItem {
  question: string;
  answer: string;
}

export interface ReferralSettings {
  id: string;
  referrerRewardCoins: number;
  refereeRewardCoins: number;
  rewardTrigger: ReferralRewardTrigger;
  isActive: boolean;
  customerFaqs?: ReferralFaqItem[];
  retailerFaqs?: ReferralFaqItem[];
  /** Whether referral coins can be redeemed at checkout at all. */
  redemptionEnabled: boolean;
  /** What one referral coin is worth, in INR. */
  pointValueInr: number;
  /** % of an order's payable amount referral coins may cover. */
  maxRedemptionPercent: number;
  /** A redemption below this many coins is refused outright. */
  minRedeemPoints: number;
  /** Months until an earned referral coin lapses if unspent; null = never. */
  pointsExpiryMonths: number | null;
  updatedById: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface UpdateReferralSettingsInput {
  referrerRewardCoins?: number;
  refereeRewardCoins?: number;
  rewardTrigger?: ReferralRewardTrigger;
  isActive?: boolean;
  customerFaqs?: ReferralFaqItem[];
  retailerFaqs?: ReferralFaqItem[];
  redemptionEnabled?: boolean;
  pointValueInr?: number;
  maxRedemptionPercent?: number;
  minRedeemPoints?: number;
  pointsExpiryMonths?: number | null;
}

// ---------------------------------------------------------------------------
// Wallet (unified referral + loyalty coin redemption) configuration
// ---------------------------------------------------------------------------

export type WalletRedemptionMode = 'SEPARATE' | 'COMBINED';

export interface WalletSettings {
  id: string;
  redemptionMode: WalletRedemptionMode;
  updatedById: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface UpdateWalletSettingsInput {
  redemptionMode?: WalletRedemptionMode;
}

export interface WalletBalance {
  referralBalance: number;
  loyaltyBalance: number;
  totalBalance: number;
}

// ---------------------------------------------------------------------------
// Help & Customer Support Configuration (Dynamic Super Admin Managed)
// ---------------------------------------------------------------------------

export interface SupportFaqItem {
  id?: string;
  category?: string;
  question: string;
  answer: string;
}

export interface SupportSettings {
  id?: string;
  tollFreeNumber: string;
  whatsappNumber: string;
  supportEmail: string;
  operatingHours: string;
  officeAddress: string;
  isPhoneSupportActive: boolean;
  isWhatsappSupportActive: boolean;
  isEmailSupportActive: boolean;
  helpCategories: string[];
  customerFaqs: SupportFaqItem[];
  retailerFaqs: SupportFaqItem[];
  updatedAt?: string;
}

export interface UpdateSupportSettingsInput {
  tollFreeNumber?: string;
  whatsappNumber?: string;
  supportEmail?: string;
  operatingHours?: string;
  officeAddress?: string;
  isPhoneSupportActive?: boolean;
  isWhatsappSupportActive?: boolean;
  isEmailSupportActive?: boolean;
  helpCategories?: string[];
  customerFaqs?: SupportFaqItem[];
  retailerFaqs?: SupportFaqItem[];
}

// ---------------------------------------------------------------------------
// Referral Management (17 Sep) — Super Admin reporting over what the program
// above actually produced: who referred whom, whether it qualified, the coin
// ledger behind any customer's balance, and manual corrections to it. See
// svv-balaji-backend/src/referrals/referrals.module.ts.
// ---------------------------------------------------------------------------

/** The referrer or referee side of a Referral row, as the list endpoint returns it. */
export interface ReferralParty {
  id: string;
  name: string;
  phone: string;
  customerCode: string;
  referralCode: string;
  channel: SalesChannel;
  status?: CustomerStatus;
}

export interface QualifyingOrderRef {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: string;
}

export interface Referral {
  id: string;
  code: string;
  createdAt: string;
  rewardedAt: string | null;
  /** True once the configured trigger has fired and both sides have been paid. */
  qualified: boolean;
  referrer: ReferralParty;
  referee: ReferralParty;
  referrerCoins: number;
  refereeCoins: number;
  /** The order whose confirm/deliver transition paid this out, for an order-based trigger. Null otherwise. */
  qualifyingOrder: QualifyingOrderRef | null;
}

export interface ReferralQuery {
  search?: string;
  status?: 'QUALIFIED' | 'PENDING';
  channel?: SalesChannel;
  from?: string;
  to?: string;
}

export type CoinTransactionReason =
  | 'REFERRAL_REFERRER_REWARD'
  | 'REFERRAL_REFEREE_REWARD'
  | 'LOYALTY_EARN'
  | 'LOYALTY_REVERSAL'
  | 'LOYALTY_EXPIRY'
  | 'MANUAL_ADJUSTMENT';

export const COIN_TRANSACTION_REASON_LABELS: Record<CoinTransactionReason, string> = {
  REFERRAL_REFERRER_REWARD: 'Referral reward (as referrer)',
  REFERRAL_REFEREE_REWARD: 'Referral reward (as referred user)',
  LOYALTY_EARN: 'Loyalty points earned',
  LOYALTY_REVERSAL: 'Loyalty points reversed (return)',
  LOYALTY_EXPIRY: 'Loyalty points expired',
  MANUAL_ADJUSTMENT: 'Manual adjustment',
};

export interface CoinTransaction {
  id: string;
  customerId: string;
  /** Positive credits, negative debits — see the reason for which kind. */
  amount: number;
  reason: CoinTransactionReason;
  note: string | null;
  referralId: string | null;
  referral: {
    id: string;
    referrerId: string;
    refereeId: string;
    referrer: { id: string; name: string; customerCode: string } | null;
    referee: { id: string; name: string; customerCode: string } | null;
  } | null;
  orderId: string | null;
  order: QualifyingOrderRef | null;
  performedById: string | null;
  performedBy: { id: string; fullName: string } | null;
  createdAt: string;
}

export interface CoinLedger {
  customer: {
    id: string;
    name: string;
    phone: string;
    customerCode: string;
    referralCode: string;
    coinBalance: number;
  };
  balance: number;
  totalEarned: number;
  totalAdjusted: number;
  transactions: CoinTransaction[];
}

export interface AdjustCoinBalanceInput {
  /** Positive refunds/bonuses the balance; negative claws it back. Never zero. */
  amount: number;
  note: string;
}

// --- Coupons & Promo Codes (added 18 Sep) ----------------------------------

export type CouponDiscountType = 'FIXED' | 'PERCENTAGE';

export interface Coupon {
  id: string;
  code: string;
  title: string;
  description: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minOrderValue: number;
  maxDiscount?: number;
  targetAudience: BannerAudience;
  expiryDate?: string;
  usageLimit?: number;
  usedCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCouponInput {
  code: string;
  title: string;
  description: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minOrderValue?: number;
  maxDiscount?: number;
  targetAudience?: BannerAudience;
  expiryDate?: string;
  usageLimit?: number;
  isActive?: boolean;
}



// --- Recall & batch audit -----------------------------------------------------

export type BatchHoldStatus = 'ACTIVE' | 'ON_HOLD' | 'RECALLED';

export interface RecallShipment {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  channel: 'B2B' | 'B2C';
  orderDate: string;
  dispatchedAt: string | null;
  shipped: boolean;
  quantity: number;
  warehouse: string;
  customer: { customerCode: string; name: string; phone: string };
}

export interface RecallBatch {
  fgBatchNumber: string;
  product: { name: string; sku: string };
  holdStatus: BatchHoldStatus;
  holdReason: string | null;
  qaReleased: boolean;
  manufacturingDate: string;
  expiryDate: string | null;
  packCount: number;
  stock: Array<{ warehouse: string; quantity: number; reserved: number }>;
  shipments: RecallShipment[];
}

export interface ForwardTrace {
  query: string;
  kind: 'FG' | 'RAW';
  batches: RecallBatch[];
  totals: {
    batches: number;
    orders: number;
    customers: number;
    packsShipped: number;
    packsAllocatedNotShipped: number;
    packsInStock: number;
  };
}

export interface BackwardTrace {
  fgBatchNumber: string;
  product: { name: string; sku: string };
  holdStatus: BatchHoldStatus;
  holdReason: string | null;
  packing: { packedOn: string; packedBy: string; packagingType: string };
  production: {
    productionBatchNumber: string;
    productionDate: string;
    branch: string;
    machine: string | null;
    productionLine: string | null;
    operator: string | null;
    supervisor: string;
    plannedQuantity: number;
    actualQuantity: number | null;
    lossQuantity: number | null;
    lossPercent: number | null;
  };
  rawLots: Array<{
    batchNumber: string;
    crop: string;
    quantityUsed: number;
    source: { type: 'FARMER' | 'SUPPLIER'; code: string; name: string; place: string } | null;
    weighingSlip: { receiptNumber: string; date: string; grossWeight: number; netWeight: number } | null;
    payout: { receiptNumber: string | null; totalAmount: number | null; paymentStatus: string } | null;
  }>;
  fifo: {
    checked: boolean;
    compliant: boolean | null;
    violations: Array<{ warehouse: string; olderBatch: string; expiryDate: string | null; quantityRemaining: number }>;
  };
  holdHistory: Array<{
    fromStatus: BatchHoldStatus;
    toStatus: BatchHoldStatus;
    reason: string;
    createdAt: string;
    performedBy: { fullName: string };
  }>;
}

export interface SetBatchHoldInput {
  fgBatchNumbers: string[];
  status: BatchHoldStatus;
  reason: string;
}

export interface SetBatchHoldResult {
  status: BatchHoldStatus;
  changed: string[];
  unchanged: string[];
}
