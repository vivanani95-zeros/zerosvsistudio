import type * as THREE_NS from "three";

/**
 * Builds a dense, stable fallback asset without asking a language model to emit
 * thousands of fragile lines of JavaScript. Instancing keeps the draw-call and
 * memory cost bounded while still producing tens of thousands of visible parts.
 */
export function buildProceduralModel(THREE: typeof THREE_NS, prompt: string): THREE_NS.Group {
  const group = new THREE.Group();
  group.name = prompt || "Zeros studio model";

  const seed = [...prompt].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 2166136261);
  const rand = (i: number) => {
    const x = Math.sin(seed + i * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };

  const shellMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setHSL(0.49 + rand(2) * 0.12, 0.5, 0.22),
    metalness: 0.78,
    roughness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.14,
  });
  const trimMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x182027,
    metalness: 0.94,
    roughness: 0.26,
    clearcoat: 0.7,
  });
  const glowMaterial = new THREE.MeshStandardMaterial({
    color: 0x8fffea,
    emissive: 0x22d9c2,
    emissiveIntensity: 3,
    roughness: 0.22,
  });

  const coreGeometry = new THREE.SphereGeometry(1.35, 192, 128);
  const position = coreGeometry.attributes.position;
  const vertex = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    vertex.fromBufferAttribute(position, i);
    const wave = Math.sin(vertex.x * 17 + seed) * Math.sin(vertex.y * 23) * Math.sin(vertex.z * 19);
    vertex.multiplyScalar(1 + wave * 0.018 + (rand(i) - 0.5) * 0.008);
    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  coreGeometry.computeVertexNormals();
  const core = new THREE.Mesh(coreGeometry, shellMaterial);
  core.position.y = 1.48;
  core.scale.set(1, 0.82 + rand(4) * 0.32, 1.05 + rand(5) * 0.28);
  core.castShadow = true;
  core.receiveShadow = true;
  group.add(core);

  const bandGeometry = new THREE.TorusGeometry(1.38, 0.035, 32, 256);
  for (let i = 0; i < 9; i += 1) {
    const band = new THREE.Mesh(bandGeometry, i % 3 === 0 ? glowMaterial : trimMaterial);
    band.position.y = 1.48;
    band.rotation.set(rand(i + 10) * Math.PI, rand(i + 20) * Math.PI, rand(i + 30) * Math.PI);
    band.scale.copy(core.scale);
    group.add(band);
  }

  const detailGeometry = new THREE.CylinderGeometry(0.008, 0.014, 0.075, 12, 2);
  const detailCount = 12000;
  const details = new THREE.InstancedMesh(detailGeometry, trimMaterial, detailCount);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < detailCount; i += 1) {
    const phi = Math.acos(1 - 2 * rand(i * 3 + 1));
    const theta = Math.PI * 2 * rand(i * 3 + 2);
    const normal = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    );
    const radius = 1.36 + rand(i * 5) * 0.055;
    const point = normal.clone().multiplyScalar(radius);
    point.y *= core.scale.y;
    point.z *= core.scale.z;
    point.y += 1.48;
    quaternion.setFromUnitVectors(up, normal);
    const s = 0.55 + rand(i * 7) * 0.9;
    scale.set(s, s, s);
    matrix.compose(point, quaternion, scale);
    details.setMatrixAt(i, matrix);
  }
  details.instanceMatrix.needsUpdate = true;
  details.castShadow = true;
  group.add(details);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.26, 0.09, 48, 256), trimMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.16;
  group.add(ring);

  const contact = new THREE.Mesh(
    new THREE.CircleGeometry(1.7, 192),
    new THREE.MeshStandardMaterial({ color: 0x030608, roughness: 0.96, transparent: true, opacity: 0.8 }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.015;
  group.add(contact);
  return group;
}