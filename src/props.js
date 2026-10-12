import * as THREE from 'three';
import { mulberry32, hashSeed } from './noise.js';

// Shared resources; chunk groups only hold meshes referencing these.
export const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1.08, 1, 10, 1);
export const rockGeo = new THREE.DodecahedronGeometry(1, 0);
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
export function yawOffset(yaw, lx, lz) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [lx * c + lz * s, -lx * s + lz * c];
}

export function addMesh(group, geo, mat, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

export function groundMin(heightAt, x, z, r) {
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

// Same numbers the mesh uses. The bike rides this instead of being shoved out by cylinders.
export function describePyramid(x, z, side, height, yaw, heightAt) {
  const plinthH = 1.7;
  const plinthSide = side * 1.12;
  const gy = groundMin(heightAt, x, z, plinthSide * 0.72) - 1.8;
  const capR = (side / 2) * Math.SQRT2;
  const meshH = height + 0.15;
  const meshY = gy + plinthH + height / 2 - 0.15;
  return {
    x,
    z,
    yaw,
    plinthH,
    plinthSide,
    plinthHalf: plinthSide / 2,
    half: side / 2,
    baseY: gy,
    plinthTop: gy + plinthH,
    capR,
    meshH,
    meshY,
    apexY: meshY + meshH / 2,
    coneBase: meshY - meshH / 2,
  };
}

// Highest stone at (x, z), or null. The normal tilts outward, down the face.
export function pyramidFace(p, x, z) {
  const dx = x - p.x;
  const dz = z - p.z;
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const ax = Math.abs(lx);
  const az = Math.abs(lz);
  if (ax > p.plinthHalf || az > p.plinthHalf) return null;

  let y = p.plinthTop;
  let dlx = 0;
  let dlz = 0;
  if (ax <= p.half && az <= p.half) {
    const m = Math.max(ax, az);
    const coneY = p.coneBase + (p.apexY - p.coneBase) * (1 - m / p.half);
    // A stepped temple (jungle.js) caps the taper at its flat top.
    if (p.flatY !== undefined && coneY >= p.flatY) {
      y = Math.max(y, p.flatY);
    } else if (coneY > y) {
      y = coneY;
      const inv = (p.apexY - p.coneBase) / p.half;
      if (ax >= az) dlx = -inv * Math.sign(lx || 1);
      else dlz = -inv * Math.sign(lz || 1);
    }
  }
  const dhdx = dlx * c + dlz * s;
  const dhdz = -dlx * s + dlz * c;
  const len = Math.hypot(dhdx, 1, dhdz);
  return { y, nx: -dhdx / len, ny: 1 / len, nz: -dhdz / len };
}

function addPyramid(group, slopes, x, z, side, height, yaw, heightAt) {
  const pyr = describePyramid(x, z, side, height, yaw, heightAt);
  addMesh(group, boxGeo, limestoneDark, x, pyr.baseY + pyr.plinthH / 2, z, pyr.plinthSide, pyr.plinthH, pyr.plinthSide, yaw);
  // ConeGeometry corners sit on the axes. yaw - PI/4 swings them onto the base corners.
  addMesh(group, coneGeo, limestone, x, pyr.meshY, z, pyr.capR, pyr.meshH, pyr.capR, yaw - Math.PI / 4);
  slopes.push(pyr);
}

function pyramidCluster(group, slopes, rng, x, z, heightAt, yaw = rng() * Math.PI * 2) {
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
    addPyramid(group, slopes, x + ox, z + oz, sides[i], heights[i], yaw, heightAt);
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
export const LANDMARK_X = 149;
export const LANDMARK_Z = 118;
export const LANDMARK_CLEAR = 105;

export function buildChunkProps(cx, cz, size, heightAt) {
  const group = new THREE.Group();
  const colliders = [];
  const slopes = [];
  const rng = mulberry32(hashSeed(cx + 1000, cz - 1000));

  if (cx === 0 && cz === 0) {
    pyramidCluster(
      group, slopes, mulberry32(hashSeed(11, 19)),
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
      pyramidCluster(group, slopes, rng, x, z, heightAt);
    }
  }
  return { group, colliders, slopes };
}
