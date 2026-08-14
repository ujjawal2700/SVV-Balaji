import {
  AppstoreOutlined,
  EnvironmentOutlined,
  HomeOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { MobileShell, type ShellTab } from './MobileShell';

/**
 * The Agriculture Expert's app.
 *
 * Six responsibilities, five tabs. That is not a compromise, it is the point:
 * a bottom bar stops working past five on a small handset, so the two lowest-
 * frequency areas — seed distribution and training — live behind More, and the
 * four that happen daily get a permanent home.
 *
 *   Home        1. Dashboard & today's schedule
 *   Farmers     2. Onboarding & land profiling
 *   Visits      4. Field visits & crop advisory
 *   Inspect     6. Harvest inspection — the pre-procurement gate
 *   More        3. Seed & agri-input distribution, 5. Training sessions
 *
 * Inspect earns a permanent tab despite being seasonal because it is the only
 * thing here that blocks somebody else's work: procurement cannot collect a
 * harvest until it is inspected. Seed and training slip a day without
 * consequence; an uninspected harvest sits in the field.
 *
 * Every tab is also reachable from the Home screen, which lists all six areas
 * explicitly — so an executive who has been told "do the training module" finds
 * it by name rather than having to guess which tab hides it.
 */
export const FIELD_TABS: ShellTab[] = [
  { path: '/field', label: 'Home', icon: <HomeOutlined /> },
  { path: '/field/farmers', label: 'Farmers', icon: <TeamOutlined /> },
  { path: '/field/visits', label: 'Visits', icon: <EnvironmentOutlined /> },
  { path: '/field/inspections', label: 'Inspect', icon: <SafetyCertificateOutlined /> },
  { path: '/field/more', label: 'More', icon: <AppstoreOutlined /> },
];

export function FieldLayout() {
  return <MobileShell tabs={FIELD_TABS} rootPath="/field" title="Field Executive" />;
}
