import type { Farmer } from '@shared/api/types';

export interface Gap {
  key: string;
  label: string;
  /** What goes wrong later if this is left blank. */
  consequence: string;
  /** Blocks approval, versus merely incomplete. */
  severity: 'blocking' | 'advisory';
}

/**
 * What is missing from a farmer's record, and what it costs.
 *
 * ## This mirrors the server, and the server is the enforcer
 *
 * As of 20 August the backend refuses to approve a farmer whose record is
 * incomplete — see `registration-completeness.ts`, which holds the definitive
 * list. This file is a **mirror of that list**, kept for one reason: the farmer
 * list shows gaps for every row at once, and asking the server per row would be
 * one request per farmer on a rural connection.
 *
 * So: `blocking` here means "the server will refuse to approve this", not a
 * rule this app invented. If the two ever disagree, the server wins and this
 * file is wrong. The single-farmer views call `GET /farmers/:id/readiness`
 * rather than trusting this.
 *
 * ## Why PAN and GPS are advisory
 *
 * Both are in FRD 7.1 and both are deliberately not required by the server.
 * PAN because agricultural income is tax-exempt and many smallholders have
 * none — requiring it would block real farmers or produce invented numbers.
 * GPS because it is captured per plot during land profiling, which is a better
 * place for it than one coordinate for a whole holding.
 */

interface FieldSpec {
  key: string;
  label: string;
  consequence: string;
  severity: Gap['severity'];
  present: (farmer: Farmer) => boolean;
}

const has = (value: unknown) =>
  value !== null && value !== undefined && String(value).trim().length > 0;

const SPECS: FieldSpec[] = [
  {
    key: 'aadhaar',
    label: 'No Aadhaar number',
    consequence:
      'Blocks approval. It is the only identity document held for most farmers, and what a ' +
      'duplicate registration gets caught by.',
    severity: 'blocking',
    present: (f) => has(f.aadhaarNumber),
  },
  {
    key: 'address',
    label: 'No complete address',
    consequence:
      'Blocks approval. Village and district locate the farmer administratively; the address is ' +
      'how anyone actually reaches them.',
    severity: 'blocking',
    present: (f) => has(f.address),
  },
  {
    key: 'bank',
    label: 'No bank details',
    consequence:
      'Blocks approval. A collection from this farmer would calculate what they are owed with ' +
      'nowhere to pay it — far easier to capture now than to chase at the weighbridge.',
    severity: 'blocking',
    present: (f) =>
      has(f.bankAccountName) && has(f.bankName) && has(f.bankAccountNo) && has(f.ifscCode),
  },
  {
    key: 'farm',
    label: 'Farm details incomplete',
    consequence:
      'Blocks approval. Size, land type, irrigation and crops drive procurement planning, crop ' +
      'advisory, and the crop filter this farmer would otherwise be invisible to.',
    severity: 'blocking',
    present: (f) =>
      Number(f.farmSizeAcres ?? 0) > 0 &&
      has(f.landType) &&
      has(f.irrigationType) &&
      has(f.cropDetails),
  },
  {
    key: 'gps',
    label: 'No farm coordinates',
    consequence:
      'The consumer traceability page shows where the crop was grown. Without coordinates that ' +
      'section is blank, and it cannot be filled in later without another visit.',
    severity: 'advisory',
    present: (f) => has(f.gpsLocation),
  },
  {
    key: 'pan',
    label: 'No PAN',
    consequence: 'Optional — agricultural income is tax-exempt and many farmers have none.',
    severity: 'advisory',
    present: (f) => has(f.panNumber),
  },
];

export function farmerGaps(farmer: Farmer): Gap[] {
  return SPECS.filter((spec) => !spec.present(farmer)).map(({ present: _present, ...gap }) => gap);
}

/** True when nothing that blocks approval is missing. */
export function isFarmerReady(farmer: Farmer): boolean {
  return farmerGaps(farmer).every((gap) => gap.severity !== 'blocking');
}
