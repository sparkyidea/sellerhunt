import { SidebarProvider } from "@sparkyidea/ui/components/sidebar";
import { AppHeader } from "@/components/navigation/app-header";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { PanelWorkspace } from "@/components/preview/panel-workspace";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider className="h-dvh flex-col bg-header-background">
      <AppHeader />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <AppSidebar collapsible="icon" />
        <PanelWorkspace>{children}</PanelWorkspace>
      </div>
    </SidebarProvider>
  );
}
