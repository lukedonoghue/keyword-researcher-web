import type { NextConfig } from "next";

const appVersion = process.env.npm_package_version ?? "0.0.0";
const commitSha = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7);

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_APP_COMMIT_SHA: commitSha,
  },
};

export default nextConfig;
