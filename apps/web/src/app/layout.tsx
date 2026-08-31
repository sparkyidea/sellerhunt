import type { Metadata } from "next";
import { ClientProviders } from "@/components/client-providers";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { ServerProviders } from "@/components/server-providers";
import "../index.css";

import { inter, interDisplay } from "@/fonts";

export const metadata: Metadata = {
  title: "dashseller",
  description: "dashseller",
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
          <ClientProviders>
            <Header />
            {children}
            <Footer />
          </ClientProviders>
        </ServerProviders>
      </body>
    </html>
  );
}
