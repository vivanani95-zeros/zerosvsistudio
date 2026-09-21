import { useEffect, useRef } from "react";

type TunnelBackgroundProps = { speed?: number };

/**
 * Native Canvas 2D tunnel background.
 * Deliberately has no Three.js/WebGL dependency so the app can build without it.
 */
export default function TunnelBackground({ speed = 1 }: TunnelBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();
    let width = 0;
    let height = 0;
    let dpr = 1;
    let mouseX = 0;
    let mouseY = 0;

    const DEPTH = 90;
    const GAP = 1.35;
    const RING_COUNT = Math.floor(DEPTH / GAP);
    const RADIUS = 6.2;
    const SEGMENTS = 96;
    const SPOKES = 16;
    const particles = Array.from({ length: 260 }, (_, i) => ({
      angle: Math.random() * Math.PI * 2,
      radius: 0.2 + Math.random() * 0.8,
      z: Math.random() * DEPTH,
      phase: i * 0.37,
    }));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onMove = (event: PointerEvent) => {
      mouseX = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      mouseY = (event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    };

    const project = (x: number, y: number, z: number) => {
      const depth = Math.max(0.8, z);
      const focal = Math.min(width, height) * 0.82;
      const scale = focal / depth;
      return {
        x: width * 0.5 + x * scale + mouseX * 10,
        y: height * 0.5 + y * scale + mouseY * 7,
        scale,
      };
    };

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const travel = 7 * speed * dt;

      ctx.clearRect(0, 0, width, height);
      const gradient = ctx.createRadialGradient(
        width * 0.5, height * 0.5, 0,
        width * 0.5, height * 0.5, Math.max(width, height) * 0.7,
      );
      gradient.addColorStop(0, "rgba(40,220,195,0.10)");
      gradient.addColorStop(0.5, "rgba(0,0,0,0.18)");
      gradient.addColorStop(1, "rgba(0,0,0,0.92)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.translate(width * 0.5 + mouseX * 10, height * 0.5 + mouseY * 7);
      ctx.rotate(now * 0.00003);

      for (let i = RING_COUNT - 1; i >= 0; i--) {
        const z = ((i * GAP - now * 0.007 * speed) % DEPTH + DEPTH) % DEPTH;
        const r = RADIUS;
        const center = project(0, 0, z + 0.01);
        const rx = r * center.scale;
        const ry = r * center.scale;
        if (rx < 1 || rx > Math.max(width, height) * 2.2) continue;
        const fade = Math.max(0.04, 1 - z / (DEPTH * 0.86));
        ctx.beginPath();
        for (let s = 0; s <= SEGMENTS; s++) {
          const a = (s / SEGMENTS) * Math.PI * 2;
          const p = project(Math.cos(a) * r, Math.sin(a) * r, z + 0.01);
          if (s === 0) ctx.moveTo(p.x - width * 0.5, p.y - height * 0.5);
          else ctx.lineTo(p.x - width * 0.5, p.y - height * 0.5);
        }
        ctx.closePath();
        ctx.strokeStyle = i % 5 === 0
          ? `rgba(159,248,226,${0.12 + fade * 0.72})`
          : `rgba(63,224,207,${0.06 + fade * 0.56})`;
        ctx.lineWidth = i % 5 === 0 ? 1.25 : 0.8;
        ctx.stroke();
      }

      ctx.lineWidth = 0.7;
      for (let i = 0; i < SPOKES; i++) {
        const a = (i / SPOKES) * Math.PI * 2;
        const near = project(Math.cos(a) * RADIUS, Math.sin(a) * RADIUS, 0.9);
        const far = project(Math.cos(a) * RADIUS, Math.sin(a) * RADIUS, DEPTH);
        ctx.beginPath();
        ctx.moveTo(near.x - width * 0.5, near.y - height * 0.5);
        ctx.lineTo(far.x - width * 0.5, far.y - height * 0.5);
        ctx.strokeStyle = "rgba(47,214,198,0.10)";
        ctx.stroke();
      }

      for (const particle of particles) {
        particle.z -= travel * 0.7;
        if (particle.z < 0.8) particle.z += DEPTH;
        const a = particle.angle + Math.sin(now * 0.0004 + particle.phase) * 0.03;
        const p = project(
          Math.cos(a) * RADIUS * particle.radius,
          Math.sin(a) * RADIUS * particle.radius,
          particle.z,
        );
        const alpha = Math.max(0.03, 0.75 * (1 - particle.z / DEPTH));
        const size = Math.max(0.5, Math.min(2.4, p.scale * 0.035));
        ctx.fillStyle = `rgba(214,255,246,${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x - width * 0.5, p.y - height * 0.5, size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
    };
  }, [speed]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black">
      <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.4_0.1_180_/_0.14)_0%,transparent_50%,oklch(0_0_0_/_0.85)_100%)]" />
    </div>
  );
}
