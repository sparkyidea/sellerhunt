import { NotFound as NotFoundContent } from "@sparkyidea/ui/components/not-found";
import Link from "next/link";
import { PanelRoute } from "@/components/panels/panel-route";

export default function NotFound() {
  return (
    <PanelRoute error>
      <main className="flex min-h-screen flex-col">
        <NotFoundContent homeLink={<Link href="/" />} />
      </main>
    </PanelRoute>
  );
}
