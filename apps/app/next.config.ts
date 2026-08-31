import { env } from "@dashseller/env/app";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  allowedDevOrigins: env.NEXT_PUBLIC_APP_URL
    ? [new URL(env.NEXT_PUBLIC_APP_URL).hostname]
    : [],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ebayimg.com",
      },
      {
        protocol: "https",
        hostname: "i.ebayimg.cn",
      },
      {
        protocol: "https",
        hostname: "cdn.dashseller.dev",
      },
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
      },
    ],
  },
};

export default nextConfig;
