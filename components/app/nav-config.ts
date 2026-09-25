import {
  BuildingIcon,
  ImageIcon,
  LayoutDashboardIcon,
  LayersIcon,
  PenToolIcon,
  UploadIcon,
  UserRoundIcon,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  description: string
}

export const PRIMARY_NAV: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboardIcon,
    description: 'Overview of templates, members and activity.',
  },
  {
    title: 'Data Upload',
    href: '/data-upload',
    icon: UploadIcon,
    description: 'Import member records from CSV or Excel.',
  },
  {
    title: 'Designer',
    href: '/designer',
    icon: PenToolIcon,
    description: 'Build front and back card templates.',
  },
  {
    title: 'Bulk Generator',
    href: '/bulk-generator',
    icon: LayersIcon,
    description: 'Generate cards for many members at once.',
  },
  {
    title: 'Asset Library',
    href: '/assets',
    icon: ImageIcon,
    description: 'Manage reusable images, logos and signatures.',
  },
]

export const ACCOUNT_NAV: NavItem[] = [
  {
    title: 'Profile',
    href: '/profile',
    icon: UserRoundIcon,
    description: 'Your personal details and password.',
  },
  {
    title: 'Workspace',
    href: '/workspace',
    icon: BuildingIcon,
    description: 'Organization name, members and plan.',
  },
]

export const ALL_NAV = [...PRIMARY_NAV, ...ACCOUNT_NAV]

export function findNavItem(pathname: string): NavItem | undefined {
  return ALL_NAV.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  )
}
