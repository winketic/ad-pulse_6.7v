"use client";

import { useEffect, useState } from "react";

/**
 * Launch animation for the installed app only.
 *
 * Deliberately gated three ways: it never runs in a normal browser tab (there
 * the page itself is the entry point), twice per session at most, and never
 * when the user asked for reduced motion. It is an overlay that fades away on
 * its own — it never blocks data loading, so it cannot slow the dashboard down.
 */
const SESSION_KEY = "adps_splash_shown";
const HOLD_MS = 1100;
const FADE_MS = 240;

type Phase = "hidden" | "in" | "out";

export default function BrandSplash() {
  const [phase, setPhase] = useState<Phase>("hidden");

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    // A phone that opens the site in a browser tab is still "launching the app"
    // for the person holding it, so the splash is not exclusive to the installed
    // PWA. Desktop stays untouched: there the page appears instantly anyway.
    const mobileEntry =
      window.innerWidth < 768 &&
      (window.location.pathname === "/" || window.location.pathname.startsWith("/dashboard"));

    if (reduce || (!standalone && !mobileEntry)) return;

    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Private mode can block storage; better to skip the splash than to throw.
      return;
    }

    setPhase("in");
    const toOut = window.setTimeout(() => setPhase("out"), HOLD_MS);
    const toHidden = window.setTimeout(() => setPhase("hidden"), HOLD_MS + FADE_MS);

    return () => {
      window.clearTimeout(toOut);
      window.clearTimeout(toHidden);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      className={phase === "out" ? "adps-splash adps-splash--out" : "adps-splash"}
      aria-hidden="true"
    >
      <svg className="adps-splash-mark" viewBox="0 0 64 64" width="88" height="88" fill="none">
        <rect width="64" height="64" rx="16" fill="#05050a" />
        <polyline
          className="adps-splash-line"
          points="6,32 14,32 18,20 22,44 26,28 30,36 34,32 58,32"
          stroke="#00f5c4"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={100}
        />
        <circle className="adps-splash-dot" cx="18" cy="20" r="3" fill="#00f5c4" />
      </svg>
      <p className="adps-splash-title">AD Pulse</p>
    </div>
  );
}
