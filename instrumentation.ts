/**
 * Next.js calls this once per runtime. Sentry v10 stopped picking up
 * sentry.server.config.ts / sentry.edge.config.ts on its own, so without this
 * file server and edge errors were never reported — only the browser ones were.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/** Reports errors thrown inside server components, route handlers and actions. */
export { captureRequestError as onRequestError } from "@sentry/nextjs";
