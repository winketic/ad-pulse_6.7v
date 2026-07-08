"use client";

import { useEffect, useRef, useState } from "react";
import { formatCompact } from "@/lib/utils/format";

// Count-up animation for stat values. 400ms, ease-out, single run on mount.
// Falls back to a static value when the user prefers reduced motion.
export default function AnimatedNumber({
  value,
  prefix = "",
  duration = 400,
}: {
  value: number;
  prefix?: string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const raf = useRef<number>();

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    const from = 0;

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);

  // Integer targets animate through integers only — no flickering decimals
  const shown = Number.isInteger(value) ? Math.round(display) : display;

  return (
    <span className="tabular-nums">
      {prefix}
      {formatCompact(shown)}
    </span>
  );
}
