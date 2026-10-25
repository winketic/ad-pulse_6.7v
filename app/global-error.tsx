"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Last-resort boundary: it replaces the root layout when the layout itself
 * throws, so it has to render its own <html> and <body> and cannot rely on
 * globals.css or the app's CSS variables.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#05050a",
          color: "#e8ecf1",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ maxWidth: 460, padding: "0 24px", textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            Страница не загрузилась
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.7, marginTop: 10 }}>
            Данные не потеряны — это сбой отображения. Попробуйте обновить.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: 12,
                opacity: 0.45,
                marginTop: 12,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              digest: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 22,
              padding: "10px 20px",
              borderRadius: 10,
              border: "1px solid #00f5c4",
              background: "#00f5c4",
              color: "#05050a",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Попробовать снова
          </button>
        </div>
      </body>
    </html>
  );
}
