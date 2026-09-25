import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AuthGuard } from '@/components/app/auth-guard'
import { AppSidebar } from '@/components/app/app-sidebar'
import { AppHeader } from '@/components/app/app-header'
import { ErrorBoundary } from '@/components/shared/error-boundary'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <AppHeader />
          <div className="flex flex-1 flex-col gap-8 p-4 md:p-6 lg:p-8">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </AuthGuard>
  )
}
