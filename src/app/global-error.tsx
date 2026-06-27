"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    // No-op unless Sentry is configured.
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100dvh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          padding: "1.5rem",
          // System colors so the error page adapts to light/dark without
          // depending on the app's (possibly unloaded) stylesheet.
          colorScheme: "light dark",
          background: "Canvas",
          color: "CanvasText",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: "0.5rem", color: "GrayText" }}>
            An unexpected error occurred. The team has been notified if error
            monitoring is enabled.
          </p>
        </div>
      </body>
    </html>
  );
}
