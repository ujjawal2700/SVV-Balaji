import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { TERMS_LABEL, type PaymentTerms } from '../api/credit';

/**
 * The signed-in retailer's real credit terms, from GET /storefront/auth/me.
 *
 * One place for every screen that shows a limit, what is owed or the payment
 * terms, so none of them falls back to a made-up figure: no limit set means
 * "no credit yet", not a default number.
 */
export function useRetailerCredit() {
  const { role, retailerProfile } = useCustomerAuth();
  const limit = retailerProfile?.creditLimit ?? 0;
  const used = retailerProfile?.creditUsed ?? 0;
  const terms = (retailerProfile?.paymentTerms ?? 'PREPAID') as PaymentTerms;
  const hasCredit = role === 'RETAILER' && terms !== 'PREPAID' && limit > 0;
  return {
    hasCredit,
    limit,
    used,
    available: Math.max(limit - used, 0),
    terms,
    termsLabel: TERMS_LABEL[terms] ?? 'Prepaid',
  };
}
