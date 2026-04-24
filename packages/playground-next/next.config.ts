import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config) {
    config.module.rules.push({
      test: /\.rsfc$/,
      use: [{ loader: "@rsfc/webpack-loader", options: {} }],
    });
    return config;
  },
};

export default nextConfig;
