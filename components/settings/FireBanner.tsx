"use client";

import { useRef, useEffect } from "react";

interface Particle {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  color: string;
}

const COLORS = ["#ff006e", "#ff3399", "#ff66cc", "#cc00ff"];

export default function FireBanner() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let W = 0;
    let H = 0;
    let particles: Particle[] = [];

    const spawn = (): Particle => ({
      x: W * 0.3 + Math.random() * W * 0.7,
      y: H + 12,
      w: 2 + Math.random() * 2,
      h: 6 + Math.random() * 6,
      vx: -(0.1 + Math.random() * 0.35),
      vy: 0.7 + Math.random() * 1.4,
      life: 1,
      decay: 0.008 + Math.random() * 0.012,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });

    const init = () => {
      const parent = canvas.parentElement;
      W = parent?.offsetWidth ?? 300;
      H = parent?.offsetHeight ?? 70;
      canvas.width = W;
      canvas.height = H;
      particles = Array.from({ length: 150 }, () => {
        const p = spawn();
        p.y = Math.random() * H;
        p.life = 0.2 + Math.random() * 0.8;
        return p;
      });
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const alpha = Math.min(1, p.life * 2);

        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();

        p.x += p.vx;
        p.y -= p.vy;
        p.life -= p.decay;

        if (p.life <= 0 || p.y < -p.h) {
          particles[i] = spawn();
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

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}
