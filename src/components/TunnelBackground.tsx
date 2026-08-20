import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Infinite 3D wireframe tunnel. Pure three.js, runs client-side only.
 */
export default function TunnelBackground({ speed = 1 }: { speed?: number }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x03050a, 0.03);

    const camera = new THREE.PerspectiveCamera(
      78,
      host.clientWidth / host.clientHeight,
      0.1,
      120,
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    // Closed, seamless tunnel path — the camera loops forever with no jump.
    const points: THREE.Vector3[] = [];
    const SEGS = 160;
    const R = 90;
    for (let i = 0; i < SEGS; i++) {
      const a = (i / SEGS) * Math.PI * 2;
      points.push(
        new THREE.Vector3(
          Math.cos(a) * R + Math.sin(a * 3) * 12,
          Math.sin(a * 2) * 14 + Math.cos(a * 5) * 5,
          Math.sin(a) * R + Math.cos(a * 3) * 12,
        ),
      );
    }
    const curve = new THREE.CatmullRomCurve3(points, true, "catmullrom", 0.5);

    const tube = new THREE.TubeGeometry(curve, 900, 4.4, 16, true);

    const wire = new THREE.Mesh(
      tube,
      new THREE.MeshBasicMaterial({
        color: 0x4ff2e0,
        wireframe: true,
        transparent: true,
        opacity: 0.35,
        side: THREE.BackSide,
      }),
    );
    scene.add(wire);

    const innerTube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 600, 9, 14, true),
      new THREE.MeshBasicMaterial({
        color: 0x061420,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.75,
      }),
    );
    scene.add(innerTube);


    // Glowing particles floating inside the tunnel
    const count = 900;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const t = Math.random();
      const p = curve.getPointAt(Math.min(0.999, t));
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 3.4;
      pos[i * 3] = p.x + Math.cos(a) * r;
      pos[i * 3 + 1] = p.y + Math.sin(a) * r;
      pos[i * 3 + 2] = p.z;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const particles = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({
        color: 0xc86bff,
        size: 0.055,
        transparent: true,
        opacity: 0.85,
      }),
    );
    scene.add(particles);

    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 26; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3.9, 0.012, 6, 64),
        new THREE.MeshBasicMaterial({
          color: i % 4 === 0 ? 0xc86bff : 0x35e6f5,
          transparent: true,
          opacity: 0.5,
        }),
      );
      rings.push(ring);
      scene.add(ring);
    }

    let raf = 0;
    let t = 0;
    let mouseX = 0;
    let mouseY = 0;

    const onMove = (e: PointerEvent) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onMove);

    const onResize = () => {
      if (!host.clientWidth) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener("resize", onResize);

    const animate = () => {
      raf = requestAnimationFrame(animate);
      t = (t + 0.00035 * speed) % 1;

      const p = curve.getPointAt(t);
      const look = curve.getPointAt((t + 0.02) % 1);
      camera.position.set(p.x, p.y, p.z);
      camera.lookAt(look);
      camera.rotation.z += Math.sin(t * 30) * 0.06;
      camera.rotation.x += mouseY * 0.05;
      camera.rotation.y += mouseX * 0.05;

      rings.forEach((ring, i) => {
        const rt = (t + (i + 1) * 0.012) % 1;
        const rp = curve.getPointAt(rt);
        const rl = curve.getPointAt((rt + 0.005) % 1);

        ring.position.copy(rp);
        ring.lookAt(rl);
        const m = ring.material as THREE.MeshBasicMaterial;
        m.opacity = 0.15 + 0.35 * (1 - i / rings.length);
      });

      particles.rotation.z += 0.0006;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [speed]);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[oklch(0.05_0.006_265)]">
      <div ref={hostRef} className="h-full w-full" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,oklch(0.04_0.005_265)_85%)]" />
    </div>
  );
}
