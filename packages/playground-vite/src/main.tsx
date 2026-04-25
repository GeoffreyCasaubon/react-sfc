import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Hello from "./Hello.rsfc";
import Stopwatch from "./Stopwatch.rsfc";

const rootEl = document.getElementById("root");

if (rootEl === null) {
  throw new Error("Root element #root not found. Check index.html.");
}

createRoot(rootEl).render(
  <StrictMode>
    <Hello />
    <Stopwatch />
  </StrictMode>
);
