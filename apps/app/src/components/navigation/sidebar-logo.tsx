import { Icons } from "@sparkyidea/ui/icons";
import Link from "next/link";

export function SidebarLogo() {
  return (
    <div className="flex items-center">
      <Link className="flex h-8 flex-1 items-center px-1" href="/">
        <Icons.logo className="h-6 w-6" />
        <span className="font-bold text-2xl group-data-[collapsible=icon]:hidden">
          ashseller
        </span>
      </Link>
    </div>
  );
}
