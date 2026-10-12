import type { NextConfig } from "next";

// The map is embedded inside a Monday.com item (HTML block / iframe).
// frame-ancestors is the only CSP directive we set here; everything else is Next defaults.
const nextConfig: NextConfig = {
  reactStrictMode: true,
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
