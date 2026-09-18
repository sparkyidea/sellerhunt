import { SidebarProvider } from "@sparkyidea/ui/components/sidebar";
import { Suspense } from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { NavigationAreaProvider } from "@/components/navigation/navigation-area";
import { AppPanels } from "@/components/panels/app-panels";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <NavigationAreaProvider>
        <SidebarProvider className="h-dvh flex-col bg-header-background">
          <AppHeader />
          <div className="relative flex min-h-0 flex-1 overflow-hidden">
            <AppSidebar collapsible="icon" />
            <AppPanels>{children}</AppPanels>
          </div>
        </SidebarProvider>
      </NavigationAreaProvider>
    </Suspense>
  );
}
