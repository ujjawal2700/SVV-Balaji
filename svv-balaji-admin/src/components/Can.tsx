import type { ReactNode } from 'react';
import type { Permission } from '../auth/permissions';
import { useCan } from '../auth/useCan';

interface CanProps {
  do: Permission;
  children: ReactNode;
  /** Rendered instead when the user lacks the permission. Usually nothing. */
  fallback?: ReactNode;
}

/**
 * Renders its children only if the signed-in user holds the permission.
 *
 *   <Can do="FARMER_APPROVE">
 *     <Button onClick={approve}>Approve</Button>
 *   </Can>
 *
 * Prefer hiding an action outright to disabling it. A disabled Approve button
 * tells a Procurement Manager the feature exists and that they are being
 * refused; an absent one simply is not their job.
 */
export function Can({ do: permission, children, fallback = null }: CanProps) {
  const allowed = useCan(permission);
  return <>{allowed ? children : fallback}</>;
}
