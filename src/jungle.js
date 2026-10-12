import * as THREE from 'three';
import { mulberry32, hashSeed } from './noise.js';
import {
  boxGeo, rockGeo, addMesh, groundMin, describePyramid,
  LANDMARK_X, LANDMARK_Z, LANDMARK_CLEAR,
} from './props.js';

// Rainforest props. Trees, ferns and boulders are InstancedMesh per chunk, so a chunk
// of forest is a handful of draw calls. Trunks and boulders get colliders; ferns do not.

export const trunkGeo = new THREE.CylinderGeometry(0.62, 1, 1, 8, 1);
trunkGeo.translate(0, 0.5, 0); // base at the origin
export const canopyGeo = new THREE.IcosahedronGeometry(1, 1);
// A palm frond: a flat blade from the crown outward along +z.
const frondGeo = new THREE.ConeGeometry(1, 1, 4, 1);
frondGeo.rotateX(Math.PI / 2);
frondGeo.scale(1, 0.12, 1);
frondGeo.translate(0, 0, 0.5);

const srgb = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

const bark = new THREE.MeshStandardMaterial({ color: srgb(0.36, 0.28, 0.2), roughness: 0.95, flatShading: true });
const leaves = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true });
const mossRock = new THREE.MeshStandardMaterial({ color: srgb(0.42, 0.46, 0.34), roughness: 1, flatShading: true });
const templeStone = new THREE.MeshStandardMaterial({ color: srgb(0.56, 0.57, 0.48), roughness: 0.95, flatShading: true });
const templeMoss = new THREE.MeshStandardMaterial({ color: srgb(0.38, 0.45, 0.28), roughness: 1, flatShading: true });

const LEAF_TONES = [srgb(0.18, 0.36, 0.12), srgb(0.24, 0.44, 0.14), srgb(0.3, 0.5, 0.17), srgb(0.14, 0.3, 0.13)];
const FERN_TONES = [srgb(0.26, 0.46, 0.15), srgb(0.34, 0.52, 0.18), srgb(0.2, 0.38, 0.12)];

const SPAWN_CLEAR = 60;

// Collects transforms, then becomes one InstancedMesh.
export class Batch {
  constructor(geo, mat, { shadow = true, colors = false } = {}) {
    this.geo = geo;
    this.mat = mat;
    this.shadow = shadow;
    this.colors = colors;
    this.matrices = [];
    this.tints = [];
  }
  add(x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0, tint = null) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      // Yaw first, then pitch and roll in that turned frame (a frond droops along its own +z).
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
      new THREE.Vector3(sx, sy, sz),
    );
    this.matrices.push(m);
    this.tints.push(tint);
  }
  build(group) {
    if (!this.matrices.length) return;
    const mesh = new THREE.InstancedMesh(this.geo, this.mat, this.matrices.length);
    this.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    if (this.colors) this.tints.forEach((c, i) => mesh.setColorAt(i, c));
    mesh.castShadow = this.shadow;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
}

function clearOfSpawn(x, z, pad) {
  if (Math.hypot(x, z) < SPAWN_CLEAR + pad) return false;
  return (x - LANDMARK_X) ** 2 + (z - LANDMARK_Z) ** 2 > (LANDMARK_CLEAR + pad) ** 2;
}

function tree(b, colliders, rng, x, z, heightAt, giant) {
  const h = giant ? 34 + rng() * 14 : 14 + rng() * 12;
  const r = giant ? 1.6 + rng() * 0.6 : 0.45 + rng() * 0.35;
  const gy = groundMin(heightAt, x, z, r * 2) - 0.6;
  const lean = (rng() - 0.5) * 0.08;
  b.trunk.add(x, gy, z, r, h, r, rng() * 6, lean, lean);
  if (giant) {
    // Buttress roots flare out around the base.
    const n = 4 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng() * 0.5;
      const d = r * 1.3;
      b.trunk.add(x + Math.cos(a) * d, gy, z + Math.sin(a) * d, r * 0.8, 4 + rng() * 3, r * 0.35, -a, 0, 0);
    }
  }
  // Canopy: rounded blobs in tiers around and below the crown.
  const crownR = giant ? 9 + rng() * 5 : 4.5 + rng() * 3;
  const blobs = giant ? 8 : 5;
  const top = gy + h;
  for (let i = 0; i < blobs; i++) {
    const a = rng() * Math.PI * 2;
    const tier = i / blobs;
    const d = i === 0 ? 0 : crownR * (0.35 + rng() * 0.45);
    const s = crownR * (i === 0 ? 0.95 : 0.55 + rng() * 0.3);
    const tone = LEAF_TONES[Math.floor(rng() * LEAF_TONES.length)];
    const y = top - tier * crownR * 0.9 + (rng() - 0.5) * 1.5;
    b.canopy.add(x + Math.cos(a) * d, y, z + Math.sin(a) * d, s, s * 0.78, s, rng() * 6, 0, 0, tone);
  }
  colliders.push({ x, z, r: giant ? r * 2.2 : r + 0.25, top: top - crownR * 0.3 });
}

// Understorey palm: a thin leaning trunk and a crown of drooping fronds.
function palm(b, colliders, rng, x, z, heightAt) {
  const h = 5 + rng() * 7;
  const r = 0.22 + rng() * 0.1;
  const gy = heightAt(x, z) - 0.3;
  const la = rng() * Math.PI * 2;
  const lean = 0.08 + rng() * 0.18;
  b.trunk.add(x, gy, z, r, h, r, la, lean, 0);
  // rotation 'YXZ' (la, lean): the trunk's local +y tips toward (sin la, cos la).
  const tx = x + Math.sin(la) * Math.sin(lean) * h;
  const tz = z + Math.cos(la) * Math.sin(lean) * h;
  const ty = gy + Math.cos(lean) * h;
  const n = 7 + Math.floor(rng() * 4);
  const len = 3.2 + rng() * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.4;
    const tone = FERN_TONES[Math.floor(rng() * FERN_TONES.length)];
    b.frond.add(tx, ty, tz, 0.55, 1, len, a, 0.25 + rng() * 0.45, 0, tone);
  }
  colliders.push({ x, z, r: r + 0.2, top: ty });
}

function fern(b, rng, x, z, heightAt) {
  const y = heightAt(x, z);
  const n = 4 + Math.floor(rng() * 3);
  const len = 0.9 + rng() * 1.1;
  const tone = FERN_TONES[Math.floor(rng() * FERN_TONES.length)];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.5;
    b.fern.add(x, y + 0.05, z, 0.35, 1, len, a, -0.5 - rng() * 0.4, 0, tone);
  }
}

function boulder(b, colliders, rng, x, z, heightAt) {
  const s = 1.2 + rng() * 3;
  const gy = heightAt(x, z) - s * 0.35;
  b.rock.add(x, gy, z, s * (1 + rng() * 0.6), s * 0.8, s * (1 + rng() * 0.6), rng() * 6, rng() * 0.4, rng() * 0.4);
  colliders.push({ x, z, r: s * 1.3, top: gy + s * 0.8 });
}

// Stepped temple on the pyramid slope record, so the bike drives up it like the desert
// pyramids. Each terrace's outer edge sits half a step above the L∞ taper, the stairway
// on the face toward local +z lies on the taper, and the shrine on top is a collider.
function steppedTemple(group, slopes, colliders, x, z, side, height, yaw, heightAt) {
  const p = describePyramid(x, z, side, height, yaw, heightAt);
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  addMesh(g, boxGeo, templeMoss, 0, p.baseY + p.plinthH / 2, 0, p.plinthSide, p.plinthH, p.plinthSide);

  const H = p.apexY - p.coneBase;
  const steps = Math.max(6, Math.round(H / 3));
  const flatTop = 0.22; // fraction of the half-side left flat on top for the shrine
  const shrineY = p.coneBase + H * (1 - flatTop);
  const bottom = p.coneBase - 0.5;
  const terrace = (half, topY, mat) =>
    addMesh(g, boxGeo, mat, 0, (topY + bottom) / 2, 0, half * 2, topY - bottom, half * 2);
  for (let k = 0; k < steps; k++) {
    const t = (k + 1) / steps;
    if (t > 1 - flatTop) break;
    terrace(p.half * (1 - (k + 0.5) / steps), p.coneBase + H * t, k % 3 === 2 ? templeMoss : templeStone);
  }
  terrace(p.half * (flatTop + 0.5 / steps), shrineY, templeStone);

  // Stairway down the +z face, from the flat top to the plinth, on the taper the bike rides.
  const slope = Math.atan2(H, p.half);
  const rise = H * (1 - flatTop);
  const stair = addMesh(g, boxGeo, templeStone, 0, 0, 0, side * 0.22, 0.8, Math.hypot(rise, p.half * (1 - flatTop)));
  stair.rotation.set(slope, 0, 0);
  stair.position.set(0, p.coneBase + rise / 2 - 0.4 / Math.cos(slope), (p.half * (1 + flatTop)) / 2);

  // Shrine on the flat top.
  const shrineHalf = p.half * flatTop * 0.6;
  const shrineH = 6 + H * 0.12;
  addMesh(g, boxGeo, templeStone, 0, shrineY + shrineH / 2, 0, shrineHalf * 2, shrineH, shrineHalf * 1.6);
  addMesh(g, boxGeo, templeMoss, 0, shrineY + shrineH + 0.8, 0, shrineHalf * 2.3, 1.6, shrineHalf * 1.9);
  addMesh(g, boxGeo, templeMoss, 0, shrineY + 2, shrineHalf * 0.8 + 0.05, shrineHalf * 0.6, 4, 0.2); // doorway
  group.add(g);

  // The taper is the floor. Cap it at the shrine terrace so the bike rides the flat top.
  slopes.push({ ...p, flatY: shrineY });
  colliders.push({ x, z, r: shrineHalf * 1.15, top: shrineY + shrineH + 1.6 });
}

export function buildJungleProps(cx, cz, size, heightAt) {
  const group = new THREE.Group();
  const colliders = [];
  const slopes = [];
  const rng = mulberry32(hashSeed(cx + 3000, cz - 3000));
  const b = {
    trunk: new Batch(trunkGeo, bark),
    canopy: new Batch(canopyGeo, leaves, { colors: true }),
    frond: new Batch(frondGeo, leaves, { colors: true }),
    fern: new Batch(frondGeo, leaves, { shadow: false, colors: true }),
    rock: new Batch(rockGeo, mossRock),
  };
  const x0 = cx * size;
  const z0 = cz * size;

  if (cx === 0 && cz === 0) {
    const r = mulberry32(hashSeed(23, 41));
    const h = 34 + r() * 8;
    steppedTemple(group, slopes, colliders, LANDMARK_X, LANDMARK_Z, h * 1.7, h, Math.atan2(-LANDMARK_X, -LANDMARK_Z), heightAt);
  } else if (rng() < 0.07) {
    const x = x0 + 50 + rng() * (size - 100);
    const z = z0 + 50 + rng() * (size - 100);
    const dx = x - LANDMARK_X;
    const dz = z - LANDMARK_Z;
    if (Math.hypot(x, z) > 280 && dx * dx + dz * dz > 320 * 320) {
      const h = 20 + rng() * 14;
      steppedTemple(group, slopes, colliders, x, z, h * 1.7, h, rng() * Math.PI * 2, heightAt);
    }
  }
  const nearTemple = (x, z, pad) => slopes.some((s) => Math.abs(x - s.x) < s.plinthHalf * 1.5 + pad && Math.abs(z - s.z) < s.plinthHalf * 1.5 + pad);

  // Trees on a jittered grid, thinned by a clearing noise so the forest has glades to ride.
  const cell = 19;
  for (let gz = 0; gz < size / cell; gz++) {
    for (let gx = 0; gx < size / cell; gx++) {
      const x = x0 + (gx + 0.15 + rng() * 0.7) * cell;
      const z = z0 + (gz + 0.15 + rng() * 0.7) * cell;
      const roll = rng();
      const giant = rng() < 0.07;
      if (roll < 0.2) continue;
      if (!clearOfSpawn(x, z, giant ? 12 : 4) || nearTemple(x, z, 10)) continue;
      if (roll < 0.45) palm(b, colliders, rng, x, z, heightAt);
      else tree(b, colliders, rng, x, z, heightAt, giant);
    }
  }

  for (let i = 0; i < 220; i++) {
    const x = x0 + rng() * size;
    const z = z0 + rng() * size;
    if (nearTemple(x, z, 0)) continue;
    fern(b, rng, x, z, heightAt);
  }

  const boulders = rng() < 0.6 ? 2 + Math.floor(rng() * 4) : 0;
  for (let i = 0; i < boulders; i++) {
    const x = x0 + 10 + rng() * (size - 20);
    const z = z0 + 10 + rng() * (size - 20);
    if (!clearOfSpawn(x, z, 6) || nearTemple(x, z, 6)) continue;
    boulder(b, colliders, rng, x, z, heightAt);
  }

  for (const batch of Object.values(b)) batch.build(group);
  return { group, colliders, slopes };
}
