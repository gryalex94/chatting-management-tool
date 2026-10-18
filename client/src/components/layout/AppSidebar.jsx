import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ShieldCheck, ListChecks, BookCheck, CalendarClock, FileUp, Settings, Wallet, BookOpen,
  ChevronsUpDown, LogOut, Sun, Moon, Check,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { usePlatform } from '@/context/PlatformContext'
import { PLATFORMS, platformInfo, pagesText } from '@/utils/platforms'
import PlatformBadge from '@/components/shared/PlatformBadge'
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
      { url: '/rules', title: 'AI Rules', icon: BookCheck },
    ],
  },
  {
    title: 'Team & data',
    items: [
      { url: '/shifts', title: 'Shifts', icon: CalendarClock },
      { url: '/payroll', title: 'Payroll', icon: Wallet, managerOnly: true },
      { url: '/playbook', title: 'Playbook', icon: BookOpen, forChatters: true },
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
  const { user, isManager } = useAuth()
  // Chatters only see what's made for them (the Playbook); staff see the rest
  const isChatter = user?.role === 'chatter'
  const visible = (item) => (isChatter ? item.forChatters : !item.managerOnly || isManager)
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
        {!isChatter && <PlatformSwitch />}
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.filter(group => group.items.some(visible)).map(group => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.filter(visible).map(item => (
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

// Which platform the tool shows (OnlyFans, Fanvue, Fansly): the pages, their
// team, tasks and numbers below follow it (context/PlatformContext.jsx).
function PlatformSwitch() {
  const { platform, setPlatform, counts } = usePlatform()
  const { isMobile } = useSidebar()
  const current = platformInfo(platform)
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton tooltip={`Platform: ${current.name}`} aria-label={`Platform: ${current.name}. Change platform`}
              className='border bg-background data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'>
              <PlatformBadge platform={current.id} />
              <span className='truncate font-medium'>{current.name}</span>
              <span className='ms-auto truncate text-xs text-muted-foreground'>{pagesText(counts[current.id])}</span>
              <ChevronsUpDown className='size-4 shrink-0 text-muted-foreground' />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className='min-w-60 rounded-lg' side={isMobile ? 'bottom' : 'right'} align='start' sideOffset={4}>
            <DropdownMenuLabel className='text-xs font-normal text-muted-foreground'>Show the tool for</DropdownMenuLabel>
            {PLATFORMS.map(p => (
              <DropdownMenuItem key={p.id} onClick={() => setPlatform(p.id)} className='gap-2'>
                <PlatformBadge platform={p.id} />
                <span className='flex-1'>{p.name}</span>
                <span className='text-xs text-muted-foreground'>{pagesText(counts[p.id])}</span>
                <Check className={p.id === platform ? 'size-4' : 'size-4 invisible'} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
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
