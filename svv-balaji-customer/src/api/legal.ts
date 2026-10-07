import { api } from './client';

/**
 * Conditions of Use and Privacy Notice, written by Super Admin in the staff
 * panel (Terms & Privacy Policies) and served live. Public - no sign-in needed.
 * The server falls back to a built-in default until Super Admin saves one.
 */

export type LegalAudience = 'CUSTOMER' | 'RETAILER';
export type LegalDoc = 'TERMS_AND_CONDITIONS' | 'PRIVACY_POLICY';

export interface LegalPolicy {
  audience: LegalAudience;
  type: LegalDoc;
  title: string;
  content: string;
  version: string;
  updatedAt: string;
}

/** URL slugs <-> API values, so links read /legal/customer/conditions-of-use. */
export const DOC_SLUG: Record<LegalDoc, string> = { TERMS_AND_CONDITIONS: 'conditions-of-use', PRIVACY_POLICY: 'privacy-notice' };
export const DOC_LABEL: Record<LegalDoc, string> = { TERMS_AND_CONDITIONS: 'Conditions of Use', PRIVACY_POLICY: 'Privacy Notice' };

export const legalPath = (audience: LegalAudience, doc: LegalDoc) => `/legal/${audience.toLowerCase()}/${DOC_SLUG[doc]}`;

export const legalApi = {
  get: (audience: LegalAudience, doc: LegalDoc) =>
    api.get<LegalPolicy>(`/public/legal-policies/${audience}/${doc}`).then((r) => r.data),
};
