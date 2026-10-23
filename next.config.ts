import type { NextConfig } from "next";

// The map is embedded inside a Monday.com item (HTML block / iframe).
// frame-ancestors is the only CSP directive we set here; everything else is Next defaults.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets a second dev server run beside the default one (NEXT_DIST_DIR=.next-api next dev -p 3021).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://*.monday.com https://monday.com;",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
