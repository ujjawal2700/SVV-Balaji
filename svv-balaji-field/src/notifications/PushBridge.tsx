import { useQueryClient } from '@tanstack/react-query';
import { PUSH_KEYS, pushNotificationsApi } from '@shared/api/pushNotifications';
import { useAuth } from '@shared/auth/useAuth';
import { usePushRegistration } from '../push';

/** Registers this phone for push while signed in, removes it on sign-out. Renders nothing. */
export function PushBridge() {
  const { user, initialising } = useAuth();
  const qc = useQueryClient();
  usePushRegistration({
    signedIn: initialising ? undefined : Boolean(user),
    identity: user?.id,
    register: (token) => pushNotificationsApi.registerDevice(token, 'FIELD'),
    unregister: (token) => pushNotificationsApi.unregisterDevice(token),
    onPush: () => void qc.invalidateQueries({ queryKey: PUSH_KEYS.inbox }),
  });
  return null;
}
