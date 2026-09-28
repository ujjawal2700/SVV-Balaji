import { useQueryClient } from '@tanstack/react-query';
import { INBOX_KEY, notificationsApi } from '../api/notifications';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { usePushRegistration } from '../push';

/** Registers this device for push while signed in, removes it on sign-out. Renders nothing. */
export function PushBridge() {
  const { isLoggedIn, initialising, customerProfile, retailerProfile } = useCustomerAuth();
  const qc = useQueryClient();
  usePushRegistration({
    signedIn: initialising ? undefined : isLoggedIn,
    identity: customerProfile?.phone ?? retailerProfile?.phone,
    register: notificationsApi.registerDevice,
    unregister: notificationsApi.unregisterDevice,
    onPush: () => void qc.invalidateQueries({ queryKey: INBOX_KEY }),
  });
  return null;
}
