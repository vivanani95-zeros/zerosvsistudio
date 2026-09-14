import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildProceduralModel } from "@/lib/procedural-model";

export default function ModelViewer({
  url,
  name = "zeros-studio-model",
  source,
  prompt,
}: {
  url?: string;
  name?: string;
  source?: string;
  prompt?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [spin, setSpin] = useState(true);
  const [grid, setGrid] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [stats, setStats] = useState<{ tris: number; verts: number } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setLoading(true);
    setError(null);
    modelRef.current = null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070c);
    const camera = new THREE.PerspectiveCamera(40, Math.max(host.clientWidth, 1) / Math.max(host.clientHeight, 1), 0.03, 300);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = spin;
    controls.autoRotateSpeed = 0.9;
    controls.minDistance = 1.2;
    controls.maxDistance = 30;

    scene.add(new THREE.HemisphereLight(0xe7f2ff, 0x090b10, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 2.7);
    key.position.set(5, 8, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0005;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xb5dcff, 1.0);
    fill.position.set(-5, 4, 4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0x73e6ff, 1.4);
    rim.position.set(-5, 5, -6);
    scene.add(rim);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 96), new THREE.MeshStandardMaterial({ color: 0x090d13, roughness: 0.88, metalness: 0.08 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const gridHelper = new THREE.GridHelper(40, 80, 0x163948, 0x0d1d25);
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.34;
    gridHelper.position.y = 0.002;
    gridHelper.visible = grid;
    scene.add(gridHelper);

    const frame = (obj: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) throw new Error("Generated model contains no visible geometry.");
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const scale = 3.2 / maxDim;
      obj.position.sub(center);
      obj.scale.setScalar(scale);
      obj.position.multiplyScalar(scale);
      obj.position.y += (size.y * scale) / 2;

      let tris = 0;
      let verts = 0;
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const pos = mesh.geometry?.getAttribute("position");
        if (pos) {
          verts += pos.count;
          tris += Math.floor((mesh.geometry.index?.count ?? pos.count) / 3);
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          const standard = material as THREE.MeshStandardMaterial;
          if ("wireframe" in standard) standard.wireframe = wireframe;
          standard.needsUpdate = true;
        }
      });
      setStats({ tris, verts });
      modelRef.current = obj;
      scene.add(obj);

      const scaledHeight = size.y * scale;
      const radius = Math.max(1.5, new THREE.Vector3(size.x, size.y, size.z).length() * scale * 0.5);
      const fov = THREE.MathUtils.degToRad(camera.fov);
      const distance = (radius / Math.sin(fov / 2)) * 1.12;
      const target = new THREE.Vector3(0, scaledHeight / 2, 0);
      camera.position.set(distance * 0.62, target.y + distance * 0.42, distance * 0.76);
      camera.near = Math.max(0.02, distance / 120);
      camera.far = distance * 30;
      camera.updateProjectionMatrix();
      controls.target.copy(target);
      controls.update();
      setLoading(false);
    };

    let disposed = false;
    if (url) {
      new GLTFLoader().load(
        url,
        (gltf) => {
          if (disposed) return;
          try { frame(gltf.scene); } catch (e) { setError(e instanceof Error ? e.message : "Could not frame model."); setLoading(false); }
        },
        undefined,
        () => { if (!disposed) { setError("Could not load the generated model file."); setLoading(false); } },
      );
    } else if (prompt) {
      try { frame(buildProceduralModel(THREE, prompt)); } catch { setError("Could not build the generated model preview."); setLoading(false); }
    } else {
      setError("No model asset was provided.");
      setLoading(false);
    }

    let raf = 0;
    const animate = () => { raf = requestAnimationFrame(animate); controls.autoRotate = spin; gridHelper.visible = grid; controls.update(); renderer.render(scene, camera); };
    animate();

    const onResize = () => {
      if (!host.clientWidth || !host.clientHeight) return;
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
      env.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [url, prompt, spin, grid, wireframe]);

  const download = async () => {
    const model = modelRef.current;
    if (!model || exporting) return;
    setExporting(true);
    setError(null);
    try {
      const exportClone = model.clone(true);
      await new Promise<void>((resolve, reject) => {
        new GLTFExporter().parse(
          exportClone,
          (result) => {
            if (!(result instanceof ArrayBuffer)) { reject(new Error("Binary GLB export was not produced.")); return; }
            const blob = new Blob([result], { type: "model/gltf-binary" });
            const href = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = href;
            a.download = `${name.replace(/[^a-z0-9-_]+/gi, "-")}.glb`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(href), 1000);
            resolve();
          },
          (e) => reject(e instanceof Error ? e : new Error("GLB export failed.")),
          { binary: true, onlyVisible: true, truncateDrawRange: true },
        );
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "GLB export failed.");
    } finally { setExporting(false); }
  };

  const chip = (active: boolean) => `rounded-md px-2 py-1 text-[11px] font-semibold transition ${active ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card/30">
      <div className="relative">
        <div ref={hostRef} className="h-[26rem] w-full bg-[oklch(0.06_0.008_265)]" />
        {loading ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45"><div className="flex items-center gap-3 text-xs font-semibold"><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/25 border-t-primary" /> Loading 3D preview</div></div> : null}
        {stats && !loading ? <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/55 px-2 py-1 text-[11px] text-muted-foreground">{stats.tris.toLocaleString()} tris · {stats.verts.toLocaleString()} verts</div> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-card/45 px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Studio viewport</span>
        <button className={chip(spin)} onClick={() => setSpin((v) => !v)}>Turntable</button>
        <button className={chip(grid)} onClick={() => setGrid((v) => !v)}>Grid</button>
        <button className={chip(wireframe)} onClick={() => setWireframe((v) => !v)}>Wireframe</button>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border bg-card/60 px-3 py-2">
        <span className="text-xs text-muted-foreground">{error ? `⚠ ${error}` : loading ? "Loading model…" : `Drag to orbit · scroll to zoom${source ? ` · ${source}` : ""}`}</span>
        <button onClick={() => void download()} disabled={!!error || loading || exporting || !modelRef.current} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40">{exporting ? "Exporting…" : "Download .glb"}</button>
      </div>
    </div>
  );
}
