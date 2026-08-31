import { env } from "@dashseller/env/web";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  allowedDevOrigins: env.NEXT_PUBLIC_WEB_URL
    ? [new URL(env.NEXT_PUBLIC_WEB_URL).hostname]
    : [],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "randomuser.me",
      },
    ],
  },
};

export default nextConfig;
