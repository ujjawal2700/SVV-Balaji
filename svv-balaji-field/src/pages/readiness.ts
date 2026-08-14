import type { Farmer } from '@shared/api/types';

export interface Gap {
  key: string;
  label: string;
  /** What goes wrong later if this is left blank. */
  consequence: string;
  /** Blocks money or traceability, versus merely incomplete. */
  severity: 'blocking' | 'advisory';
}

/**
 * What is missing from a farmer's record, and what it costs later.
 *
 * This exists because both of these gaps are invisible at onboarding and
 * expensive at harvest, months later and usually with the farmer standing
 * there:
 *
 *   - **No bank details.** `RawMaterialCollection` computes `totalAmount` and
 *     carries a `paymentStatus`, but there is nowhere to send the money. The
 *     collection is recorded, the farmer is owed, and somebody has to chase an
 *     account number after the fact.
 *   - **No GPS.** `GET /trace/:fgBatchNumber` returns village, district and
 *     `gpsLocation` for the consumer-facing traceability page. A blank one is a
 *     hole in the story the QR code on the pack is there to tell — and it
 *     cannot be filled in retrospectively without going back to the farm.
 *
 * Neither blocks approval, deliberately: the server does not require them and
 * inventing a rule the API does not enforce would mean a form that refuses what
 * the system would accept. They are surfaced, not enforced.
 */
export function farmerGaps(farmer: Farmer): Gap[] {
  const gaps: Gap[] = [];

  const hasBank = Boolean(farmer.bankAccountNo && farmer.ifscCode);
  if (!hasBank) {
    gaps.push({
      key: 'bank',
      label: 'No bank details',
      consequence:
        'A collection from this farmer will calculate what they are owed with nowhere to pay it. ' +
        'Easier to capture now than to chase at the weighbridge.',
      severity: 'blocking',
    });
  }

  if (!farmer.gpsLocation) {
    gaps.push({
      key: 'gps',
      label: 'No farm coordinates',
      consequence:
        'The consumer traceability page shows where the crop was grown. Without coordinates that ' +
        'section is blank, and it cannot be filled in later without another visit.',
      severity: 'advisory',
    });
  }

  if (!farmer.aadhaarNumber && !farmer.panNumber) {
    gaps.push({
      key: 'kyc',
      label: 'No identity document',
      consequence: 'Neither Aadhaar nor PAN recorded, which most payment processes will want.',
      severity: 'advisory',
    });
  }

  if (!farmer.farmSizeAcres) {
    gaps.push({
      key: 'farm-size',
      label: 'No farm size',
      consequence:
        'Procurement planning estimates expected volume from farm size. Without it this farmer ' +
        'contributes nothing to the forecast.',
      severity: 'advisory',
    });
  }

  return gaps;
}

/** True when nothing that blocks payment or traceability is missing. */
export function isFarmerReady(farmer: Farmer): boolean {
  return farmerGaps(farmer).every((gap) => gap.severity !== 'blocking');
}
