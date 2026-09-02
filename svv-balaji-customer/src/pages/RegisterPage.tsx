import { Placeholder } from './Placeholder';

/**
 * Customer registration — FRD 29.
 *
 * Same blocker as sign-in, plus a question worth settling before any of it is
 * built: does a self-registered shopper become a `Customer` row, and if so, what
 * happens to the fields the B2B model requires — credit limit, payment terms,
 * price list, GST number? Defaulting a walk-up shopper into a credit account is
 * how somebody ends up with an unintended thirty-day term.
 */
export function RegisterPage() {
  return (
    <Placeholder
      frd="29"
      title="Create an account"
      summary="Self-registration for customers who want order history and faster checkout."
      blockedBy={
        <>
          Blocked on customer identity, as sign-in is. Also needs a decision on whether a
          self-registered shopper becomes a <code>Customer</code> row, and what the B2B-only fields
          (credit limit, payment terms, price list, GST) default to if so.
        </>
      }
    />
  );
}
