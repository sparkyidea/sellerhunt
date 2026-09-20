import { SidebarProvider } from "@sparkyidea/ui/components/sidebar";
import { AppHeader } from "@/components/navigation/app-header";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { AppPanels } from "@/components/panels/app-panels";

// Static shell: prerendered at build time. Nothing under this layout may read
// search params during render; the settings origin lives in memory instead
// (hooks/use-settings-origin.ts).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider className="h-dvh flex-col bg-header-background">
      <AppHeader />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <AppSidebar collapsible="icon" />
        <AppPanels>{children}</AppPanels>
      </div>
    </SidebarProvider>
  );
}
