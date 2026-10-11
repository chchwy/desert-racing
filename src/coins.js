import * as THREE from 'three';
import { mulberry32, hashSeed } from './noise.js';

const COUNT = 8;
const SPACING = 18;
const SPAWN_CLEAR = 32;
const PICKUP_R = 3.3;
const Y_REACH = 2.2;

const coinGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.12, 24);
coinGeo.rotateX(Math.PI / 2);

const gold = new THREE.MeshStandardMaterial({
  color: new THREE.Color().setRGB(0.95, 0.72, 0.22, THREE.SRGBColorSpace),
  metalness: 0.72,
  roughness: 0.32,
  emissive: new THREE.Color().setRGB(0.55, 0.28, 0.04, THREE.SRGBColorSpace),
  emissiveIntensity: 0.65,
});

const collected = new Set();
let count = 0;

export function coinCount() {
  return count;
}

function blocked(colliders, x, z, y) {
  for (const c of colliders) {
    if (y > c.top) continue;
    const dx = x - c.x;
    const dz = z - c.z;
    if (dx * dx + dz * dz < c.r * c.r) return true;
  }
  return false;
}

function segmentHits(x0, z0, x1, z1, cx, cz, r) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  let t = 0;
  if (len2 > 1e-8) {
    t = THREE.MathUtils.clamp(((cx - x0) * dx + (cz - z0) * dz) / len2, 0, 1);
  }
  const px = x0 + dx * t - cx;
  const pz = z0 + dz * t - cz;
  return px * px + pz * pz <= r * r;
}

// Own seed, so coin slots do not shift the ruin placement in props.js.
export function buildChunkCoins(cx, cz, size, heightAt, colliders) {
  const group = new THREE.Group();
  const list = [];
  const rng = mulberry32(hashSeed(cx + 7919, cz + 104729));
  const placed = [];

  for (let i = 0; i < COUNT; i++) {
    const x = cx * size + 14 + rng() * (size - 28);
    const z = cz * size + 14 + rng() * (size - 28);
    const phase = rng() * Math.PI * 2;
    const id = cx + ',' + cz + ':' + i;
    const y = heightAt(x, z) + 1.45;
    if (collected.has(id)) continue;
    if (Math.hypot(x, z) < SPAWN_CLEAR) continue;
    if (placed.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < SPACING * SPACING)) continue;
    if (blocked(colliders, x, z, y)) continue;

    const mesh = new THREE.Mesh(coinGeo, gold);
    mesh.position.set(x, y, z);
    mesh.rotation.y = phase;
    group.add(mesh);
    placed.push({ x, z });
    list.push({ id, mesh, x, z, baseY: y, phase, taken: false });
  }

  return { group, list };
}

export function updateChunkCoins(list, time) {
  for (const coin of list) {
    if (coin.taken) continue;
    coin.mesh.rotation.y = time * 2.4 + coin.phase;
    coin.mesh.position.y = coin.baseY + Math.sin(time * 2.1 + coin.phase) * 0.22;
  }
}

// Sweep the frame's path so a fast bike cannot skip through a coin.
export function collectChunkCoins(list, prev, pos) {
  const yMin = Math.min(prev.y, pos.y) - Y_REACH;
  const yMax = Math.max(prev.y, pos.y) + Y_REACH;
  let gained = 0;
  for (const coin of list) {
    if (coin.taken) continue;
    if (coin.baseY < yMin || coin.baseY > yMax) continue;
    if (!segmentHits(prev.x, prev.z, pos.x, pos.z, coin.x, coin.z, PICKUP_R)) continue;
    coin.taken = true;
    collected.add(coin.id);
    coin.mesh.visible = false;
    gained++;
  }
  count += gained;
  return gained;
}
