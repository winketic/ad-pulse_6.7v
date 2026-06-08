"use client";

import { useRef, useEffect } from "react";

interface Star {
  x: number;
  y: number;
  r: number;
  speed: number;
  opacity: number;
}

export default function StarfieldBanner({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let stars: Star[] = [];

    const init = () => {
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      canvas.width = W;
      canvas.height = H;

      stars = Array.from({ length: 150 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 0.5 + Math.random() * 1.5,
        speed: 0.1 + Math.random() * 0.4,
        opacity: 0.4 + Math.random() * 0.6,
      }));
    };

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;

      ctx.fillStyle = "#0d0a1a";
      ctx.fillRect(0, 0, W, H);

      for (const s of stars) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${s.opacity})`;
        ctx.fill();

        s.x += s.speed;
        if (s.x > W + s.r) {
          s.x = -s.r;
          s.y = Math.random() * H;
        }
      }

      animId = requestAnimationFrame(draw);
    };

    init();
    draw();

    const ro = new ResizeObserver(() => { init(); });
    ro.observe(canvas.parentElement ?? canvas);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return (
    <div className={`relative w-full h-full ${className ?? ""}`}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      {/* bottom gradient for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
    </div>
  );
}
