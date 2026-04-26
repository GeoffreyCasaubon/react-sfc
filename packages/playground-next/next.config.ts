import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config) {
    // Webpack applies loaders right-to-left (last entry in use[] runs first):
    //   1. @rsfc/webpack-loader  — parses .rsfc → JSX + inline styles   (runs first)
    //   2. babel-loader          — transforms JSX + TS → plain JS        (runs second)
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
