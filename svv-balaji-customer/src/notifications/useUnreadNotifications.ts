import { useQuery } from '@tanstack/react-query';
import { INBOX_KEY, notificationsApi } from '../api/notifications';
import { useCustomerAuth } from '../auth/CustomerAuthContext';

/** The signed-in shopper's inbox. Disabled for guests. */
export function useInbox() {
  const { isLoggedIn } = useCustomerAuth();
  return useQuery({ queryKey: INBOX_KEY, queryFn: notificationsApi.inbox, enabled: isLoggedIn, refetchInterval: 60_000 });
}

/** Unread count for the bell badge; 0 for guests. */
export function useUnreadNotifications(): number {
  const { isLoggedIn } = useCustomerAuth();
  const inbox = useInbox();
  return isLoggedIn ? inbox.data?.unread ?? 0 : 0;
}
