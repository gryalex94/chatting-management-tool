import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Eye, EyeOff, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/context/ThemeContext'
import { isDemoMode, setDemoMode } from '@/utils/privacy'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { NAV_GROUPS, isActivePath } from './AppSidebar'

const PAGE_TITLES = Object.fromEntries(NAV_GROUPS.flatMap(g => g.items.map(i => [i.url, i.title])))

function currentTitle(pathname) {
  if (pathname.startsWith('/chatters/')) return 'Chatter profile'
  const hit = Object.keys(PAGE_TITLES).find(url => isActivePath(pathname, url))
  return hit ? PAGE_TITLES[hit] : ''
}

// Sticky top bar, as in shadcn-admin: sidebar toggle, where you are, and the few
// app-wide switches. It gains a soft shadow once the page scrolls under it.
export function AppHeader() {
  const { pathname } = useLocation()
  const { theme, toggle } = useTheme()
  const demo = isDemoMode()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled((document.documentElement.scrollTop || document.body.scrollTop) > 10)
    document.addEventListener('scroll', onScroll, { passive: true })
    return () => document.removeEventListener('scroll', onScroll)
  }, [])

  // Masking is applied as data arrives, so reload to re-fetch everything in the new mode.
  const toggleDemo = () => { setDemoMode(!demo); window.location.reload() }

  return (
    <header className={cn('sticky top-0 z-40 h-16 bg-background/80 backdrop-blur-md transition-shadow', scrolled && 'shadow-sm')}>
      <div className='flex h-full items-center gap-3 px-4 sm:gap-4'>
        <SidebarTrigger variant='outline' className='max-md:scale-125' />
        <Separator orientation='vertical' className='h-6' />
        <span className='truncate text-sm font-medium'>{currentTitle(pathname)}</span>

        <div className='ms-auto flex items-center gap-2'>
          {demo && (
            <span className='hidden rounded-full border border-warn/40 bg-warn/10 px-2.5 py-1 text-xs font-medium text-warn sm:inline'
              title='Fan names, messages and emails are hidden. Safe to screen-share.'>
              Demo mode · fan data hidden
            </span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={demo ? 'secondary' : 'ghost'} size='sm' onClick={toggleDemo}>
                {demo ? <EyeOff /> : <Eye />}
                <span className='hidden sm:inline'>{demo ? 'Exit demo' : 'Demo mode'}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{demo ? 'Show real fan data again' : 'Hide fan data before screen-sharing'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant='ghost' size='icon' className='rounded-full' onClick={toggle} aria-label='Toggle theme'>
                {theme === 'dark' ? <Sun /> : <Moon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  )
}
