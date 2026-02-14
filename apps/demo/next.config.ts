import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@moltgate/autopay", "@moltgate/policy"],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Stacks packages need these Node.js polyfills in browser
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        stream: false,
        buffer: false,
        process: false,
        fs: false,
        path: false,
        os: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

export default nextConfig;
