import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config) {
    // Loaders are executed right-to-left:
    //   1. @rsfc/webpack-loader  — parses .rsfc → JSX + inline styles
    //   2. babel-loader          — transforms JSX → React.createElement calls
    //
    // babel-loader runs first in the chain so Next.js's SWC does not need
    // to handle the raw JSX output from our loader.
    config.module.rules.push({
      test: /\.rsfc$/,
      use: [
        {
          loader: "babel-loader",
          options: {
            presets: [
              ["@babel/preset-react", { runtime: "automatic" }],
              ["@babel/preset-typescript", { allExtensions: true, isTSX: true }],
            ],
          },
        },
        { loader: "@rsfc/webpack-loader", options: {} },
      ],
    });
    return config;
  },
};

export default nextConfig;
