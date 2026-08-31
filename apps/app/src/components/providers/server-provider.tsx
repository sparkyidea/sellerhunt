import { NuqsAdapter } from "nuqs/adapters/next/app";

export function ServerProviders({ children }: { children: React.ReactNode }) {
  return <NuqsAdapter>{children}</NuqsAdapter>;
}
