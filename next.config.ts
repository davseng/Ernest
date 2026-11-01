import type { NextConfig } from "next";

const publicHost = [{ type: "host" as const, value: "sailfarbetter\\.com" }];
const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pdfjs-dist"],
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www\\.sailfarbetter\\.com" }],
        destination: "https://sailfarbetter.com/:path*",
        permanent: true,
      },
      // Keep owner authentication on its existing host; do not broaden cookies.
      {
        source: "/sail/manage/:path*",
        has: publicHost,
        destination: "https://ernest.sailfarbetter.com/sail/manage/:path*",
        permanent: false,
      },
      {
        source: "/sail/sign-in",
        has: publicHost,
        destination: "https://ernest.sailfarbetter.com/sail/sign-in",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", has: publicHost, destination: "/sail" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
