import * as Sentry from "@sentry/nextjs";

/**
 * Browser-side Sentry init. Sentry v10 reads this file instead of
 * sentry.client.config.ts, and the old name stops working under Turbopack.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  enabled: process.env.NODE_ENV === "production",
});

/** Keeps client-side navigations instrumented as transitions. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
