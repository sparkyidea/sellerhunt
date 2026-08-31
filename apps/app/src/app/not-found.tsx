import { NotFound as NotFoundContent } from "@sparkyidea/ui/components/not-found";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col">
      <NotFoundContent homeLink={<Link href="/" />} />
    </main>
  );
}
