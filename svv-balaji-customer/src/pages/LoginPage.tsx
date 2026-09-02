import { Placeholder } from './Placeholder';

/**
 * Customer sign-in — FRD 29.
 *
 * Not the staff login. The staff apps authenticate a `User` with a role and a
 * permission set; a customer has neither, and pointing this at the same endpoint
 * would issue a token that the permission guard evaluates as a staff account
 * holding nothing — which fails in confusing ways rather than clean ones.
 *
 * On success this must return the person to `location.state.from`, which
 * `RequireAccount` sets. Somebody sent here from checkout with a full cart and
 * dropped on the home page afterwards will assume the cart was lost.
 */
export function LoginPage() {
  return (
    <Placeholder
      frd="29"
      title="Sign in"
      summary="Customer sign-in, returning to wherever the person was headed."
      blockedBy={
        <>
          There is no <code>CUSTOMER</code> value in the <code>UserRole</code> enum, and no customer
          credential anywhere in the schema — B2B customers are records created by staff, with no
          way to log in. Customer identity is the first backend piece of WS3.5 and belongs to
          Ujjawal (WS1.x).
        </>
      }
    />
  );
}
