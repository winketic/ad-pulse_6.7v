"use client";

import { useRef, useEffect } from "react";
import { createNoise2D } from "simplex-noise";

export default function FireBanner() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const noise2D = createNoise2D();
    const offscreen = document.createElement("canvas");
    let animId: number;
    let W = 0;
    let H = 0;
    let time = 0;

    const init = () => {
      const parent = canvas.parentElement;
      W = parent?.offsetWidth ?? 300;
      H = parent?.offsetHeight ?? 80;
      canvas.width = W;
      canvas.height = H;
      offscreen.width = W;
      offscreen.height = H;
    };

    const draw = () => {
      time += 0.025;

      const offCtx = offscreen.getContext("2d")!;
      offCtx.clearRect(0, 0, W, H);
      offCtx.fillStyle = "#0d0010";
      offCtx.fillRect(0, 0, W, H);

      const stride = 3;
      for (let x = 0; x < W; x += stride) {
        // Two noise layers for organic shape
        const n1 = (noise2D(x * 0.04, time * 2) + 1) / 2;
        const n2 = (noise2D(x * 0.09 + 50, time * 1.5) + 1) / 2;
        const flameH = ((n1 * 0.6 + n2 * 0.4)) * H * 0.92;

        if (flameH < 1) continue;

        const grad = offCtx.createLinearGradient(x, H, x, H - flameH);
        grad.addColorStop(0,    "rgba(255,255,255,1)");
        grad.addColorStop(0.15, "rgba(255,255,0,1)");
        grad.addColorStop(0.4,  "rgba(255,102,0,0.95)");
        grad.addColorStop(0.7,  "rgba(255,20,147,0.7)");
        grad.addColorStop(1,    "rgba(204,0,255,0)");

        offCtx.fillStyle = grad;
        offCtx.fillRect(x, H - flameH, stride, flameH);
      }

      // Composite with blur for softness
      ctx.clearRect(0, 0, W, H);
      ctx.filter = "blur(4px)";
      ctx.drawImage(offscreen, 0, 0);
      ctx.filter = "none";

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
