import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import rsfc from "@rsfc/vite-plugin";

export default defineConfig({
  plugins: [
    rsfc({ include: ["**/*.rsfc"] }),
    react(),
  ],
});
