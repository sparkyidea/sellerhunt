import { hasAdminRole } from "@dashseller/auth/lib/auth/roles";
import { SidebarProvider } from "@sparkyidea/ui/components/sidebar";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/navigation/app-header";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { PanelWorkspace } from "@/components/preview/panel-workspace";
import { WidgetProvider } from "@/components/providers/wrappers/widget-provider";
import { getServerSession } from "@/lib/session.server";

// The server session gates admin browsing; API permissions guard every operation.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
  if (!session || session.user.banned || !hasAdminRole(session.user.role)) {
    notFound();
  }
  return (
    <SidebarProvider className="h-dvh flex-col bg-header-background">
      <AppHeader />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <AppSidebar collapsible="icon" />
        <PanelWorkspace>
          {children}
          <WidgetProvider />
        </PanelWorkspace>
      </div>
    </SidebarProvider>
  );
}
