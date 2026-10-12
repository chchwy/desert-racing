import * as THREE from 'three';
import { mulberry32, hashSeed } from './noise.js';
import { rockGeo, groundMin, LANDMARK_X, LANDMARK_Z, LANDMARK_CLEAR } from './props.js';
import { Batch, trunkGeo, canopyGeo } from './jungle.js';

// Prairie props: lone flat-topped acacias, rock outcrops, and one giant tree ahead of
// the start. The tall grass itself is grass.js, streamed around the bike, not per chunk.

const srgb = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

const bark = new THREE.MeshStandardMaterial({ color: srgb(0.33, 0.26, 0.19), roughness: 0.95, flatShading: true });
const leaves = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true });
const granite = new THREE.MeshStandardMaterial({ color: srgb(0.58, 0.54, 0.48), roughness: 1, flatShading: true });

const LEAF_TONES = [srgb(0.3, 0.42, 0.14), srgb(0.36, 0.46, 0.16), srgb(0.26, 0.38, 0.13)];

const SPAWN_CLEAR = 60;

function clearOfSpawn(x, z, pad) {
  if (Math.hypot(x, z) < SPAWN_CLEAR + pad) return false;
  return (x - LANDMARK_X) ** 2 + (z - LANDMARK_Z) ** 2 > (LANDMARK_CLEAR + pad) ** 2;
}

// A forked trunk under a wide, flat crown.
function acacia(b, colliders, rng, x, z, heightAt, scale = 1) {
  const h = (7 + rng() * 5) * scale;
  const r = (0.35 + rng() * 0.2) * scale;
  const gy = groundMin(heightAt, x, z, r * 2) - 0.4;
  const fork = h * (0.35 + rng() * 0.15);
  b.trunk.add(x, gy, z, r, fork + 0.5, r, rng() * 6);
  const arms = 2 + Math.floor(rng() * 2);
  const crownR = (5 + rng() * 3) * scale;
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 + rng() * 0.8;
    const tilt = 0.45 + rng() * 0.25;
    const len = (h - fork) / Math.cos(tilt);
    b.trunk.add(x, gy + fork, z, r * 0.7, len, r * 0.7, a, tilt, 0);
    // rotation 'YXZ' (a, tilt): the arm tips toward (sin a, cos a).
    const tx = x + Math.sin(a) * Math.sin(tilt) * len;
    const tz = z + Math.cos(a) * Math.sin(tilt) * len;
    const ty = gy + fork + Math.cos(tilt) * len;
    const s = crownR * (0.6 + rng() * 0.25);
    const tone = LEAF_TONES[Math.floor(rng() * LEAF_TONES.length)];
    b.canopy.add(tx, ty + 0.3, tz, s, s * 0.22, s, rng() * 6, 0, 0, tone);
  }
  const tone = LEAF_TONES[Math.floor(rng() * LEAF_TONES.length)];
  b.canopy.add(x, gy + h + 0.6, z, crownR, crownR * 0.2, crownR, rng() * 6, 0, 0, tone);
  colliders.push({ x, z, r: r + 0.3, top: gy + fork });
}

// A kopje: granite boulders heaped on the plain.
function outcrop(b, colliders, rng, x, z, heightAt) {
  const n = 3 + Math.floor(rng() * 5);
  for (let i = 0; i < n; i++) {
    const px = x + (rng() - 0.5) * 22;
    const pz = z + (rng() - 0.5) * 22;
    const s = 2 + rng() * 4.5;
    const gy = heightAt(px, pz) - s * 0.3;
    b.rock.add(px, gy, pz, s * (1 + rng() * 0.5), s * (0.7 + rng() * 0.4), s * (1 + rng() * 0.5), rng() * 6, rng() * 0.3, rng() * 0.3);
    colliders.push({ x: px, z: pz, r: s * 1.25, top: gy + s });
  }
}

export function buildGrasslandProps(cx, cz, size, heightAt) {
  const group = new THREE.Group();
  const colliders = [];
  const slopes = [];
  const rng = mulberry32(hashSeed(cx + 5000, cz - 5000));
  const b = {
    trunk: new Batch(trunkGeo, bark),
    canopy: new Batch(canopyGeo, leaves, { colors: true }),
    rock: new Batch(rockGeo, granite),
  };
  const x0 = cx * size;
  const z0 = cz * size;

  // The landmark: one giant acacia straight ahead of the start, with a fat base collider.
  if (cx === 0 && cz === 0) {
    acacia(b, colliders, mulberry32(hashSeed(31, 7)), LANDMARK_X, LANDMARK_Z, heightAt, 3.2);
    colliders[colliders.length - 1].r += 1.5;
  }

  // Acacias stand alone or in loose groups of two or three.
  const groups = Math.floor(rng() * 4);
  for (let i = 0; i < groups; i++) {
    const gx = x0 + 15 + rng() * (size - 30);
    const gz = z0 + 15 + rng() * (size - 30);
    const n = rng() < 0.6 ? 1 : 2 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) {
      const x = gx + (rng() - 0.5) * 30;
      const z = gz + (rng() - 0.5) * 30;
      if (!clearOfSpawn(x, z, 6)) continue;
      acacia(b, colliders, rng, x, z, heightAt);
    }
  }

  if (rng() < 0.25) {
    const x = x0 + 25 + rng() * (size - 50);
    const z = z0 + 25 + rng() * (size - 50);
    if (clearOfSpawn(x, z, 20)) outcrop(b, colliders, rng, x, z, heightAt);
  }

  for (const batch of Object.values(b)) batch.build(group);
  return { group, colliders, slopes };
}
