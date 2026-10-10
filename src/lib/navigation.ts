import {
  Activity,
  Archive,
  FileSearch,
  History,
  LayoutDashboard,
  RefreshCw,
  ScanSearch,
  Settings as SettingsIcon,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { ComponentProps } from 'react';

export type PageId =
  | 'overview'
  | 'scans'
  | 'results'
  | 'quarantine'
  | 'protection'
  | 'updates'
  | 'history'
  | 'settings'
  | 'about';

export interface NavItem {
  id: PageId;
  label: string;
  /** Short label for the collapsed sidebar / mobile rail. */
  shortLabel: string;
  description: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'overview',
    label: 'Security Overview',
    shortLabel: 'Overview',
    description: 'Protection components, last scan and signature state',
    icon: LayoutDashboard,
  },
  {
    id: 'scans',
    label: 'Scan Center',
    shortLabel: 'Scan',
    description: 'Quick, full and custom folder scans',
    icon: ScanSearch,
  },
  {
    id: 'results',
    label: 'Scan Results',
    shortLabel: 'Results',
    description: 'Per-file verdicts reported by the scan engine',
    icon: FileSearch,
  },
  {
    id: 'quarantine',
    label: 'Quarantine',
    shortLabel: 'Quarantine',
    description: 'Isolated detections, restore and deletion',
    icon: Archive,
  },
  {
    id: 'protection',
    label: 'Protection Status',
    shortLabel: 'Protection',
    description: 'Actual state of every security component',
    icon: ShieldCheck,
  },
  {
    id: 'updates',
    label: 'Update Center',
    shortLabel: 'Updates',
    description: 'Engine and signature database versions',
    icon: RefreshCw,
  },
  {
    id: 'history',
    label: 'Security History',
    shortLabel: 'History',
    description: 'Chronological record of scans and actions',
    icon: History,
  },
  {
    id: 'settings',
    label: 'Settings & Privacy',
    shortLabel: 'Settings',
    description: 'Theme, scan preferences and privacy controls',
    icon: SettingsIcon,
  },
  {
    id: 'about',
    label: 'About & Diagnostics',
    shortLabel: 'About',
    description: 'Version, platform, runtime checks and limits',
    icon: Activity,
  },
];

export function navItem(id: PageId): NavItem {
  const found = NAV_ITEMS.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown page: ${id}`);
  return found;
}

export type IconProps = ComponentProps<LucideIcon>;
