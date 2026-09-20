import { SidebarProvider } from "@sparkyidea/ui/components/sidebar";
import { AppHeader } from "@/components/navigation/app-header";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { NavigationAreaProvider } from "@/components/navigation/navigation-area";
import { AppPanels } from "@/components/panels/app-panels";

// Static shell: prerendered at build time. Nothing under this layout may read
// search params during render; the settings origin lives in memory instead
// (see navigation-area.tsx).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <NavigationAreaProvider>
      <SidebarProvider className="h-dvh flex-col bg-header-background">
        <AppHeader />
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <AppSidebar collapsible="icon" />
          <AppPanels>{children}</AppPanels>
        </div>
      </SidebarProvider>
    </NavigationAreaProvider>
  );
}
