import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {},
  output: process.env.NEXT_BUILD_STANDALONE === "1" ? "standalone" : undefined,
};

export default nextConfig;
