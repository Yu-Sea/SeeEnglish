import { LibraryBig, PenLine, RotateCcw, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TabId } from './types';

export interface NavItem {
  id: TabId;
  label: string;
  english: string;
  index: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'add', label: '记词', english: 'Capture', index: '01', icon: PenLine },
  { id: 'review', label: '复习', english: 'Review', index: '02', icon: RotateCcw },
  { id: 'library', label: '词库', english: 'Library', index: '03', icon: LibraryBig },
  { id: 'profile', label: '个人', english: 'Profile', index: '04', icon: UserRound },
];

export function navItemFor(tab: TabId): NavItem {
  return NAV_ITEMS.find((item) => item.id === tab) ?? NAV_ITEMS[0];
}
