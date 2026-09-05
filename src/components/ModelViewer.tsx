import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildProceduralModel } from "@/lib/procedural-model";
import { buildModelFromSpec, type ModelSpec } from "@/lib/model-spec";

export default function ModelViewer({
  code,
  url,
  spec,
  name = "zeros-model",
  source,
  prompt,
}: {
  code?: string;
  url?: string;
  spec?: ModelSpec;
  name?: string;
  source?: string;
  prompt?: string;
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
      40,
      host.clientWidth / host.clientHeight,
      0.05,
      200,
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    host.appendChild(renderer.domElement);

    // Studio image-based lighting — the "photo booth" a DCC tool renders in.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.9;

    scene.add(new THREE.HemisphereLight(0xdfeaff, 0x0a0d12, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(4, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0006;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfe4ff, 0.9);
    fill.position.set(-5, 3, 4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0x66e6ff, 1.5);
    rim.position.set(-4, 4, -6);
    scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(30, 96),
      new THREE.MeshStandardMaterial({ color: 0x0a0e14, roughness: 0.85, metalness: 0.1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(40, 80, 0x123241, 0x0d1a22);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    grid.position.y = 0.002;
    scene.add(grid);

    /** Center the object, sit it on the floor, and fill the frame. */
    const frame = (obj: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const scale = 3 / maxDim;
      obj.position.sub(center);
      obj.scale.setScalar(scale);
      obj.position.multiplyScalar(scale);
      obj.position.y += (size.y / 2) * scale;
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      groupRef.current = obj;
      scene.add(obj);

      const radius = (new THREE.Vector3(size.x, size.y, size.z).length() / 2) * scale;
      const fov = (camera.fov * Math.PI) / 180;
      const dist = (radius / Math.sin(fov / 2)) * 1.12;
      const target = new THREE.Vector3(0, (size.y / 2) * scale, 0);
      camera.position.set(dist * 0.62, target.y + dist * 0.42, dist * 0.75);
      camera.near = dist / 100;
      camera.far = dist * 20;
      camera.updateProjectionMatrix();
      controls.target.copy(target);
      controls.update();
      key.target.position.copy(target);
      scene.add(key.target);
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
    } else if (spec) {
      try {
        frame(buildModelFromSpec(THREE, spec));
      } catch {
        frame(buildProceduralModel(THREE, prompt ?? "model"));
      }
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
    } else if (prompt) {
      frame(buildProceduralModel(THREE, prompt));
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
      pmrem.dispose();
      envTex.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [code, prompt, spec, url]);

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
      <div ref={hostRef} className="h-[26rem] w-full bg-[oklch(0.06_0.008_265)]" />
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
