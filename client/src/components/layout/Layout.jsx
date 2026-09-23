import { Outlet } from 'react-router-dom'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppSidebar } from './AppSidebar'
import { AppHeader } from './AppHeader'

// The shadcn/ui sidebar remembers open/collapsed in this cookie.
const sidebarOpen = () => {
  try { return !document.cookie.split('; ').includes('sidebar_state=false') } catch { return true }
}

export default function Layout() {
  return (
    <TooltipProvider delayDuration={200}>
      <SidebarProvider defaultOpen={sidebarOpen()}>
        <AppSidebar />
        <SidebarInset className='@container/content'>
          <AppHeader />
          <main className='flex-1 px-4 py-6 md:px-6 @7xl/content:mx-auto @7xl/content:w-full @7xl/content:max-w-7xl'>
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
