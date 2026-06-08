"use client";

import { useRef, useEffect } from "react";

interface Particle {
  x: number;
  y: number;
  rx: number;
  ry: number;
  vy: number;
  life: number;
  decay: number;
}

function lerpColor(t: number): string {
  // t: 0 = bottom (#ff006e), 0.5 = mid (#ff4da6), 1 = top (#cc00ff)
  if (t < 0.5) {
    const u = t * 2;
    const r = Math.round(0xff + (0xff - 0xff) * u);
    const g = Math.round(0x00 + (0x4d - 0x00) * u);
    const b = Math.round(0x6e + (0xa6 - 0x6e) * u);
    return `rgb(${r},${g},${b})`;
  } else {
    const u = (t - 0.5) * 2;
    const r = Math.round(0xff + (0xcc - 0xff) * u);
    const g = Math.round(0x4d + (0x00 - 0x4d) * u);
    const b = Math.round(0xa6 + (0xff - 0xa6) * u);
    return `rgb(${r},${g},${b})`;
  }
}

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
      x: Math.random() * W,
      y: H + 4,
      rx: 1 + Math.random() * 1.5,
      ry: 2.5 + Math.random() * 3,
      vy: 0.6 + Math.random() * 1.4,
      life: 1,
      decay: 0.008 + Math.random() * 0.012,
    });

    const init = () => {
      const parent = canvas.parentElement;
      W = parent?.offsetWidth ?? 300;
      H = parent?.offsetHeight ?? 70;
      canvas.width = W;
      canvas.height = H;
      particles = Array.from({ length: 80 }, () => {
        const p = spawn();
        p.y = Math.random() * H; // scatter initial positions
        p.life = Math.random();
        return p;
      });
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#1a0a2e";
      ctx.fillRect(0, 0, W, H);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const t = 1 - p.y / H; // 0 at bottom, 1 at top
        const alpha = p.life * (p.y / H);

        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillStyle = lerpColor(Math.max(0, Math.min(1, t)));
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        p.y -= p.vy;
        p.life -= p.decay;

        if (p.life <= 0 || p.y < -p.ry) {
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
