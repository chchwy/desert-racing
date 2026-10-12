import * as THREE from 'three';
import { fbm, mulberry32, hashSeed } from './noise.js';
import { rockGeo, groundMin, LANDMARK_X, LANDMARK_Z, LANDMARK_CLEAR } from './props.js';
import { Batch, trunkGeo } from './jungle.js';

// Snow-mountain props: snowy pine stands below the tree line, snow-capped boulders,
// and a glowing ice-crystal cluster ahead of the start.

const tierGeo = new THREE.ConeGeometry(1, 1, 8, 1);
tierGeo.translate(0, 0.5, 0); // base at the origin
const crystalGeo = new THREE.OctahedronGeometry(1, 0);

const srgb = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

const bark = new THREE.MeshStandardMaterial({ color: srgb(0.3, 0.24, 0.2), roughness: 0.95, flatShading: true });
const needles = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
const snowCap = new THREE.MeshStandardMaterial({ color: srgb(0.93, 0.95, 1.0), roughness: 0.75, flatShading: true });
const rock = new THREE.MeshStandardMaterial({ color: srgb(0.42, 0.42, 0.46), roughness: 1, flatShading: true });
const ice = new THREE.MeshStandardMaterial({
  color: srgb(0.62, 0.84, 1.0),
  emissive: srgb(0.25, 0.6, 1.0),
  emissiveIntensity: 0.55,
  roughness: 0.15,
  metalness: 0.1,
  transparent: true,
  opacity: 0.88,
  flatShading: true,
});

const NEEDLE_TONES = [srgb(0.12, 0.24, 0.18), srgb(0.15, 0.28, 0.2), srgb(0.1, 0.2, 0.16)];

const SPAWN_CLEAR = 60;
const TREE_LINE = 150; // metres above which pines give way to bare snow and rock

function clearOfSpawn(x, z, pad) {
  if (Math.hypot(x, z) < SPAWN_CLEAR + pad) return false;
  return (x - LANDMARK_X) ** 2 + (z - LANDMARK_Z) ** 2 > (LANDMARK_CLEAR + pad) ** 2;
}

// Stacked cone tiers, each with a white cap on its upper half.
function pine(b, colliders, rng, x, z, y) {
  const h = 8 + rng() * 10;
  const r = h * (0.26 + rng() * 0.06);
  const trunkR = 0.25 + h * 0.012;
  const gy = y - 0.3;
  b.trunk.add(x, gy, z, trunkR, h * 0.3, trunkR, rng() * 6);
  const tiers = 3 + Math.floor(rng() * 2);
  const tone = NEEDLE_TONES[Math.floor(rng() * NEEDLE_TONES.length)];
  const ry = rng() * 6;
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers;
    const tr = r * (1 - f * 0.62);
    const th = h * (0.42 - f * 0.06);
    const ty = gy + h * (0.18 + f * 0.58);
    b.needles.add(x, ty, z, tr, th, tr, ry + i, 0, 0, tone);
    b.snow.add(x, ty + th * 0.42, z, tr * 0.72, th * 0.6, tr * 0.72, ry + i);
  }
  colliders.push({ x, z, r: trunkR + 0.35, top: gy + h });
}

function boulder(b, colliders, rng, x, z, heightAt) {
  const s = 1.5 + rng() * 3.5;
  const gy = heightAt(x, z) - s * 0.3;
  const sx = s * (1 + rng() * 0.5);
  const sz = s * (1 + rng() * 0.5);
  const ry = rng() * 6;
  b.rock.add(x, gy, z, sx, s * 0.8, sz, ry);
  b.rockSnow.add(x, gy + s * 0.55, z, sx * 0.85, s * 0.3, sz * 0.85, ry);
  colliders.push({ x, z, r: s * 1.25, top: gy + s * 0.8 });
}

// Ice crystals: tall octahedra leaning out from a common root. The bloom pass picks up
// their glow. Each spire gets a collider at its base, plus one fat one for the cluster.
function crystalCluster(group, colliders, rng, x, z, heightAt, scale) {
  const gy = groundMin(heightAt, x, z, 10 * scale) - 1;
  const n = 7 + Math.floor(rng() * 4);
  const m = new THREE.InstancedMesh(crystalGeo, ice, n);
  const mat = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const main = i === 0;
    const a = rng() * Math.PI * 2;
    const d = main ? 0 : (3 + rng() * 6) * scale;
    const h = (main ? 26 + rng() * 6 : 8 + rng() * 14) * scale;
    const w = h * (0.14 + rng() * 0.05);
    const tilt = main ? rng() * 0.08 : 0.15 + rng() * 0.35;
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, Math.PI / 2 - a, 0, 'YXZ'));
    mat.compose(new THREE.Vector3(px, gy + h * 0.45, pz), q, new THREE.Vector3(w, h * 0.55, w));
    m.setMatrixAt(i, mat);
    colliders.push({ x: px, z: pz, r: w + 0.6, top: gy + h * 0.9 });
  }
  m.castShadow = true;
  m.receiveShadow = true;
  m.computeBoundingSphere();
  group.add(m);
  colliders.push({ x, z, r: 4.5 * scale, top: gy + 24 * scale });
}

export function buildSnowProps(cx, cz, size, heightAt) {
  const group = new THREE.Group();
  const colliders = [];
  const slopes = [];
  const rng = mulberry32(hashSeed(cx + 9000, cz - 9000));
  const b = {
    trunk: new Batch(trunkGeo, bark),
    needles: new Batch(tierGeo, needles, { colors: true }),
    snow: new Batch(tierGeo, snowCap),
    rock: new Batch(rockGeo, rock),
    rockSnow: new Batch(rockGeo, snowCap),
  };
  const x0 = cx * size;
  const z0 = cz * size;

  if (cx === 0 && cz === 0) {
    crystalCluster(group, colliders, mulberry32(hashSeed(5, 77)), LANDMARK_X, LANDMARK_Z, heightAt, 1.3);
  } else if (rng() < 0.05) {
    const x = x0 + 40 + rng() * (size - 80);
    const z = z0 + 40 + rng() * (size - 80);
    if (Math.hypot(x, z) > 280) crystalCluster(group, colliders, rng, x, z, heightAt, 0.6 + rng() * 0.4);
  }

  // Pines grow in stands (a forest noise), thin out up the slope, and stop at the tree line.
  const cell = 16;
  for (let gz = 0; gz < size / cell; gz++) {
    for (let gx = 0; gx < size / cell; gx++) {
      const x = x0 + (gx + 0.1 + rng() * 0.8) * cell;
      const z = z0 + (gz + 0.1 + rng() * 0.8) * cell;
      const roll = rng();
      const y = heightAt(x, z);
      const stand = fbm(x * 0.006 + 4.4, z * 0.006 + 8.8, 2);
      const altitude = THREE.MathUtils.clamp(1 - (y - 40) / (TREE_LINE - 40), 0, 1);
      if (roll > (stand - 0.35) * 2.2 * altitude) continue;
      if (!clearOfSpawn(x, z, 4)) continue;
      pine(b, colliders, rng, x, z, y);
    }
  }

  const boulders = rng() < 0.7 ? 2 + Math.floor(rng() * 5) : 0;
  for (let i = 0; i < boulders; i++) {
    const x = x0 + 10 + rng() * (size - 20);
    const z = z0 + 10 + rng() * (size - 20);
    if (!clearOfSpawn(x, z, 6)) continue;
    boulder(b, colliders, rng, x, z, heightAt);
  }

  for (const batch of Object.values(b)) batch.build(group);
  return { group, colliders, slopes };
}
