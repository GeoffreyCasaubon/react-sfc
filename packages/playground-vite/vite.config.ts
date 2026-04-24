import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import rsfc from "@rsfc/vite-plugin";

export default defineConfig({
  plugins: [
    // enforce:"pre" — transforms .rsfc → JSX first
    rsfc({ include: ["**/*.rsfc"] }),
    // Then the React plugin receives the already-generated JSX code.
    // Adding .rsfc to include lets it apply the JSX → React.createElement
    // transform on our output (the id is still *.rsfc at that point).
    react({ include: /\.(jsx|tsx|js|ts|rsfc)$/ }),
  ],
});
