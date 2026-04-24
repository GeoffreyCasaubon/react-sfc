import { defineWorkspace } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const coreSrc = resolve(root, "packages/core/src/index.ts");

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
    resolve: {
      alias: { "@rsfc/core": coreSrc },
    },
    test: {
      name: "vite-plugin",
      root: "./packages/vite-plugin",
      include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
      environment: "node",
      passWithNoTests: true,
    },
  },
  {
    resolve: {
      alias: { "@rsfc/core": coreSrc },
    },
    test: {
      name: "webpack-loader",
      root: "./packages/webpack-loader",
      include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
      environment: "node",
      passWithNoTests: true,
    },
  },
]);
