import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ShieldCheck, ListChecks, CalendarClock, FileUp, Settings,
  ChevronsUpDown, LogOut, Sun, Moon,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar,
} from '@/components/ui/sidebar'

// Navigation, grouped the way the work flows: the daily loop first, then the
// set-up screens that change less often.
export const NAV_GROUPS = [
  {
    title: 'Daily work',
    items: [
      { url: '/', title: 'Dashboard', icon: LayoutDashboard },
      { url: '/daily', title: 'Daily Check', icon: ShieldCheck },
      { url: '/tasks', title: 'Tasks', icon: ListChecks },
    ],
  },
  {
    title: 'Team & data',
    items: [
      { url: '/creators', title: 'Shifts Overview', icon: CalendarClock },
      { url: '/reports', title: 'Reports', icon: FileUp },
    ],
  },
  {
    title: 'Other',
    items: [{ url: '/settings', title: 'Settings', icon: Settings }],
  },
]

export const isActivePath = (pathname, url) =>
  url === '/' ? pathname === '/' : pathname === url || pathname.startsWith(`${url}/`)

const initials = (name) =>
  String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')

export function AppSidebar() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const { setOpenMobile } = useSidebar()
  const orgName = user?.organisation?.name || 'Organisation'

  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size='lg' asChild className='hover:bg-transparent active:bg-transparent'>
              <Link to='/' onClick={() => setOpenMobile(false)}>
                <div className='flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground'>
                  {initials(orgName)}
                </div>
                <div className='grid flex-1 text-start text-sm leading-tight'>
                  <span className='truncate font-semibold'>{orgName}</span>
                  <span className='truncate text-xs text-muted-foreground'>Chatting management</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map(group => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map(item => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActivePath(pathname, item.url)} tooltip={item.title}>
                    <Link to={item.url} onClick={() => setOpenMobile(false)}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function NavUser() {
  const { user, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const { isMobile } = useSidebar()
  const name = user?.name || 'User'
  const role = (user?.role || '').replace('_', ' ')

  const who = (
    <>
      <Avatar className='size-8 rounded-lg'>
        <AvatarFallback className='rounded-lg'>{initials(name)}</AvatarFallback>
      </Avatar>
      <div className='grid flex-1 text-start text-sm leading-tight'>
        <span className='truncate font-semibold'>{name}</span>
        <span className='truncate text-xs capitalize text-muted-foreground'>{role}</span>
      </div>
    </>
  )

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size='lg' className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'>
              {who}
              <ChevronsUpDown className='ms-auto size-4' />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className='w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg'
            side={isMobile ? 'bottom' : 'right'} align='end' sideOffset={4}>
            <DropdownMenuLabel className='p-0 font-normal'>
              <div className='flex items-center gap-2 px-1 py-1.5 text-start text-sm'>{who}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link to='/settings'><Settings /> Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggle}>
                {theme === 'dark' ? <Sun /> : <Moon />} {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant='destructive' onClick={signOut}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
