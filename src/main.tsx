import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { RootErrorBoundary } from "./components/RootErrorBoundary";
import "./styles/global.css";

// Surface pre-React errors (module load, etc.) so the page never goes
// completely silent-black. The #bootstrap-error div is rendered by the
// handler below and lives on top of everything.
function showBootstrapError(source: string, detail: unknown) {
  try {
    console.error(`[aMBiW bootstrap] ${source}`, detail);
    const existing = document.getElementById("bootstrap-error");
    const host =
      existing ||
      (() => {
        const el = document.createElement("div");
        el.id = "bootstrap-error";
        el.style.cssText =
          "position:fixed;inset:0;padding:20px;background:#050507;color:#ffc9cf;" +
          "font:12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
          "overflow:auto;z-index:99999;white-space:pre-wrap;word-break:break-word;";
        document.body.appendChild(el);
        return el;
      })();
    const text =
      detail instanceof Error
        ? `${detail.name}: ${detail.message}\n\n${detail.stack ?? ""}`
        : typeof detail === "string"
          ? detail
          : JSON.stringify(detail, null, 2);
    host.textContent = `aMBiW — ${source}\n\n${text}`;
  } catch {
    // last-resort: ignore
  }
}

window.addEventListener("error", (e) => {
  showBootstrapError("window.error", e.error ?? e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  showBootstrapError("unhandled rejection", e.reason);
});

const rootEl = document.getElementById("root");
if (!rootEl) {
  showBootstrapError("bootstrap", "#root element missing in index.html");
} else {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </React.StrictMode>
  );
}
