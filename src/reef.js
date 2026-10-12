import * as THREE from 'three';
import { fbm, mulberry32, hashSeed } from './noise.js';
import { rockGeo, groundMin, yawOffset, LANDMARK_X, LANDMARK_Z, LANDMARK_CLEAR } from './props.js';
import { Batch, trunkGeo, canopyGeo } from './jungle.js';

// Seabed props: kelp forests that sway in the swell, coral gardens (brain, branching,
// fan, tube sponges), reef rocks, and a shipwreck ahead of the start.

const srgb = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

// Kelp: two crossed ribbons, base at the origin, 1 unit tall, narrowing to the tip.
function kelpGeometry() {
  const segs = 12;
  const pos = [];
  const idx = [];
  for (const [ax, az] of [[1, 0], [0, 1]]) {
    const base = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const w = 0.5 * (1 - t * 0.6) * (0.8 + 0.2 * Math.sin(t * 19)); // ruffled blade
      pos.push(-ax * w, t, -az * w, ax * w, t, az * w);
    }
    for (let i = 0; i < segs; i++) {
      const k = base + i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const kelpGeo = kelpGeometry();
const brainGeo = new THREE.IcosahedronGeometry(1, 2);
const tubeGeo = new THREE.CylinderGeometry(1, 0.8, 1, 9, 1, true);
tubeGeo.translate(0, 0.5, 0);

// Sway in world units: the shader divides by the instance's own scale.
export const swellUniforms = { uTime: { value: 0 } };
const kelpMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, side: THREE.DoubleSide });
kelpMat.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = swellUniforms.uTime;
  shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    {
      vec3 root = instanceMatrix[3].xyz;
      float sx = length(instanceMatrix[0].xyz);
      float sz = length(instanceMatrix[2].xyz);
      float t = position.y;
      float bend = t * t;
      float phase = uTime * 0.9 + root.x * 0.11 + root.z * 0.07;
      transformed.x += (sin(phase + t * 2.2) * 1.8 + 0.8) * bend / sx;
      transformed.z += cos(phase * 0.8 + t * 1.7) * 0.9 * bend / sz;
    }`);
};
kelpMat.customProgramCacheKey = () => 'reef-kelp-1';

const coral = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true });
const sponge = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
const reefRock = new THREE.MeshStandardMaterial({ color: srgb(0.33, 0.4, 0.38), roughness: 1, flatShading: true });
const wood = new THREE.MeshStandardMaterial({ color: srgb(0.28, 0.24, 0.2), roughness: 0.95, flatShading: true });
const algae = new THREE.MeshStandardMaterial({ color: srgb(0.24, 0.34, 0.24), roughness: 1, flatShading: true });

const KELP_TONES = [srgb(0.5, 0.58, 0.2), srgb(0.6, 0.55, 0.2), srgb(0.44, 0.54, 0.22)];
const CORAL_TONES = [
  srgb(0.95, 0.42, 0.45), srgb(1.0, 0.62, 0.3), srgb(0.95, 0.85, 0.35),
  srgb(0.62, 0.4, 0.9), srgb(0.35, 0.7, 0.95), srgb(0.9, 0.35, 0.7),
];
const pick = (rng, list) => list[Math.floor(rng() * list.length)];

const SPAWN_CLEAR = 50;

function clearOfSpawn(x, z, pad) {
  if (Math.hypot(x, z) < SPAWN_CLEAR + pad) return false;
  return (x - LANDMARK_X) ** 2 + (z - LANDMARK_Z) ** 2 > (LANDMARK_CLEAR * 0.6 + pad) ** 2;
}

function kelp(b, rng, x, z, heightAt) {
  const h = 6 + rng() * 9;
  const w = 0.7 + rng() * 0.5;
  b.kelp.add(x, heightAt(x, z) - 0.2, z, w, h, w, rng() * Math.PI, 0, 0, pick(rng, KELP_TONES));
}

function brain(b, colliders, rng, x, z, heightAt) {
  const r = 0.6 + rng() * 1.6;
  const gy = heightAt(x, z);
  b.brain.add(x, gy + r * 0.2, z, r * (1 + rng() * 0.3), r * 0.65, r * (1 + rng() * 0.3), rng() * 6, 0, 0, pick(rng, CORAL_TONES));
  if (r > 1.2) colliders.push({ x, z, r: r * 0.9, top: gy + r * 0.8 });
}

function branching(b, rng, x, z, heightAt) {
  const gy = heightAt(x, z) - 0.1;
  const tone = pick(rng, CORAL_TONES);
  const n = 6 + Math.floor(rng() * 6);
  const h = 1 + rng() * 1.6;
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    b.branch.add(x, gy, z, 0.07, h * (0.6 + rng() * 0.5), 0.07, a, 0.2 + rng() * 0.6, 0, tone);
  }
}

function fan(b, rng, x, z, heightAt) {
  const s = 0.9 + rng() * 1.4;
  b.fan.add(x, heightAt(x, z) + s * 0.8, z, s, s * 0.9, 0.06, rng() * Math.PI, (rng() - 0.5) * 0.3, 0, pick(rng, CORAL_TONES));
}

function tubes(b, rng, x, z, heightAt) {
  const gy = heightAt(x, z) - 0.1;
  const tone = pick(rng, CORAL_TONES);
  const n = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const px = x + (rng() - 0.5) * 1.2;
    const pz = z + (rng() - 0.5) * 1.2;
    const r = 0.15 + rng() * 0.15;
    b.tube.add(px, gy, pz, r, 0.6 + rng() * 1.6, r, 0, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.3, tone);
  }
}

function rockPile(b, colliders, rng, x, z, heightAt) {
  const n = 2 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const px = x + (rng() - 0.5) * 12;
    const pz = z + (rng() - 0.5) * 12;
    const s = 1.2 + rng() * 3;
    const gy = heightAt(px, pz) - s * 0.35;
    b.rock.add(px, gy, pz, s * (1 + rng() * 0.6), s * 0.8, s * (1 + rng() * 0.6), rng() * 6, rng() * 0.4, rng() * 0.4);
    colliders.push({ x: px, z: pz, r: s * 1.25, top: gy + s * 0.8 });
  }
}

// A wooden hull lying on its side in the sand: keel, two hull walls, deck, a cabin, a
// standing broken mast and a fallen one. Colliders run down the keel line.
function shipwreck(group, colliders, rng, x, z, heightAt) {
  const yaw = Math.atan2(-x, -z) + 0.9; // broadside-ish to the start
  const len = 34;
  const gy = groundMin(heightAt, x, z, len * 0.5) - 1.6;
  const ship = new THREE.Group();
  ship.position.set(x, gy, z);
  ship.rotation.set(0.05, yaw, 0.32, 'YXZ'); // yawed, nose slightly down, rolled onto its side
  const box = new THREE.BoxGeometry(1, 1, 1);
  const part = (mat, px, py, pz, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(box, mat);
    m.position.set(px, py, pz);
    m.scale.set(sx, sy, sz);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    ship.add(m);
    return m;
  };
  part(wood, 0, 0.8, 0, 2.2, 1.6, len); // keel
  part(wood, -3.6, 3.6, 0, 0.6, 6, len * 0.9, 0, 0, -0.14); // hull walls
  part(algae, 3.6, 3.6, -1, 0.6, 5.4, len * 0.82, 0, 0, 0.14);
  part(wood, 0, 6.4, -1, 7.2, 0.5, len * 0.78); // deck
  part(wood, 0, 3.2, len * 0.47, 4.2, 5, 4, 0.25, Math.PI / 4, 0); // bow
  part(wood, 0, 8.6, -len * 0.33, 6, 4, 7); // stern cabin
  part(algae, 0, 10.8, -len * 0.33, 6.6, 0.5, 7.6);
  const mast = new THREE.Mesh(trunkGeo, wood);
  mast.position.set(0, 6.4, len * 0.12);
  mast.scale.set(0.45, 9 + rng() * 3, 0.45);
  mast.castShadow = true;
  ship.add(mast);
  const fallen = new THREE.Mesh(trunkGeo, wood);
  fallen.position.set(2, 6.6, -len * 0.08);
  fallen.scale.set(0.4, 14, 0.4);
  fallen.rotation.set(0, 0, -1.25);
  fallen.castShadow = true;
  ship.add(fallen);
  group.add(ship);
  for (let lz = -len / 2 + 3; lz <= len / 2 - 2; lz += 5.5) {
    const [ox, oz] = yawOffset(yaw, 0, lz);
    colliders.push({ x: x + ox, z: z + oz, r: 4.6, top: gy + 11 });
  }
}

export function buildReefProps(cx, cz, size, heightAt) {
  const group = new THREE.Group();
  const colliders = [];
  const slopes = [];
  const rng = mulberry32(hashSeed(cx + 13000, cz - 13000));
  const b = {
    kelp: new Batch(kelpGeo, kelpMat, { shadow: false, colors: true }),
    brain: new Batch(brainGeo, coral, { colors: true }),
    branch: new Batch(trunkGeo, coral, { colors: true }),
    fan: new Batch(canopyGeo, coral, { colors: true }),
    tube: new Batch(tubeGeo, sponge, { colors: true }),
    rock: new Batch(rockGeo, reefRock),
  };
  const x0 = cx * size;
  const z0 = cz * size;

  if (cx === 0 && cz === 0) shipwreck(group, colliders, mulberry32(hashSeed(17, 29)), LANDMARK_X, LANDMARK_Z, heightAt);

  // Kelp in forests, corals in gardens: two noise fields decide where each grows.
  for (let i = 0; i < 420; i++) {
    const x = x0 + rng() * size;
    const z = z0 + rng() * size;
    const forest = fbm(x * 0.008 + 2.5, z * 0.008 + 9.1, 2);
    const garden = fbm(x * 0.012 + 7.3, z * 0.012 + 4.4, 2);
    const roll = rng();
    if (forest > 0.5 && roll < (forest - 0.5) * 6) {
      if (clearOfSpawn(x, z, 2)) kelp(b, rng, x, z, heightAt);
    } else if (garden > 0.5 && roll < (garden - 0.45) * 3) {
      if (!clearOfSpawn(x, z, 0)) continue;
      const kind = rng();
      if (kind < 0.35) brain(b, colliders, rng, x, z, heightAt);
      else if (kind < 0.6) branching(b, rng, x, z, heightAt);
      else if (kind < 0.8) fan(b, rng, x, z, heightAt);
      else tubes(b, rng, x, z, heightAt);
    }
  }
  if (rng() < 0.5) {
    const x = x0 + 20 + rng() * (size - 40);
    const z = z0 + 20 + rng() * (size - 40);
    if (clearOfSpawn(x, z, 8)) rockPile(b, colliders, rng, x, z, heightAt);
  }

  for (const batch of Object.values(b)) batch.build(group);
  return { group, colliders, slopes };
}
