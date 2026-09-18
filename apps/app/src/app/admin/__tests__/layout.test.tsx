import { afterEach, describe, expect, it, mock } from "bun:test";

interface TestSession {
  user: { role?: string | null; banned?: boolean | null };
}
let session: TestSession | null = null;
const notFound = mock(() => {
  throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
});
function SidebarProvider() {
  return null;
}

mock.module("@/lib/session.server", () => ({
  getServerSession: async () => session,
}));
mock.module("next/navigation", () => ({ notFound }));
mock.module("@sparkyidea/ui/components/sidebar", () => ({ SidebarProvider }));
mock.module("@/components/navigation/app-header", () => ({
  AppHeader: () => null,
}));
mock.module("@/components/navigation/app-sidebar", () => ({
  AppSidebar: () => null,
}));
mock.module("@/components/preview/panel-workspace", () => ({
  PanelWorkspace: () => null,
}));
mock.module("@/components/providers/wrappers/widget-provider", () => ({
  WidgetProvider: () => null,
}));

const { default: AdminLayout } = await import("../layout");

afterEach(() => {
  session = null;
  notFound.mockClear();
});

describe("admin route access", () => {
  it("returns 404 for visitors without a valid session", async () => {
    await expect(AdminLayout({ children: "private content" })).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404"
    );
  });

  it("denies ordinary, missing, and look-alike roles", async () => {
    for (const role of ["user", "administrator", "", null, undefined]) {
      session = { user: { role } };
      await expect(
        AdminLayout({ children: "private content" })
      ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    }
  });

  it("denies banned admins", async () => {
    session = { user: { role: "admin", banned: true } };
    await expect(AdminLayout({ children: "private content" })).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404"
    );
  });

  it("renders the admin layout for active admins, including multiple roles", async () => {
    for (const role of ["admin", "user, admin"]) {
      session = { user: { role, banned: false } };
      const result = await AdminLayout({ children: "private content" });
      expect(result.type).toBe(SidebarProvider);
      const body = result.props.children[1];
      const workspace = body.props.children[1];
      expect(workspace.props.children[0]).toBe("private content");
    }
    expect(notFound).not.toHaveBeenCalled();
  });
});
