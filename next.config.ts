import type { NextConfig } from "next";

const nextConfig: NextConfig & { turbopack?: { root?: string } } = {
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
