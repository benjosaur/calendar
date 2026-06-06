import type { NextConfig } from "next";

// Bake the git SHA this bundle was built from into the client. On Vercel,
// VERCEL_GIT_COMMIT_SHA is set automatically at build time; the value is
// compared at runtime against the live SHA in Convex to detect stale tabs.
const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
  },
};

export default nextConfig;
