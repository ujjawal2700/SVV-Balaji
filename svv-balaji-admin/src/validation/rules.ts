import type { Rule } from 'antd/es/form';

/**
 * Form validation rules, mirroring the backend's class-validator DTOs.
 *
 * Every rule here cites the server-side rule it mirrors. Keeping them in one
 * file is the point: when a DTO changes, there is exactly one place to follow
 * it, and drift is visible rather than scattered across twenty forms.
 *
 * Client validation is a courtesy - it catches a typo before a round trip and
 * puts the error next to the field. The server remains the authority, and its
 * message is what the user sees when the two disagree (see `apiErrorMessage`).
 */

// --- Patterns ---------------------------------------------------------------

/** 15-character GSTIN. Identical to GSTIN_PATTERN in customers.service.ts. */
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Indian mobile: 10 digits starting 6-9, optionally +91 prefixed. */
export const MOBILE_PATTERN = /^(?:\+?91[-\s]?)?[6-9][0-9]{9}$/;

/** PAN: five letters, four digits, one letter. */
export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Aadhaar: 12 digits, never starting 0 or 1. */
export const AADHAAR_PATTERN = /^[2-9][0-9]{11}$/;

/** IFSC: four letters, 0, then six alphanumerics. */
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export const PINCODE_PATTERN = /^[1-9][0-9]{5}$/;

/** "lat,lng" as stored in Farmer.gpsLocation. */
export const GPS_PATTERN = /^-?\d{1,2}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$/;

// --- Reusable rule factories ------------------------------------------------

export const required = (label: string): Rule => ({
  required: true,
  message: `${label} is required`,
});

export const maxLength = (limit: number): Rule => ({
  max: limit,
  message: `Keep this under ${limit} characters`,
});

/** @IsEmail() */
export const email = (): Rule => ({
  type: 'email',
  message: 'That does not look like an email address',
});

/** @IsString() @MinLength(6) - matches CreateUserDto.password */
export const minPassword = (): Rule => ({
  min: 6,
  message: 'Password must be at least 6 characters',
});

export const mobile = (): Rule => ({
  pattern: MOBILE_PATTERN,
  message: 'Enter a 10-digit mobile number',
});

export const pan = (): Rule => ({
  pattern: PAN_PATTERN,
  message: 'PAN looks like ABCDE1234F',
});

export const aadhaar = (): Rule => ({
  pattern: AADHAAR_PATTERN,
  message: 'Aadhaar is 12 digits',
});

export const ifsc = (): Rule => ({
  pattern: IFSC_PATTERN,
  message: 'IFSC looks like HDFC0001234',
});

export const gstin = (): Rule => ({
  pattern: GSTIN_PATTERN,
  message: 'GSTIN is 15 characters, e.g. 29ABCDE1234F1Z5',
});

export const pincode = (): Rule => ({
  pattern: PINCODE_PATTERN,
  message: 'PIN code is 6 digits',
});

export const gpsLocation = (): Rule => ({
  pattern: GPS_PATTERN,
  message: 'Enter coordinates as "latitude,longitude", e.g. 17.3850,78.4867',
});

/**
 * A quantity, weight or rate. Decimal columns in the schema are unsigned in
 * practice - a negative farm size or purchase rate is always a data-entry slip.
 */
export const positiveNumber = (label: string, allowZero = false): Rule => ({
  validator: (_rule, value) => {
    if (value === undefined || value === null || value === '') return Promise.resolve();
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return Promise.reject(new Error(`${label} must be a number`));
    if (allowZero ? parsed < 0 : parsed <= 0) {
      return Promise.reject(
        new Error(allowZero ? `${label} cannot be negative` : `${label} must be greater than zero`),
      );
    }
    return Promise.resolve();
  },
});

/**
 * Cross-field date ordering.
 *
 * Mirrors the server-side checks that would otherwise only surface after a
 * round trip: `scheduledTo >= scheduledFrom` (procurement.service.ts),
 * `effectiveTo > effectiveFrom` (pricing.service.ts) and
 * `expiryDate > manufacturingDate` (packaging.service.ts).
 */
export const dateAfter = (
  earlierField: string,
  earlierLabel: string,
  { orEqual = false } = {},
): Rule => {
  return ({ getFieldValue }) => ({
    validator(_rule, value) {
      const earlier = getFieldValue(earlierField);
      if (!value || !earlier) return Promise.resolve();

      const diff = value.valueOf() - earlier.valueOf();
      if (orEqual ? diff >= 0 : diff > 0) return Promise.resolve();

      return Promise.reject(
        new Error(
          orEqual
            ? `Cannot be earlier than ${earlierLabel}`
            : `Must be after ${earlierLabel}`,
        ),
      );
    },
  });
};

/**
 * Cross-field numeric ceiling.
 *
 * Mirrors `netWeight <= grossWeight` in collection.service.ts, and the packed
 * total vs production output check in packaging.service.ts.
 */
export const notGreaterThan = (otherField: string, otherLabel: string): Rule => {
  return ({ getFieldValue }) => ({
    validator(_rule, value) {
      const ceiling = getFieldValue(otherField);
      if (value === undefined || value === null || ceiling === undefined || ceiling === null) {
        return Promise.resolve();
      }
      if (Number(value) <= Number(ceiling)) return Promise.resolve();
      return Promise.reject(new Error(`Cannot exceed ${otherLabel}`));
    },
  });
};

// --- Composed field rules ---------------------------------------------------

export const fieldRules = {
  fullName: [required('Name'), maxLength(120)],
  mobile: [required('Mobile'), mobile()],
  optionalMobile: [mobile()],
  email: [required('Email'), email()],
  password: [required('Password'), minPassword()],
  village: [required('Village'), maxLength(80)],
  district: [required('District'), maxLength(80)],
  state: [required('State'), maxLength(80)],
  aadhaar: [aadhaar()],
  pan: [pan()],
  ifsc: [ifsc()],
  gps: [gpsLocation()],
  farmSize: [positiveNumber('Farm size')],
} satisfies Record<string, Rule[]>;
