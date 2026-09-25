'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOutIcon, SearchIcon } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { BrandMark } from '@/components/brand-mark'
import { ACCOUNT_NAV, PRIMARY_NAV, type NavItem } from '@/components/app/nav-config'
import { GlobalSearch } from '@/components/shared/global-search'
import { useAuth } from '@/components/providers/auth-provider'
import { usePortal } from '@/components/providers/portal-provider'
import { SignOutDialog } from '@/components/app/sign-out-dialog'
import { WorkspaceBadge } from '@/components/app/workspace-badge'

function NavList({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <SidebarMenu>
      {items.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              isActive={isActive}
              tooltip={item.title}
              render={<Link href={item.href} aria-current={isActive ? 'page' : undefined} />}
            >
              <item.icon />
              <span>{item.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { workspace, signOut } = useAuth()
  const { isPortalUser, portalFolderName, portalToken, clearPortalSession } = usePortal()

  const handlePortalSignOut = async () => {
    clearPortalSession()
    await signOut()
    if (portalToken) {
      router.replace(`/portal/${portalToken}`)
    } else {
      router.replace('/sign-in')
    }
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/dashboard" />}
              tooltip="CardForge"
            >
              <BrandMark className="size-8" />
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold">CardForge</span>
                <span className="truncate text-xs text-sidebar-foreground/70">
                  {isPortalUser
                    ? portalFolderName ?? 'College Portal'
                    : workspace?.name ?? 'Loading workspace…'}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Hide search for portal users */}
        {!isPortalUser && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <GlobalSearch
                    trigger={
                      <SidebarMenuButton tooltip="Search (⌘K)">
                        <SearchIcon />
                        <span>Search</span>
                      </SidebarMenuButton>
                    }
                  />
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup>
          <SidebarGroupLabel>
            {isPortalUser ? 'Portal' : 'Workspace'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <NavList items={PRIMARY_NAV} pathname={pathname} />
          </SidebarGroupContent>
        </SidebarGroup>
        {/* Hide Account section for portal users */}
        {!isPortalUser && (
          <SidebarGroup>
            <SidebarGroupLabel>Account</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavList items={ACCOUNT_NAV} pathname={pathname} />
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        {/* Hide workspace badge for portal users */}
        {!isPortalUser && <WorkspaceBadge />}
        <SidebarMenu>
          <SidebarMenuItem>
            {isPortalUser ? (
              <SidebarMenuButton tooltip="Sign out" onClick={handlePortalSignOut}>
                <LogOutIcon />
                <span>Sign out</span>
              </SidebarMenuButton>
            ) : (
              <SignOutDialog
                trigger={
                  <SidebarMenuButton tooltip="Sign out">
                    <LogOutIcon />
                    <span>Sign out</span>
                  </SidebarMenuButton>
                }
              />
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
