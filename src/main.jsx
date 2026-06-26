import React from "react";
import ReactDOM from "react-dom/client";
import GrindOps from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <GrindOps />
  </React.StrictMode>
);

// register the service worker so the app is installable (PWA) and works offline
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* registration may fail in some dev contexts — non-fatal */
    });
  });
}
