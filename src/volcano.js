import * as THREE from 'three';
import { mulberry32, hashSeed } from './noise.js';
import { rockGeo, groundMin, LANDMARK_X, LANDMARK_Z, LANDMARK_CLEAR } from './props.js';
import { Batch, trunkGeo } from './jungle.js';
import { lavaAt, VOLCANO } from './lava.js';

// Volcano props: hexagonal basalt column stands, ember-lit rocks, charred dead trees,
// and a lava pool ringed with basalt ahead of the start. Nothing grows in the lava.

const columnGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
columnGeo.translate(0, 0.5, 0);
const poolGeo = new THREE.CircleGeometry(1, 40);
poolGeo.rotateX(-Math.PI / 2);

const srgb = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

const basalt = new THREE.MeshStandardMaterial({ color: srgb(0.16, 0.15, 0.15), roughness: 0.85, flatShading: true });
const emberRock = new THREE.MeshStandardMaterial({
  color: srgb(0.14, 0.11, 0.1),
  emissive: srgb(0.9, 0.22, 0.04),
  emissiveIntensity: 0.12,
  roughness: 0.7,
  flatShading: true,
});
const charred = new THREE.MeshStandardMaterial({ color: srgb(0.06, 0.05, 0.05), roughness: 1, flatShading: true });
export const lavaPool = new THREE.MeshStandardMaterial({
  color: srgb(0.5, 0.12, 0.02),
  emissive: srgb(1.0, 0.36, 0.06),
  emissiveIntensity: 2.6,
  roughness: 0.6,
});

const SPAWN_CLEAR = 60;

function clearOfSpawn(x, z, pad) {
  if (Math.hypot(x, z) < SPAWN_CLEAR + pad) return false;
  return (x - LANDMARK_X) ** 2 + (z - LANDMARK_Z) ** 2 > (LANDMARK_CLEAR + pad) ** 2;
}

function onVolcano(x, z) {
  return Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < VOLCANO.radius * 0.7;
}

// Hex columns packed on a hex grid, tallest in the middle, tops stepped.
function columns(b, colliders, rng, x, z, heightAt) {
  const r = 1.1 + rng() * 0.6;
  const rings = 2 + Math.floor(rng() * 2);
  const peak = 6 + rng() * 10;
  const gy = groundMin(heightAt, x, z, r * rings * 2) - 0.5;
  for (let q = -rings; q <= rings; q++) {
    for (let s = -rings; s <= rings; s++) {
      if (Math.abs(q + s) > rings || rng() < 0.12) continue;
      const px = x + (q + s / 2) * r * 1.75;
      const pz = z + s * r * 1.52;
      const ring = Math.max(Math.abs(q), Math.abs(s), Math.abs(q + s));
      const h = peak * (1 - ring / (rings + 1.5)) * (0.75 + rng() * 0.35);
      b.column.add(px, gy, pz, r, h, r, 0);
    }
  }
  colliders.push({ x, z, r: r * rings * 1.8, top: gy + peak });
}

function emberStone(b, colliders, rng, x, z, heightAt) {
  const s = 1 + rng() * 2.5;
  const gy = heightAt(x, z) - s * 0.3;
  b.ember.add(x, gy, z, s * (1 + rng() * 0.5), s * 0.8, s * (1 + rng() * 0.5), rng() * 6, rng() * 0.4, rng() * 0.4);
  colliders.push({ x, z, r: s * 1.25, top: gy + s * 0.8 });
}

function deadTree(b, colliders, rng, x, z, heightAt) {
  const h = 5 + rng() * 6;
  const r = 0.2 + rng() * 0.15;
  const gy = heightAt(x, z) - 0.3;
  b.dead.add(x, gy, z, r, h, r, rng() * 6, (rng() - 0.5) * 0.15, 0);
  const arms = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < arms; i++) {
    const a = rng() * Math.PI * 2;
    b.dead.add(x, gy + h * (0.45 + rng() * 0.4), z, r * 0.5, h * (0.3 + rng() * 0.25), r * 0.5, a, 0.6 + rng() * 0.5, 0);
  }
  colliders.push({ x, z, r: r + 0.3, top: gy + h });
}

// A lava pool you can hover across, walled by basalt on most of its rim.
function lavaPoolLandmark(group, colliders, rng, x, z, heightAt) {
  const R = 22;
  let top = -Infinity;
  for (let a = 0; a < 12; a++) {
    const t = (a / 12) * Math.PI * 2;
    top = Math.max(top, heightAt(x + Math.cos(t) * R * 0.7, z + Math.sin(t) * R * 0.7));
  }
  const pool = new THREE.Mesh(poolGeo, lavaPool);
  pool.position.set(x, top + 0.25, z);
  pool.scale.setScalar(R);
  pool.receiveShadow = true;
  group.add(pool);
  const b = { column: new Batch(columnGeo, basalt) };
  const gap = rng() * Math.PI * 2; // an opening to ride in through
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const off = Math.abs(((a - gap + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (off > Math.PI - 0.45) continue;
    const px = x + Math.cos(a) * (R + 1.5);
    const pz = z + Math.sin(a) * (R + 1.5);
    const h = 3 + rng() * 7;
    const gy = heightAt(px, pz) - 1;
    b.column.add(px, gy, pz, 1.6 + rng() * 0.6, Math.max(h, top + 2 - gy), 1.6, rng());
    colliders.push({ x: px, z: pz, r: 1.8, top: gy + h });
  }
  b.column.build(group);
  return { x, y: top + 0.3, z, r: R };
}

export function buildVolcanoProps(cx, cz, size, heightAt) {
  const group = new THREE.Group();
  const colliders = [];
  const slopes = [];
  const rng = mulberry32(hashSeed(cx + 11000, cz - 11000));
  const b = {
    column: new Batch(columnGeo, basalt),
    ember: new Batch(rockGeo, emberRock),
    dead: new Batch(trunkGeo, charred),
  };
  const x0 = cx * size;
  const z0 = cz * size;
  let vent = null;

  if (cx === 0 && cz === 0) {
    vent = lavaPoolLandmark(group, colliders, mulberry32(hashSeed(13, 3)), LANDMARK_X, LANDMARK_Z, heightAt);
  }

  const dry = (x, z) => lavaAt(x, z) < 0.05;
  const stands = rng() < 0.5 ? 1 + Math.floor(rng() * 2) : 0;
  for (let i = 0; i < stands; i++) {
    const x = x0 + 25 + rng() * (size - 50);
    const z = z0 + 25 + rng() * (size - 50);
    if (!clearOfSpawn(x, z, 12) || !dry(x, z) || onVolcano(x, z)) continue;
    columns(b, colliders, rng, x, z, heightAt);
  }
  const stones = 3 + Math.floor(rng() * 6);
  for (let i = 0; i < stones; i++) {
    const x = x0 + rng() * size;
    const z = z0 + rng() * size;
    if (!clearOfSpawn(x, z, 4) || !dry(x, z)) continue;
    emberStone(b, colliders, rng, x, z, heightAt);
  }
  const trees = Math.floor(rng() * 7);
  for (let i = 0; i < trees; i++) {
    const x = x0 + rng() * size;
    const z = z0 + rng() * size;
    if (!clearOfSpawn(x, z, 4) || !dry(x, z) || onVolcano(x, z)) continue;
    deadTree(b, colliders, rng, x, z, heightAt);
  }

  for (const batch of Object.values(b)) batch.build(group);
  return { group, colliders, slopes, vent };
}
