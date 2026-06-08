"use client";

import { useMemo } from "react";

interface Flame {
  x: number;
  size: number;
  height: number;
  blur: number;
  duration: number;
  delay: number;
}

function rand(min: number, max: number, seed: number): number {
  const s = Math.sin(seed * 9301 + 49297) * 233280;
  return min + (s - Math.floor(s)) * (max - min);
}

export default function FireBanner() {
  const flames = useMemo<Flame[]>(() =>
    Array.from({ length: 25 }, (_, i) => ({
      x:        rand(0,   95,  i * 7 + 1),
      size:     rand(20,  60,  i * 7 + 2),
      height:   rand(40,  100, i * 7 + 3),
      blur:     rand(8,   20,  i * 7 + 4),
      duration: rand(0.8, 1.5, i * 7 + 5),
      delay:    rand(0,   1.5, i * 7 + 6),
    }))
  , []);

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: "#0d0010" }}>
      {flames.map((f, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            bottom: 0,
            left: `${f.x}%`,
            width: `${f.size}px`,
            height: `${f.height}px`,
            background: "radial-gradient(ellipse at bottom, #ff1493, #ff69b4, transparent)",
            borderRadius: "50% 50% 20% 20%",
            filter: `blur(${f.blur}px)`,
            animation: `flameRise ${f.duration}s ease-in infinite ${f.delay}s`,
            opacity: 0.8,
          }}
        />
      ))}
    </div>
  );
}
