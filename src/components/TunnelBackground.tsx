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

    const DEPTH = 120;
    const GAP = 2.4;
    const RING_COUNT = Math.floor(DEPTH / GAP);
    const RADIUS = 7.2;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 18, DEPTH * 0.92);

    const camera = new THREE.PerspectiveCamera(
      72,
      host.clientWidth / Math.max(1, host.clientHeight),
      0.1,
      DEPTH * 1.2,
    );
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -10);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const world = new THREE.Group();
    scene.add(world);

    // ---- concentric rings ------------------------------------------------
    const ringGeo = new THREE.TorusGeometry(RADIUS, 0.018, 5, 128);
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < RING_COUNT; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 6 === 0 ? 0x8ef6d8 : 0x2fd6c6,
        transparent: true,
        opacity: 0.55,
      });
      const ring = new THREE.Mesh(ringGeo, mat);
      ring.position.z = -i * GAP;
      // subtle organic wobble so it never looks like a CAD drawing
      ring.scale.setScalar(1 + Math.sin(i * 0.7) * 0.05);
      world.add(ring);
      rings.push(ring);
    }

    // ---- radial spokes running down the tunnel ---------------------------
    const spokeMat = new THREE.LineBasicMaterial({
      color: 0x1fbfb4,
      transparent: true,
      opacity: 0.22,
    });
    const SPOKES = 18;
    for (let i = 0; i < SPOKES; i++) {
      const a = (i / SPOKES) * Math.PI * 2;
      const x = Math.cos(a) * RADIUS;
      const y = Math.sin(a) * RADIUS;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, y, 4),
        new THREE.Vector3(x * 1.02, y * 1.02, -DEPTH),
      ]);
      world.add(new THREE.Line(geo, spokeMat));
    }

    // ---- drifting particles ---------------------------------------------
    const COUNT = 700;
    const pos = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = RADIUS * (0.15 + Math.random() * 0.85);
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.sin(a) * r;
      pos[i * 3 + 2] = -Math.random() * DEPTH;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const particles = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({
        color: 0xa8fff0,
        size: 0.05,
        transparent: true,
        opacity: 0.8,
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

      const travel = 9 * speed * dt;

      for (const ring of rings) {
        ring.position.z += travel;
        if (ring.position.z > 4) ring.position.z -= RING_COUNT * GAP;
        const depth = -ring.position.z;
        const m = ring.material as THREE.MeshBasicMaterial;
        m.opacity = 0.12 + 0.6 * (1 - Math.min(1, depth / DEPTH));
      }

      const arr = pGeo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < COUNT; i++) {
        let z = arr.getZ(i) + travel * 0.75;
        if (z > 4) z -= DEPTH;
        arr.setZ(i, z);
      }
      arr.needsUpdate = true;

      world.rotation.z += 0.045 * dt;
      camera.rotation.x += (-mouseY * 0.06 - camera.rotation.x) * 0.05;
      camera.rotation.y += (-mouseX * 0.06 - camera.rotation.y) * 0.05;

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
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-black">
      <div ref={hostRef} className="h-full w-full" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.35_0.09_180_/_0.18)_0%,transparent_45%,oklch(0_0_0_/_0.92)_92%)]" />
    </div>
  );
}
