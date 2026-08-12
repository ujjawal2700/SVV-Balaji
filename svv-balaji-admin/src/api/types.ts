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
  createdAt: string;
  updatedAt: string;
}

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
  createdAt: string;
  updatedAt: string;
}

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
