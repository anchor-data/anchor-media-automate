import type { NextConfig } from "next";

const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:8787";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // In production a Cloudflare route sends /api/* to the API worker. Locally
  // there is no such route, so proxy to `wrangler dev`.
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  }
};

export default nextConfig;
