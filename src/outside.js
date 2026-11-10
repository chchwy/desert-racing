import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm, mulberry32, hashSeed } from './noise.js';
import { Batch } from './jungle.js';
import { BUILDING } from './penalty.js';

// Outside the coin jail's glass block: blocky creepers, villagers and black spiders, coins
// marked 50 and the odd huge coin, thick in some places and thin in others (`density`).
// Each one is a breakable record, so Terrain.smash picks it off the bike's path before the
// collision push; main.js reads `mob` or `coin` off it. Placement has its own seed.

const CLEAR = 8; // metres kept bare around the building
const TRIES = { creeper: 60, villager: 45, spider: 45, coin: 420, huge: 3 };
export const COIN50 = 50;
export const HUGE_WORTH = 100000;

const outsideBuilding = (x, z, pad = 0) =>
  x < BUILDING.x0 - pad || x > BUILDING.x1 + pad || z < BUILDING.z0 - pad || z > BUILDING.z1 + pad;

// 0..1: how thick things lie at (x, z). Zero in and right around the building.
export function density(x, z) {
  if (!outsideBuilding(x, z, CLEAR)) return 0;
  const n = fbm(x * 0.0035 + 40, z * 0.0035 - 70, 3);
  return THREE.MathUtils.smoothstep(n, 0.3, 0.72) ** 2 * 0.95 + 0.05;
}

// A model made of boxes: [w, h, d, x, y, z, color], y from the ground up to the box's base.
function blocks(list) {
  const parts = list.map(([w, h, d, x, y, z, c, ry = 0]) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    if (ry) g.rotateY(ry);
    g.translate(x, y + h / 2, z);
    const col = new THREE.Color(c);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.toArray(colors, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.deleteAttribute('uv');
    return g;
  });
  const geo = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  return geo;
}

// Front is +Z, like every prop here.
function creeperGeometry() {
  const greens = [0x5fae4a, 0x4c9a3c, 0x72c05a, 0x3f8a32];
  const list = [
    [0.9, 1.3, 0.5, 0, 0.6, 0, greens[0]],
    [1.0, 1.0, 1.0, 0, 1.9, 0, greens[2]],
    // Face: two eyes and the frown.
    [0.24, 0.24, 0.02, -0.2, 2.45, 0.51, 0x111111],
    [0.24, 0.24, 0.02, 0.2, 2.45, 0.51, 0x111111],
    [0.2, 0.36, 0.02, 0, 2.08, 0.51, 0x111111],
    [0.14, 0.24, 0.02, -0.14, 2.0, 0.51, 0x111111],
    [0.14, 0.24, 0.02, 0.14, 2.0, 0.51, 0x111111],
  ];
  for (const [x, z, k] of [[-0.25, 0.4, 1], [0.25, 0.4, 3], [-0.25, -0.4, 3], [0.25, -0.4, 1]]) {
    list.push([0.45, 0.6, 0.45, x, 0, z, greens[k]]);
  }
  return blocks(list);
}

function villagerGeometry() {
  return blocks([
    [0.36, 1.0, 0.4, -0.2, 0, 0, 0x34418f],
    [0.36, 1.0, 0.4, 0.2, 0, 0, 0x34418f],
    [0.8, 1.05, 0.42, 0, 1.0, 0, 0x2aa8b0],
    [0.3, 1.0, 0.36, -0.56, 1.05, 0, 0x2aa8b0],
    [0.3, 1.0, 0.36, 0.56, 1.05, 0, 0x2aa8b0],
    [0.8, 0.8, 0.8, 0, 2.05, 0, 0xc89a72],
    [0.84, 0.22, 0.84, 0, 2.7, 0, 0x4a2e1a],
    [0.84, 0.3, 0.2, 0, 2.55, -0.33, 0x4a2e1a],
    [0.14, 0.1, 0.02, -0.18, 2.42, 0.41, 0xffffff],
    [0.14, 0.1, 0.02, 0.18, 2.42, 0.41, 0xffffff],
    [0.07, 0.1, 0.03, -0.15, 2.42, 0.42, 0x3a4ab0],
    [0.07, 0.1, 0.03, 0.21, 2.42, 0.42, 0x3a4ab0],
    [0.3, 0.06, 0.02, 0, 2.2, 0.41, 0x7a4a34],
  ]);
}

function spiderGeometry() {
  const list = [
    [1.3, 0.8, 1.5, 0, 0.45, -0.75, 0x1c1a1a],
    [0.75, 0.6, 0.6, 0, 0.5, 0.25, 0x2a2626],
    [0.85, 0.7, 0.7, 0, 0.45, 0.85, 0x1c1a1a],
    [0.16, 0.12, 0.02, -0.22, 0.85, 1.21, 0xff2a20],
    [0.16, 0.12, 0.02, 0.22, 0.85, 1.21, 0xff2a20],
    [0.12, 0.1, 0.02, -0.12, 0.66, 1.21, 0xff2a20],
    [0.12, 0.1, 0.02, 0.12, 0.66, 1.21, 0xff2a20],
  ];
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const z = 0.55 - k * 0.3;
      const fan = (k - 1.5) * 0.35 * side;
      list.push([1.5, 0.16, 0.16, side * 0.95, 0.85, z, 0x141212, fan]);
      list.push([0.16, 0.95, 0.16, side * 1.65, 0, z + Math.sin(-fan) * 0.7, 0x141212]);
    }
  }
  return blocks(list);
}

function coinTexture(text, size) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2c23a';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#a8761a';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(128, 128, 112, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#7a4e0c';
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 136);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A standing coin: the cylinder's caps face ±Z, the label upright on both.
function coinGeometry(r, thick) {
  const g = new THREE.CylinderGeometry(r, r, thick, 32);
  g.rotateX(Math.PI / 2);
  g.translate(0, r, 0);
  return g;
}

const mobMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xd9a52a, metalness: 0.6, roughness: 0.35, emissive: 0x5a3a08 });
const label = (text, size) => new THREE.MeshStandardMaterial({ map: coinTexture(text, size), metalness: 0.3, roughness: 0.45 });
const KINDS = {
  creeper: { geo: creeperGeometry(), mat: mobMat, r: 0.7, h: 2.9, scale: [1, 1.4] },
  villager: { geo: villagerGeometry(), mat: mobMat, r: 0.7, h: 2.9, scale: [1, 1.25] },
  spider: { geo: spiderGeometry(), mat: mobMat, r: 1.4, h: 1.4, scale: [1, 1.3] },
  coin: { geo: coinGeometry(1.1, 0.22), mat: [rimMat, label('50', 150), label('50', 150)], r: 1.1, h: 2.2, scale: [1, 1] },
  huge: { geo: coinGeometry(9, 1.2), mat: [rimMat, label('10萬', 92), label('10萬', 92)], r: 4, h: 18, scale: [1, 1] },
};

// Adds what stands outside the building in this chunk to its props.
export function addOutside(props, cx, cz, size, heightAt) {
  if (!outsideBuilding(cx * size + size, cz * size + size, CLEAR) && !outsideBuilding(cx * size, cz * size, CLEAR)
    && !outsideBuilding(cx * size + size, cz * size, CLEAR) && !outsideBuilding(cx * size, cz * size + size, CLEAR)) return;
  const rng = mulberry32(hashSeed(cx + 31000, cz - 31000));
  for (const [name, tries] of Object.entries(TRIES)) {
    const kind = KINDS[name];
    const batch = new Batch(kind.geo, kind.mat, { shadow: name !== 'coin' });
    const recs = [];
    for (let i = 0; i < tries; i++) {
      const x = (cx + rng()) * size;
      const z = (cz + rng()) * size;
      const yaw = rng() * Math.PI * 2;
      const s = kind.scale[0] + rng() * (kind.scale[1] - kind.scale[0]);
      if (rng() > density(x, z) || !outsideBuilding(x, z, CLEAR + kind.r * s)) continue;
      const y = heightAt(x, z);
      batch.add(x, y, z, s, s, s, yaw);
      const r = kind.r * s;
      const top = y + kind.h * s;
      const rec = {
        id: props.breakables.length, index: recs.length, x, z, baseY: y, h: kind.h * s, w: r, colliders: [],
        mob: name === 'coin' || name === 'huge' ? null : name,
        coin: name === 'coin' ? COIN50 : name === 'huge' ? HUGE_WORTH : 0,
      };
      const c = { x, z, r, top, breakable: rec };
      rec.colliders.push(c);
      props.colliders.push(c);
      props.breakables.push(rec);
      recs.push(rec);
    }
    const mesh = batch.build(props.group);
    for (const rec of recs) rec.mesh = mesh;
  }
}
