import {
  FileProtectOutlined,
  HomeOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { MobileShell, type ShellTab } from './MobileShell';

/**
 * The onboarding executive's four tabs, in the order the work actually
 * happens: register a farmer, get them approved, sign the agreement.
 *
 * Approvals earns its own tab rather than being a filter on Farmers because it
 * is the gate the whole chain hangs on — a farmer with no traceability code
 * cannot be inspected, cannot be collected from, and cannot appear on a
 * consumer trace page. A queue nobody can see is a queue nobody clears.
 */
export const ONBOARDING_TABS: ShellTab[] = [
  { path: '/onboarding', label: 'Home', icon: <HomeOutlined /> },
  { path: '/onboarding/farmers', label: 'Farmers', icon: <TeamOutlined /> },
  { path: '/onboarding/approvals', label: 'Approvals', icon: <SafetyCertificateOutlined /> },
  { path: '/onboarding/agreements', label: 'Agreements', icon: <FileProtectOutlined /> },
];

export function OnboardingLayout() {
  return <MobileShell tabs={ONBOARDING_TABS} rootPath="/onboarding" title="Farmer Onboarding" />;
}
