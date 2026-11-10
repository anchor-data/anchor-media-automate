import type { NextConfig } from "next";

const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:8787";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Locally /api is proxied to `wrangler dev`; the default 30s proxy timeout cut off slow calls (image
  // generation takes 20-60s) and turned them into a 500 although the API finished fine.
  experimental: { proxyTimeout: 180_000 },
  // In production a Cloudflare route sends /api/* to the API worker. Locally
  // there is no such route, so proxy to `wrangler dev`.
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  }
};

export default nextConfig;
