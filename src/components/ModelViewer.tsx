import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default function ModelViewer({
  code,
  url,
  name = "zeros-model",
  source,
}: {
  code?: string;
  url?: string;
  name?: string;
  source?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const groupRef = useRef<THREE.Object3D | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070c);
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

    scene.add(new THREE.HemisphereLight(0xbfe8ff, 0x101018, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(5, 8, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x66e6ff, 1.4);
    rim.position.set(-6, 3, -5);
    scene.add(rim);
    const grid = new THREE.GridHelper(20, 40, 0x1d3a4a, 0x14202b);
    grid.position.y = -2;
    scene.add(grid);

    const frame = (obj: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3()).length() || 1;
      const center = box.getCenter(new THREE.Vector3());
      obj.position.sub(center);
      obj.scale.setScalar(4 / size);
      groupRef.current = obj;
      scene.add(obj);
    };

    let disposed = false;

    if (url) {
      new GLTFLoader().load(
        url,
        (gltf) => {
          if (disposed) return;
          frame(gltf.scene);
          setLoading(false);
        },
        undefined,
        () => {
          if (disposed) return;
          setError("Could not load the generated model file.");
          setLoading(false);
        },
      );
    } else if (code) {
      try {
        const factory = new Function(
          "THREE",
          `${code}\n;return typeof build === "function" ? build(THREE) : null;`,
        ) as (t: typeof THREE) => THREE.Group | null;
        const group = factory(THREE);
        if (!group) throw new Error("The generated script did not return a model.");
        frame(group);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Model script failed");
      }
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
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [code, url]);

  const download = async () => {
    if (url) {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${name}.glb`;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch {
        window.open(url, "_blank");
      }
      return;
    }
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
      <div ref={hostRef} className="h-80 w-full bg-[oklch(0.06_0.008_265)]" />
      <div className="flex items-center justify-between gap-3 border-t border-border bg-card/60 px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {error
            ? `⚠ ${error}`
            : loading
              ? "Loading model…"
              : `Drag to orbit · scroll to zoom${source ? ` · ${source}` : ""}`}
        </span>
        <button
          onClick={() => void download()}
          disabled={!!error || loading}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          Download .glb
        </button>
      </div>
    </div>
  );
}
