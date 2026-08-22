import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Infinite straight wireframe tunnel — concentric teal rings rushing toward the
 * viewer forever, with radial spokes and drifting glow particles.
 */
export default function TunnelBackground({ speed = 1 }: { speed?: number }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const DEPTH = 90;
    const GAP = 1.35;
    const RING_COUNT = Math.floor(DEPTH / GAP);
    const RADIUS = 6.2;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      75,
      host.clientWidth / Math.max(1, host.clientHeight),
      0.1,
      DEPTH * 2,
    );
    camera.position.set(0, 0, 6);
    camera.lookAt(0, 0, -10);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const world = new THREE.Group();
    scene.add(world);

    // ---- concentric rings (thin bright lines, like the reference) ---------
    const pts: THREE.Vector3[] = [];
    const SEG = 160;
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * RADIUS, Math.sin(a) * RADIUS, 0));
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(pts);

    const rings: THREE.Line[] = [];
    for (let i = 0; i < RING_COUNT; i++) {
      const mat = new THREE.LineBasicMaterial({
        color: i % 5 === 0 ? 0x9ff8e2 : 0x3fe0cf,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Line(ringGeo, mat);
      ring.position.z = -i * GAP;
      ring.scale.setScalar(1 + Math.sin(i * 0.6) * 0.04);
      world.add(ring);
      rings.push(ring);
    }

    // ---- radial spokes running down the tunnel ---------------------------
    const spokeMat = new THREE.LineBasicMaterial({
      color: 0x2fd6c6,
      transparent: true,
      opacity: 0.16,
    });
    const SPOKES = 16;
    for (let i = 0; i < SPOKES; i++) {
      const a = (i / SPOKES) * Math.PI * 2;
      const x = Math.cos(a) * RADIUS;
      const y = Math.sin(a) * RADIUS;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, y, 6),
        new THREE.Vector3(x * 1.02, y * 1.02, -DEPTH),
      ]);
      world.add(new THREE.Line(geo, spokeMat));
    }

    // ---- drifting particles ---------------------------------------------
    const COUNT = 700;
    const pos = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = RADIUS * (0.1 + Math.random() * 0.9);
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.sin(a) * r;
      pos[i * 3 + 2] = -Math.random() * DEPTH;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const particles = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({
        color: 0xd6fff6,
        size: 0.055,
        transparent: true,
        opacity: 0.85,
      }),
    );
    world.add(particles);

    let raf = 0;
    let last = performance.now();
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
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const travel = 7 * speed * dt;

      for (const ring of rings) {
        ring.position.z += travel;
        if (ring.position.z > 6) ring.position.z -= RING_COUNT * GAP;
        // distance from camera (camera sits at z = 6)
        const d = 6 - ring.position.z;
        const m = ring.material as THREE.LineBasicMaterial;
        // bright up close, fading softly into the vanishing point
        m.opacity = Math.max(0.06, 1.0 * (1 - Math.min(1, d / (DEPTH * 0.8))));
      }

      const arr = pGeo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < COUNT; i++) {
        let z = arr.getZ(i) + travel * 0.7;
        if (z > 6) z -= DEPTH;
        arr.setZ(i, z);
      }
      arr.needsUpdate = true;

      world.rotation.z += 0.03 * dt;
      camera.rotation.x += (-mouseY * 0.05 - camera.rotation.x) * 0.05;
      camera.rotation.y += (-mouseX * 0.05 - camera.rotation.y) * 0.05;

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      renderer.dispose();
      ringGeo.dispose();
      pGeo.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [speed]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black">
      <div ref={hostRef} className="h-full w-full" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.4_0.1_180_/_0.14)_0%,transparent_50%,oklch(0_0_0_/_0.85)_100%)]" />
    </div>
  );
}
