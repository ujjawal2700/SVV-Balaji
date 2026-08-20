import type { Farmer } from '@prisma/client';

/**
 * What a complete farmer record is, per FRD 7.1.
 *
 * This list is the single definition. The approval gate reads it, the readiness
 * endpoint reads it, and the panel renders it — so "what is missing" can never
 * be answered three different ways.
 *
 * ## Why this is checked at approval and not at registration
 *
 * Registration happens in a field, on a phone, often standing next to the
 * farmer with no passbook to hand. Requiring sixteen fields there does not
 * produce complete records; it produces records captured on paper and typed in
 * later, or not at all.
 *
 * Approval is the right gate because it is where the FRD already draws the
 * line: 7.2 says a farmer "must be verified before participating in procurement
 * activities", and approval is also where the permanent traceability code is
 * minted (8.1). After that point the farmer can supply a harvest and be owed
 * money — which is precisely why the bank details cannot still be blank.
 *
 * ## Why PAN and GPS are absent from this list
 *
 * Both are listed in FRD 7.1, and both are deliberately not required.
 *
 * PAN: agricultural income is exempt under Section 10(1), and a large share of
 * smallholders genuinely have no PAN. Requiring it would not improve the data,
 * it would block real farmers or teach staff to type a fake number — which is
 * worse than a null, because a null is honest.
 *
 * GPS: captured in the field by the Agriculture Expert, not at a desk by the
 * person registering. Requiring it at approval would block approvals on a
 * measurement the approver is not in a position to take. It is also captured
 * per plot in land profiling, which is the more useful place for it.
 *
 * Both remain on the form, and both are reported as advisory gaps.
 */
export interface RequiredField {
  /** Property on the Farmer record. */
  key: keyof Farmer;
  /** What the user sees. Matches the form's label exactly. */
  label: string;
  /** FRD 7.1 grouping, so the panel can show the gaps the way the form is laid out. */
  group: 'Personal' | 'Address' | 'Farm' | 'Bank';
  /** Why it blocks approval — shown to whoever has to go and collect it. */
  reason: string;
}

export const REQUIRED_FOR_APPROVAL: RequiredField[] = [
  {
    key: 'aadhaarNumber',
    label: 'Aadhaar number',
    group: 'Personal',
    reason: 'The only identity document held for most farmers, and what a duplicate registration is caught by.',
  },
  {
    key: 'address',
    label: 'Complete address',
    group: 'Address',
    reason: 'Village, district and state locate the farmer administratively; the address is how anyone actually reaches them.',
  },
  {
    key: 'farmSizeAcres',
    label: 'Farm size',
    group: 'Farm',
    reason: 'Procurement planning sizes expected volume from it, and land profiling reconciles the mapped plots against it.',
  },
  {
    key: 'landType',
    label: 'Land type',
    group: 'Farm',
    reason: 'Feeds crop advisory and explains yield variation between farmers growing the same crop.',
  },
  {
    key: 'irrigationType',
    label: 'Irrigation type',
    group: 'Farm',
    reason: 'The strongest predictor of harvest timing, which is what delivery timeliness is scored against.',
  },
  {
    key: 'cropDetails',
    label: 'Crop details',
    group: 'Farm',
    reason: 'FRD 7.4 filters farmers by crop; with this blank the farmer is invisible to that search.',
  },
  {
    key: 'bankAccountName',
    label: 'Account holder name',
    group: 'Bank',
    reason: 'Payments fail when the name does not match the account, and the mismatch is only discovered at the bank.',
  },
  {
    key: 'bankName',
    label: 'Bank name',
    group: 'Bank',
    reason: 'Needed to route the payment.',
  },
  {
    key: 'bankAccountNo',
    label: 'Account number',
    group: 'Bank',
    reason: 'Without it a collection works out what the farmer is owed with nowhere to send it.',
  },
  {
    key: 'ifscCode',
    label: 'IFSC code',
    group: 'Bank',
    reason: 'Without it a collection works out what the farmer is owed with nowhere to send it.',
  },
];

/** Listed in FRD 7.1, deliberately not blocking. Reported so the gap is visible, not hidden. */
export const ADVISORY_FIELDS: RequiredField[] = [
  {
    key: 'panNumber',
    label: 'PAN number',
    group: 'Personal',
    reason: 'Optional by design — agricultural income is tax-exempt and many smallholders have none.',
  },
  {
    key: 'gpsLocation',
    label: 'GPS location',
    group: 'Address',
    reason: 'Captured in the field per plot during land profiling. A hole here leaves a hole in the consumer trace page.',
  },
  {
    key: 'familyDetails',
    label: 'Family details',
    group: 'Personal',
    reason: 'Useful context for the Agriculture Expert; nothing downstream depends on it.',
  },
];

/** A field counts as present when it holds something meaningful — whitespace does not. */
function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  // Decimal columns arrive as Prisma.Decimal. Zero acres is not a farm.
  return Number(value) > 0;
}

export interface RegistrationReadiness {
  /** True when nothing in REQUIRED_FOR_APPROVAL is missing. */
  canApprove: boolean;
  missingRequired: RequiredField[];
  missingAdvisory: RequiredField[];
  /** 0-100, over the required list only. Drives the progress bar on the form. */
  completenessPercent: number;
}

export function assessRegistration(farmer: Farmer): RegistrationReadiness {
  const missingRequired = REQUIRED_FOR_APPROVAL.filter((f) => !isPresent(farmer[f.key]));
  const missingAdvisory = ADVISORY_FIELDS.filter((f) => !isPresent(farmer[f.key]));
  const done = REQUIRED_FOR_APPROVAL.length - missingRequired.length;

  return {
    canApprove: missingRequired.length === 0,
    missingRequired,
    missingAdvisory,
    completenessPercent: Math.round((done / REQUIRED_FOR_APPROVAL.length) * 100),
  };
}

/** The refusal message. Names every missing field, because naming one at a time is a queue. */
export function describeMissing(missing: RequiredField[]): string {
  const byGroup = new Map<string, string[]>();
  for (const field of missing) {
    byGroup.set(field.group, [...(byGroup.get(field.group) ?? []), field.label]);
  }

  const parts = [...byGroup.entries()].map(([group, labels]) => `${group}: ${labels.join(', ')}`);

  return (
    `This farmer cannot be approved yet — ${missing.length} required ` +
    `${missing.length === 1 ? 'field is' : 'fields are'} still blank. ${parts.join('; ')}. ` +
    `Approval mints the permanent traceability code and lets the farmer supply a harvest, ` +
    `so the record has to be complete first.`
  );
}
