import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep unoptimized images for compatibility; can be re-enabled for Vercel later.
  images: {
    unoptimized: true
  }
};

export default nextConfig;
