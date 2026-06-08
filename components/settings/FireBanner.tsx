"use client";

import { useRef, useEffect } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  color: string;
}

const COLORS = ["#ff006e", "#ff4da6", "#cc00ff", "#7b00ff"];

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
      x: W * 0.4 + Math.random() * W * 0.6,
      y: H + 6,
      vx: -(0.1 + Math.random() * 0.3),
      vy: 0.7 + Math.random() * 1.3,
      life: 1,
      decay: 0.01 + Math.random() * 0.015,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });

    const init = () => {
      const parent = canvas.parentElement;
      W = parent?.offsetWidth ?? 300;
      H = parent?.offsetHeight ?? 70;
      canvas.width = W;
      canvas.height = H;

      particles = Array.from({ length: 80 }, () => {
        const p = spawn();
        p.y = Math.random() * H;
        p.life = 0.3 + Math.random() * 0.7;
        return p;
      });
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const alpha = p.life * Math.min(1, p.y / H);

        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        // elongated rect 2x6px
        ctx.fillRect(-1, -3, 2, 6);
        ctx.restore();

        p.x += p.vx;
        p.y -= p.vy;
        p.life -= p.decay;

        if (p.life <= 0 || p.y < -6) {
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
