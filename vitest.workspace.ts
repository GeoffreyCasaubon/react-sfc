import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "core",
      root: "./packages/core",
      include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
      environment: "node",
      passWithNoTests: true,
    },
  },
  {
    test: {
      name: "vite-plugin",
      root: "./packages/vite-plugin",
      include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
      environment: "node",
      passWithNoTests: true,
    },
  },
  {
    test: {
      name: "webpack-loader",
      root: "./packages/webpack-loader",
      include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
      environment: "node",
      passWithNoTests: true,
    },
  },
]);
