import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { installQaTelemetryBridge } from "./qa/browser";

installQaTelemetryBridge();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
