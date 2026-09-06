import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildProceduralModel } from "@/lib/procedural-model";
import { buildModelFromSpec, type ModelSpec } from "@/lib/model-spec";
import { sculptSingleMesh } from "@/lib/sculpt";

type Shading = "rendered" | "solid" | "wire";
type Quality = "draft" | "high" | "ultra";

const RES: Record<Quality, number> = { draft: 72, high: 116, ultra: 160 };

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

  // Blender-like viewport state Zeros' studio exposes to you.
  const [shading, setShading] = useState<Shading>("rendered");
  const [quality, setQuality] = useState<Quality>("high");
  const [detail, setDetail] = useState(0.55);
  const [fusion, setFusion] = useState(0.5);
  const [single, setSingle] = useState(true);
  const [spin, setSpin] = useState(true);
  const [grid, setGrid] = useState(true);
  const [stats, setStats] = useState<{ tris: number; verts: number } | null>(null);
  const [sculpting, setSculpting] = useState(false);

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
    controls.autoRotate = spin;
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
    const gridHelper = new THREE.GridHelper(40, 80, 0x123241, 0x0d1a22);
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.35;
    gridHelper.position.y = 0.002;
    gridHelper.visible = grid;
    scene.add(gridHelper);

    const applyShading = (obj: THREE.Object3D) => {
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          const mat = m as THREE.MeshStandardMaterial;
          if (!mat) return;
          mat.wireframe = shading === "wire";
          if (shading === "solid") {
            mat.metalness = 0;
            mat.roughness = 1;
            mat.envMapIntensity = 0.15;
          }
          mat.needsUpdate = true;
        });
      });
    };

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
      let tris = 0;
      let verts = 0;
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const pos = mesh.geometry?.getAttribute("position");
          if (pos) {
            verts += pos.count;
            tris += Math.floor((mesh.geometry.index?.count ?? pos.count) / 3);
          }
        }
      });
      setStats({ tris, verts });
      applyShading(obj);
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
      if (single) {
        setSculpting(true);
        setError(null);
        // Yield a frame so the viewport paints before the sculpt pass runs.
        const t = window.setTimeout(() => {
          if (disposed) return;
          try {
            const { mesh } = sculptSingleMesh(THREE, spec, {
              resolution: RES[quality],
              detail,
              fusion,
            });
            frame(mesh);
          } catch {
            try {
              frame(buildModelFromSpec(THREE, spec));
            } catch {
              frame(buildProceduralModel(THREE, prompt ?? "model"));
            }
          }
          setSculpting(false);
        }, 60);
        return () => {
          disposed = true;
          window.clearTimeout(t);
          controls.dispose();
          pmrem.dispose();
          envTex.dispose();
          renderer.dispose();
          if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
        };
      }
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
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [code, prompt, spec, url, shading, quality, detail, fusion, single, spin, grid]);

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

  const chip = (active: boolean) =>
    `rounded-md px-2 py-1 text-[11px] font-semibold transition ${
      active
        ? "bg-primary text-primary-foreground"
        : "bg-muted/40 text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-border">
      <div className="relative">
        <div ref={hostRef} className="h-[26rem] w-full bg-[oklch(0.06_0.008_265)]" />
        {sculpting ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-semibold text-foreground">
            Sculpting a single high-density mesh…
          </div>
        ) : null}
        {stats && !sculpting ? (
          <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/50 px-2 py-1 text-[11px] text-muted-foreground">
            {stats.tris.toLocaleString()} tris · {stats.verts.toLocaleString()} verts
          </div>
        ) : null}
      </div>

      {spec ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-card/40 px-3 py-2">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Studio</span>
          <button className={chip(single)} onClick={() => setSingle((v) => !v)}>
            {single ? "Single mesh" : "Parts"}
          </button>
          {(["rendered", "solid", "wire"] as Shading[]).map((s) => (
            <button key={s} className={chip(shading === s)} onClick={() => setShading(s)}>
              {s === "wire" ? "Wireframe" : s === "solid" ? "Solid" : "Rendered"}
            </button>
          ))}
          {(["draft", "high", "ultra"] as Quality[]).map((q) => (
            <button key={q} className={chip(quality === q)} onClick={() => setQuality(q)}>
              {q}
            </button>
          ))}
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            detail
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={detail}
              onChange={(e) => setDetail(Number(e.target.value))}
              className="h-1 w-16 accent-primary"
            />
          </label>
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            fuse
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={fusion}
              onChange={(e) => setFusion(Number(e.target.value))}
              className="h-1 w-16 accent-primary"
            />
          </label>
          <button className={chip(spin)} onClick={() => setSpin((v) => !v)}>
            Turntable
          </button>
          <button className={chip(grid)} onClick={() => setGrid((v) => !v)}>
            Grid
          </button>
        </div>
      ) : null}

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
          disabled={!!error || loading || sculpting}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          Download .glb
        </button>
      </div>
    </div>
  );
}
