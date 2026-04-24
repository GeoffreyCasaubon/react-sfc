import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const rootEl = document.getElementById("root");

if (rootEl === null) {
  throw new Error("Root element #root not found. Check index.html.");
}

createRoot(rootEl).render(
  <StrictMode>
    <main>
      <h1>RSFC Playground (Vite)</h1>
      <p>
        Import a <code>.rsfc</code> component here to test the vite-plugin.
      </p>
    </main>
  </StrictMode>
);
