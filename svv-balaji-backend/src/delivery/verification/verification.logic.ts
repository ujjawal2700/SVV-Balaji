import type { RiderDocumentStatus } from '@prisma/client';

/**
 * Whether a rider has cleared onboarding: every mandatory document (the PCC is
 * always one) approved and in date, and the security deposit paid when that
 * rule is on. Pure - the service loads the facts, this decides. The rider app,
 * the admin screens and the dispatch gate all read the same answer.
 */

export interface DocTypeFacts {
  id: string;
  code: string;
  name: string;
  isMandatory: boolean;
  isActive: boolean;
  isSystem: boolean;
  sortOrder: number;
}

export interface DocFacts {
  id: string;
  typeId: string;
  status: RiderDocumentStatus;
  /** Calendar date (stored as UTC midnight); valid through the end of that day in India. */
  expiresOn: Date | null;
  supersededAt: Date | null;
  createdAt: Date;
}

/** What the rider / staff see for one document type. */
export type DocState = 'NOT_UPLOADED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export const DOC_STATE_LABEL: Record<DocState, string> = {
  NOT_UPLOADED: 'not uploaded',
  PENDING: 'waiting for review',
  APPROVED: 'approved',
  REJECTED: 'rejected - upload again',
  EXPIRED: 'expired - upload a new one',
};

/** A renewal may be uploaded this long before an approved document expires. */
export const RENEWAL_WINDOW_DAYS = 30;

const DAY = 864e5;

/** End of the expiry day in India (IST, +05:30), as an instant. */
export function endOfExpiryDay(expiresOn: Date): Date {
  const ymd = expiresOn.toISOString().slice(0, 10);
  return new Date(new Date(`${ymd}T00:00:00+05:30`).getTime() + DAY);
}

export interface DocAssessment {
  typeId: string;
  code: string;
  name: string;
  mandatory: boolean;
  state: DocState;
  /** An approved, in-date document is on file (it may sit behind a newer pending / rejected upload). */
  satisfied: boolean;
  /** When the approval stops counting; null = no expiry, or not satisfied. */
  validUntil: Date | null;
  /** The newest live upload, and the approved one in force (may be the same). */
  latestId: string | null;
  approvedId: string | null;
  /** May the rider upload now (first upload, re-upload after rejection, replace a pending one, renew). */
  canUpload: boolean;
}

/** `docs` are this rider's uploads of this type, any order; superseded ones are ignored. */
export function assessDocument(type: DocTypeFacts, docs: DocFacts[], now: Date): DocAssessment {
  const live = docs.filter((d) => d.typeId === type.id && !d.supersededAt).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const latest = live[0] ?? null;
  const approved = live.find((d) => d.status === 'APPROVED') ?? null;
  const approvedUntil = approved?.expiresOn ? endOfExpiryDay(approved.expiresOn) : null;
  const approvedValid = Boolean(approved) && (!approvedUntil || approvedUntil > now);

  let state: DocState;
  if (!latest) state = 'NOT_UPLOADED';
  else if (latest.status === 'PENDING') state = 'PENDING';
  else if (latest.status === 'REJECTED') state = 'REJECTED';
  else state = approvedValid ? 'APPROVED' : 'EXPIRED';

  // An approved document is only replaced when it has expired or is about to.
  const canUpload = !(state === 'APPROVED' && (!approvedUntil || approvedUntil.getTime() - now.getTime() > RENEWAL_WINDOW_DAYS * DAY));

  return {
    typeId: type.id,
    code: type.code,
    name: type.name,
    mandatory: type.isMandatory || type.isSystem,
    state,
    satisfied: approvedValid,
    validUntil: approvedValid ? approvedUntil : null,
    latestId: latest?.id ?? null,
    approvedId: approved?.id ?? null,
    canUpload,
  };
}

export type DepositStatus = 'NOT_REQUIRED' | 'NOT_PAID' | 'PARTIALLY_PAID' | 'PAID';

export interface DepositAssessment {
  required: boolean;
  requiredAmount: number;
  paid: number;
  pending: number;
  status: DepositStatus;
  satisfied: boolean;
}

const money = (n: number) => Math.round(n * 100) / 100;

export function assessDeposit(rule: { required: boolean; amount: number }, paid: number): DepositAssessment {
  const requiredAmount = rule.required ? money(Math.max(0, rule.amount)) : 0;
  const p = money(paid);
  const pending = money(Math.max(0, requiredAmount - p));
  const status: DepositStatus = !rule.required ? 'NOT_REQUIRED' : pending === 0 ? 'PAID' : p > 0 ? 'PARTIALLY_PAID' : 'NOT_PAID';
  return { required: rule.required, requiredAmount, paid: p, pending, status, satisfied: pending === 0 };
}

export interface VerificationAssessment {
  /** Every active document type, mandatory first then by sort order. */
  documents: DocAssessment[];
  /** The Police Clearance Certificate entry (also in `documents`); null if the type is missing. */
  pcc: DocAssessment | null;
  deposit: DepositAssessment;
  /** All conditions met: the rider may be approved, go online and get orders. */
  eligible: boolean;
  /** Human-readable list of what is still missing, for the rider and staff. */
  missing: string[];
  /** The gate lapses here (earliest expiry of a mandatory approval); null = never. */
  verifiedUntil: Date | null;
}

export const PCC_CODE = 'PCC';

export function assessVerification(
  types: DocTypeFacts[],
  docs: DocFacts[],
  deposit: { required: boolean; amount: number; paid: number },
  now: Date,
): VerificationAssessment {
  const documents = types
    .filter((t) => t.isActive || t.isSystem)
    .map((t) => ({ t, a: assessDocument(t, docs, now) }))
    .sort((x, y) => Number(y.a.mandatory) - Number(x.a.mandatory) || x.t.sortOrder - y.t.sortOrder || x.t.name.localeCompare(y.t.name))
    .map((x) => x.a);
  const dep = assessDeposit({ required: deposit.required, amount: deposit.amount }, deposit.paid);
  const missing: string[] = [];
  for (const d of documents) if (d.mandatory && !d.satisfied) missing.push(`${d.name}: ${DOC_STATE_LABEL[d.state]}`);
  if (!dep.satisfied) missing.push(`Security deposit: ₹${dep.pending.toLocaleString('en-IN')} still to pay`);
  const until = documents.filter((d) => d.mandatory && d.validUntil).map((d) => d.validUntil!.getTime());
  return {
    documents,
    pcc: documents.find((d) => d.code === PCC_CODE) ?? null,
    deposit: dep,
    eligible: missing.length === 0,
    missing,
    verifiedUntil: missing.length === 0 && until.length ? new Date(Math.min(...until)) : null,
  };
}

/** The dispatch gate from the stored flags: verified, and not past the earliest expiry. */
export const isVerifiedNow = (r: { isVerified: boolean; verifiedUntil: Date | null }, now = new Date()) =>
  r.isVerified && (!r.verifiedUntil || r.verifiedUntil > now);
