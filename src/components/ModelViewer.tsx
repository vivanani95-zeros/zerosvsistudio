import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default function ModelViewer({
  code,
  name = "zeros-model",
}: {
  code: string;
  name?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07090f);
    const camera = new THREE.PerspectiveCamera(
      45,
      host.clientWidth / host.clientHeight,
      0.1,
      1000,
    );
    camera.position.set(4.5, 3.2, 5.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.2;

    scene.add(new THREE.HemisphereLight(0xbfe8ff, 0x101018, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(5, 8, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x66e6ff, 1.4);
    rim.position.set(-6, 3, -5);
    scene.add(rim);
    const grid = new THREE.GridHelper(20, 40, 0x1d3a4a, 0x14202b);
    grid.position.y = -2;
    scene.add(grid);

    try {
      const factory = new Function(
        "THREE",
        `${code}\n;return typeof build === "function" ? build(THREE) : null;`,
      ) as (t: typeof THREE) => THREE.Group | null;
      const group = factory(THREE);
      if (!group) throw new Error("The generated script did not return a model.");
      const box = new THREE.Box3().setFromObject(group);
      const size = box.getSize(new THREE.Vector3()).length() || 1;
      const center = box.getCenter(new THREE.Vector3());
      group.position.sub(center);
      const scale = 4 / size;
      group.scale.setScalar(scale);
      groupRef.current = group;
      scene.add(group);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Model script failed");
    }

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!host.clientWidth) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [code]);

  const download = () => {
    const group = groupRef.current;
    if (!group) return;
    new GLTFExporter().parse(
      group,
      (result) => {
        const blob = new Blob([result as ArrayBuffer], {
          type: "model/gltf-binary",
        });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${name}.glb`;
        a.click();
        URL.revokeObjectURL(a.href);
      },
      () => setError("GLB export failed"),
      { binary: true },
    );
  };

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-border">
      <div ref={hostRef} className="h-80 w-full bg-[oklch(0.07_0.008_265)]" />
      <div className="flex items-center justify-between gap-3 border-t border-border bg-card/60 px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {error ? `⚠ ${error}` : "Drag to orbit · scroll to zoom"}
        </span>
        <button
          onClick={download}
          disabled={!!error}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          Download .glb
        </button>
      </div>
    </div>
  );
}
