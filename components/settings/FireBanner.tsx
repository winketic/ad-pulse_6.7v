"use client";

import { useRef, useEffect } from "react";

interface Particle {
  x: number;
  y: number;
  r: number;
  vy: number;
  color: string;
}

const COLORS = ["#ff006e", "#ff4da6", "#cc00ff", "#7b00ff", "#ff69b4", "#e040fb"];

export default function FireBanner() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let particles: Particle[] = [];

    const init = () => {
      const parent = canvas.parentElement;
      const W = parent?.offsetWidth ?? 300;
      const H = parent?.offsetHeight ?? 80;
      canvas.width = W;
      canvas.height = H;

      particles = Array.from({ length: 90 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 1 + Math.random() * 3,
        vy: 0.5 + Math.random() * 1.5,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      }));
    };

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;

      ctx.fillStyle = "#1a0a2e";
      ctx.fillRect(0, 0, W, H);

      for (const p of particles) {
        const opacity = Math.max(0, p.y / H);

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.restore();

        p.y -= p.vy;

        if (p.y < -p.r) {
          p.y = H + p.r;
          p.x = Math.random() * W;
          p.r = 1 + Math.random() * 3;
          p.vy = 0.5 + Math.random() * 1.5;
          p.color = COLORS[Math.floor(Math.random() * COLORS.length)];
        }
      }

      animId = requestAnimationFrame(draw);
    };

    init();
    draw();

    const ro = new ResizeObserver(init);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
  );
}
