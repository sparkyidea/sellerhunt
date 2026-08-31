import { SidebarProvider } from "@sparkyidea/ui/components/sidebar";
import { cn } from "@sparkyidea/ui/lib/utils";
import { AppHeader } from "@/components/navigation/app-header";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { PreviewPanel } from "@/components/preview/preview-panel";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider className="h-dvh flex-col bg-header-background">
      <AppHeader />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <AppSidebar collapsible="icon" />
        <div
          className={cn(
            "@container/main flex flex-1",
            "not-has-data-[slot=panel]:rounded-tr-xl not-has-data-[slot=panel]:border-t not-has-data-[slot=panel]:border-r not-has-data-[slot=panel]:bg-background"
          )}
        >
          {children}
          <PreviewPanel />
        </div>
      </div>
    </SidebarProvider>
  );
}
