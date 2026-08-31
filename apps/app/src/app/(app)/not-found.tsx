import { NotFound as NotFoundContent } from "@sparkyidea/ui/components/not-found";
import {
  Panel,
  PanelContent,
  PanelProvider,
} from "@sparkyidea/ui/components/panel";
import Link from "next/link";

export default function NotFound() {
  return (
    <PanelProvider>
      <Panel>
        <PanelContent>
          <NotFoundContent homeLink={<Link href="/" />} />
        </PanelContent>
      </Panel>
    </PanelProvider>
  );
}
