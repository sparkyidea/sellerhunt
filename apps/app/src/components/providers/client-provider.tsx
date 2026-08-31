"use client";

import { Toaster } from "@sparkyidea/ui/components/sonner";
// import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { NavigationGuardProvider } from "next-navigation-guard";
import { TRPCReactProvider } from "@/lib/utils/trpc/client";
import { TailwindIndicator } from "../tailwind-indicator";
import { BetterAuthProviders } from "./wrappers/better-auth-providers";
import { ThemeProvider } from "./wrappers/theme-provider";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      disableTransitionOnChange
      enableSystem
      storageKey="dashseller-theme"
    >
      <TRPCReactProvider>
        <BetterAuthProviders>
          <NavigationGuardProvider>{children}</NavigationGuardProvider>
        </BetterAuthProviders>
        {/* <ReactQueryDevtools /> */}
        <TailwindIndicator />
      </TRPCReactProvider>
      <Toaster richColors />
    </ThemeProvider>
  );
}
