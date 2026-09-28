import { useQueryClient } from '@tanstack/react-query';
import { PUSH_KEYS, pushNotificationsApi } from '@shared/api/pushNotifications';
import { useAuth } from '../auth/useAuth';
import { usePushRegistration } from '../push';

/**
 * Keeps this browser's push registration in step with the session: registered while someone
 * is signed in, removed at sign-out. Renders nothing; mounted once inside AuthProvider.
 */
export function PushBridge() {
  const { user, initialising } = useAuth();
  const qc = useQueryClient();
  usePushRegistration({
    signedIn: initialising ? undefined : Boolean(user),
    identity: user?.id,
    register: (token) => pushNotificationsApi.registerDevice(token, 'ADMIN'),
    unregister: (token) => pushNotificationsApi.unregisterDevice(token),
    onPush: () => void qc.invalidateQueries({ queryKey: PUSH_KEYS.inbox }),
  });
  return null;
}
