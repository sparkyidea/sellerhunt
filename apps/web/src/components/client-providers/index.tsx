"use client";

import { Toaster } from "@sparkyidea/ui/components/sonner";
import { ThemeProvider } from "./theme-provider";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      disableTransitionOnChange
      enableSystem
      storageKey="dashseller-theme"
    >
      {children}
      <Toaster richColors />
    </ThemeProvider>
  );
}
