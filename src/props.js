import * as THREE from 'three';
import { mulberry32, hashSeed } from './noise.js';

// Shared resources; chunk groups only hold meshes referencing these.
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1.08, 1, 10, 1);
const rockGeo = new THREE.DodecahedronGeometry(1, 0);
const coneGeo = new THREE.ConeGeometry(1, 1, 4, 1);

const stone = new THREE.MeshStandardMaterial({
  color: new THREE.Color().setRGB(0.8, 0.65, 0.48, THREE.SRGBColorSpace),
  roughness: 0.95,
  flatShading: true,
});
const stoneDark = new THREE.MeshStandardMaterial({
  color: new THREE.Color().setRGB(0.66, 0.5, 0.36, THREE.SRGBColorSpace),
  roughness: 1,
  flatShading: true,
});
const limestone = new THREE.MeshStandardMaterial({
  color: new THREE.Color().setRGB(0.84, 0.76, 0.62, THREE.SRGBColorSpace),
  roughness: 0.9,
  flatShading: true,
});
const limestoneDark = new THREE.MeshStandardMaterial({
  color: new THREE.Color().setRGB(0.7, 0.6, 0.46, THREE.SRGBColorSpace),
  roughness: 0.97,
  flatShading: true,
});
// rotation.y = yaw sends local +x to (cos yaw, 0, -sin yaw) and local +z to (sin yaw, 0, cos yaw).
// Meshes and pyramid colliders both go through this, so a face and its collider share one basis.
function yawOffset(yaw, lx, lz) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [lx * c + lz * s, -lx * s + lz * c];
}

function addMesh(group, geo, mat, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

function groundMin(heightAt, x, z, r) {
  let h = heightAt(x, z);
  for (let a = 0; a < 6; a++) {
    const t = (a / 6) * Math.PI * 2;
    h = Math.min(h, heightAt(x + Math.cos(t) * r, z + Math.sin(t) * r));
  }
  return h;
}

function pillars(group, colliders, rng, x, z, heightAt) {
  const n = 3 + Math.floor(rng() * 5);
  const dir = rng() * Math.PI;
  const spacing = 6 + rng() * 4;
  for (let i = 0; i < n; i++) {
    const px = x + Math.cos(dir) * spacing * (i - n / 2) + (rng() - 0.5) * 2;
    const pz = z + Math.sin(dir) * spacing * (i - n / 2) + (rng() - 0.5) * 2;
    const r = 0.9 + rng() * 0.5;
    const broken = rng() < 0.4;
    const hgt = broken ? 2 + rng() * 5 : 9 + rng() * 6;
    const gy = groundMin(heightAt, px, pz, r) - 1;
    const tilt = broken ? 0 : (rng() - 0.5) * 0.12;
    addMesh(group, cylGeo, stone, px, gy + hgt / 2, pz, r, hgt, r, rng() * 3, tilt, tilt);
    if (!broken) addMesh(group, boxGeo, stoneDark, px, gy + hgt + 0.4, pz, r * 2.6, 0.8, r * 2.6, dir);
    colliders.push({ x: px, z: pz, r: r + 0.3, top: gy + hgt + 0.8 });
  }
  // a fallen lintel lying on the sand
  if (rng() < 0.6) {
    const gy = heightAt(x, z);
    addMesh(group, boxGeo, stoneDark, x + 4, gy + 0.3, z + 6, 9, 1.4, 1.6, rng() * 3, 0, 0.15);
  }
}

function ruinBuilding(group, colliders, rng, x, z, heightAt) {
  const w = 18 + rng() * 22;
  const d = 10 + rng() * 10;
  const rot = rng() * Math.PI;
  const gy = groundMin(heightAt, x, z, Math.max(w, d) * 0.5) - 1.5;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const local = (lx, lz) => [x + lx * cos + lz * sin, z - lx * sin + lz * cos];

  const segs = Math.floor(w / 4);
  for (let i = 0; i < segs; i++) {
    const lx = -w / 2 + (i + 0.5) * (w / segs);
    for (const lz of [-d / 2, d / 2]) {
      if (rng() < 0.2) continue;
      const hgt = 6 + rng() * 10 * (1 - Math.abs(lx) / w);
      const [px, pz] = local(lx, lz);
      addMesh(group, boxGeo, rng() < 0.3 ? stoneDark : stone, px, gy + hgt / 2, pz, w / segs + 0.05, hgt, 2.2, rot);
      colliders.push({ x: px, z: pz, r: 2.2, top: gy + hgt });
    }
  }
  // tower block
  const [tx, tz] = local(w * 0.3, 0);
  const th = 16 + rng() * 10;
  addMesh(group, boxGeo, stone, tx, gy + th / 2, tz, 7, th, d, rot);
  addMesh(group, boxGeo, stoneDark, tx, gy + th + 0.6, tz, 8, 1.2, d + 1, rot);
  for (let k = -1; k <= 1; k++) {
    const [cx, cz] = local(w * 0.3, (k * d) / 3);
    colliders.push({ x: cx, z: cz, r: 4.2, top: gy + th + 1.2 });
  }
}

function statue(group, colliders, rng, x, z, heightAt) {
  const rot = rng() * Math.PI * 2;
  const g = new THREE.Group();
  const gy = groundMin(heightAt, x, z, 9) - 2;
  g.position.set(x, gy, z);
  g.rotation.y = rot;
  addMesh(g, boxGeo, stone, 0, 3, 0, 7, 6, 16); // body
  addMesh(g, boxGeo, stone, -2, 1.2, 10, 2, 2.4, 6); // paws
  addMesh(g, boxGeo, stone, 2, 1.2, 10, 2, 2.4, 6);
  addMesh(g, boxGeo, stone, 0, 7.5, 6, 5, 6, 5); // chest / neck
  addMesh(g, boxGeo, stone, 0, 11.5, 7, 4, 4.5, 4); // head
  addMesh(g, coneGeo, stoneDark, 0, 10.5, 5.2, 4.2, 7, 4.2, Math.PI / 4); // headdress
  addMesh(g, boxGeo, stoneDark, 0, 10.4, 9.1, 0.8, 1.2, 0.8); // nose
  group.add(g);
  for (let k = -1; k <= 1.5; k += 0.8) {
    colliders.push({ x: x + Math.sin(rot) * k * 7, z: z + Math.cos(rot) * k * 7, r: 5, top: gy + 14 });
  }
}

// Four circles cover a yaw-aligned square of half-width `half`.
// Each circle is tangent to two edges and one corner, so the stone is blocked
// and the extra reach past a face stays about 0.2 * half.
function addSquareCollider(colliders, x, z, yaw, half, top) {
  const a = half / 2;
  const r = a * Math.SQRT2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [ox, oz] = yawOffset(yaw, sx * a, sz * a);
      colliders.push({ x: x + ox, z: z + oz, r, top });
    }
  }
}

function addPyramid(group, colliders, x, z, side, height, yaw, heightAt) {
  const plinthH = 1.7;
  const plinthSide = side * 1.12;
  const gy = groundMin(heightAt, x, z, plinthSide * 0.72) - 1.8;
  addMesh(group, boxGeo, limestoneDark, x, gy + plinthH / 2, z, plinthSide, plinthH, plinthSide, yaw);

  // ConeGeometry corners sit on the axes. yaw - PI/4 swings them onto the base corners.
  const capR = (side / 2) * Math.SQRT2;
  addMesh(
    group, coneGeo, limestone,
    x, gy + plinthH + height / 2 - 0.15, z,
    capR, height + 0.15, capR,
    yaw - Math.PI / 4,
  );

  // Cylinders block everything below `top`. Upper bands are narrower, matching the taper.
  const bands = 5;
  for (let i = 0; i < bands; i++) {
    const y0 = (i / bands) * height;
    const half = i === 0 ? plinthSide / 2 : (side * (1 - y0 / height)) / 2;
    const top = gy + plinthH + ((i + 1) / bands) * height;
    addSquareCollider(colliders, x, z, yaw, Math.max(half, 1.5), top);
  }
}

function pyramidCluster(group, colliders, rng, x, z, heightAt, yaw = rng() * Math.PI * 2) {
  const n = rng() < 0.72 ? 3 : 2;
  const mainH = 32 + rng() * 16;
  const heights = [mainH];
  for (let i = 1; i < n; i++) heights.push(mainH * (0.46 + rng() * 0.18));
  if (n === 3) {
    const main = heights[0];
    heights[0] = heights[1];
    heights[1] = main;
  }
  const sides = heights.map((h) => h * 1.58);
  const gap = 7 + rng() * 5;
  const total = sides.reduce((a, b) => a + b, 0) + gap * (n - 1);
  let cursor = -total / 2;
  for (let i = 0; i < n; i++) {
    const lx = cursor + sides[i] / 2;
    cursor += sides[i] + gap;
    const [ox, oz] = yawOffset(yaw, lx, (i - (n - 1) / 2) * 2);
    addPyramid(group, colliders, x + ox, z + oz, sides[i], heights[i], yaw, heightAt);
  }
}

function rocks(group, colliders, rng, x, z, heightAt) {
  const n = 2 + Math.floor(rng() * 5);
  for (let i = 0; i < n; i++) {
    const px = x + (rng() - 0.5) * 30;
    const pz = z + (rng() - 0.5) * 30;
    const s = 0.8 + rng() * 2.5;
    const gy = heightAt(px, pz) - s * 0.4;
    addMesh(group, rockGeo, stoneDark, px, gy, pz, s * (1 + rng()), s, s * (1 + rng()), rng() * 6, rng(), rng());
    colliders.push({ x: px, z: pz, r: s * 1.3, top: gy + s });
  }
}

// Ahead of the start, on a flat patch at about the same height as the spawn.
const LANDMARK_X = 149;
const LANDMARK_Z = 118;
const LANDMARK_CLEAR = 105;

export function buildChunkProps(cx, cz, size, heightAt) {
  const group = new THREE.Group();
  const colliders = [];
  const rng = mulberry32(hashSeed(cx + 1000, cz - 1000));

  if (cx === 0 && cz === 0) {
    pyramidCluster(
      group, colliders, mulberry32(hashSeed(11, 19)),
      LANDMARK_X, LANDMARK_Z, heightAt,
      Math.atan2(-LANDMARK_X, -LANDMARK_Z),
    );
  }

  const count = rng() < 0.55 ? 1 + Math.floor(rng() * 2) : 0;
  for (let i = 0; i < count; i++) {
    const x = cx * size + 20 + rng() * (size - 40);
    const z = cz * size + 20 + rng() * (size - 40);
    if (Math.hypot(x, z) < 60) continue; // keep spawn clear
    if ((x - LANDMARK_X) ** 2 + (z - LANDMARK_Z) ** 2 < LANDMARK_CLEAR ** 2) continue;
    const roll = rng();
    if (roll < 0.35) pillars(group, colliders, rng, x, z, heightAt);
    else if (roll < 0.6) rocks(group, colliders, rng, x, z, heightAt);
    else if (roll < 0.88) ruinBuilding(group, colliders, rng, x, z, heightAt);
    else statue(group, colliders, rng, x, z, heightAt);
  }

  // Further clusters, far enough apart that two groups don't grow through each other.
  if (!(cx === 0 && cz === 0) && rng() < 0.09) {
    const x = cx * size + 46 + rng() * (size - 92);
    const z = cz * size + 46 + rng() * (size - 92);
    const dx = x - LANDMARK_X;
    const dz = z - LANDMARK_Z;
    if (Math.hypot(x, z) > 280 && dx * dx + dz * dz > 320 * 320) {
      pyramidCluster(group, colliders, rng, x, z, heightAt);
    }
  }
  return { group, colliders };
}
