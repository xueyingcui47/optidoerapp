"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker on the client.
 * Renders nothing; safe to mount once in the root layout.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failures are non-fatal — the app still works as a normal site.
    });
  }, []);

  return null;
}
