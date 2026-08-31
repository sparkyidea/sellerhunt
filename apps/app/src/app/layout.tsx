import type { Metadata } from "next";
import { ClientProviders, ServerProviders } from "@/components/providers";
import "@/styles/app.css";

import { inter, interDisplay } from "@/fonts";

export const metadata: Metadata = {
  title: "DashSeller",
  description: "DashSeller",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`antialiased ${inter.variable} ${interDisplay.variable}`}
      >
        <ServerProviders>
          <ClientProviders>{children}</ClientProviders>
        </ServerProviders>
      </body>
    </html>
  );
}
