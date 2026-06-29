import type { NextConfig } from "next";

// @ts-ignore
const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
