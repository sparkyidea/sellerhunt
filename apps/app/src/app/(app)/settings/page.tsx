import { redirect } from "next/navigation";

// /settings has no content of its own — Account is the default tab. Forward the
// `from` origin (set on the nav link) so the sheet's close handler can still
// return to the page the user opened settings from.
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  redirect(
    from
      ? `/settings/account?from=${encodeURIComponent(from)}`
      : "/settings/account"
  );
}
