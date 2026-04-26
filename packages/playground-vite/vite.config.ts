import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import rsfc from "@rsfc/vite-plugin";

export default defineConfig({
  plugins: [
    // enforce:"pre" — transforms .rsfc → esbuild-processed JS (TS stripped, JSX transformed)
    rsfc({ include: ["**/*.rsfc"] }),
    // React plugin handles .jsx/.tsx as usual; .rsfc is fully processed before it runs.
    react(),
  ],
});
