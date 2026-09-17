import { hasAdminRole } from "@dashseller/auth/lib/auth/roles";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
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
    <AppShell navigation="admin">
      {children}
      <WidgetProvider />
    </AppShell>
  );
}
