import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    optimizePackageImports: ["@hugeicons/core-free-icons"],
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  async headers() {
    const security = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
    ];
    const privateHeaders = [
      ...security,
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
    ];
    return [
      { source: "/:path*", headers: security },
      { source: "/", headers: privateHeaders },
      { source: "/login/:path*", headers: privateHeaders },
      { source: "/enroll/:path*", headers: privateHeaders },
      { source: "/invitations/:path*", headers: privateHeaders },
      { source: "/api/auth/:path*", headers: privateHeaders },
    ];
  },
};

export default nextConfig;
