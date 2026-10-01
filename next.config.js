/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import analyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = analyzer({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import("next").NextConfig} */
const config = {
  transpilePackages: ["three"],
  typescript: {
    ignoreBuildErrors: true,
  },

  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
  },

  /** Old portal URLs → their new homes (bookmarks keep working). */
  async redirects() {
    return [
      { source: "/map", destination: "/pins", permanent: true },
      { source: "/pin-manage", destination: "/pins/manage", permanent: true },
      { source: "/report", destination: "/reports", permanent: true },
      { source: "/report/:id", destination: "/reports/:id", permanent: true },
      { source: "/create", destination: "/onboarding", permanent: true },
      { source: "/admin/collection-report", destination: "/admin/reports", permanent: true },
      { source: "/admin/collection-report/:id", destination: "/admin/reports/:id", permanent: true },
      { source: "/admin", destination: "/admin/creators", permanent: false },
    ];
  },

  async rewrites() {
    return [
      {
        source: "/.well-known/stellar.toml",
        destination: "/api/toml",
        // persistance: true
      },
    ];
  },

  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          {
            key: "Access-Control-Allow-Origin",
            value: "https://main.d20qrrwbkiopzh.amplifyapp.com",
          }, // replace this your actual origin
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,DELETE,PATCH,POST,PUT,OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version",
          },
        ],
      },
    ];
  },

};

export default withBundleAnalyzer(config);
