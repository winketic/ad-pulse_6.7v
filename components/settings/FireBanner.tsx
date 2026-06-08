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

const COLORS = ["#ff69b4", "#ff1493", "#ff007f", "#ff99cc"];

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
      x: W * 0.25 + Math.random() * W * 0.75,
      y: H + 8,
      vx: -(0.1 + Math.random() * 0.3),
      vy: 0.7 + Math.random() * 1.4,
      life: 1,
      decay: 0.008 + Math.random() * 0.012,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });

    const init = () => {
      const parent = canvas.parentElement;
      W = parent?.offsetWidth ?? 300;
      H = parent?.offsetHeight ?? 80;
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
      ctx.fillStyle = "#1a0010";
      ctx.fillRect(0, 0, W, H);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const alpha = Math.min(1, p.life * 2);

        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#ff1493";
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        // rx=2, ry=8 elongated upward flame shape
        ctx.beginPath();
        ctx.ellipse(0, 0, 2, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        p.x += p.vx;
        p.y -= p.vy;
        p.life -= p.decay;

        if (p.life <= 0 || p.y < -8) {
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
