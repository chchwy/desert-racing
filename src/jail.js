import * as THREE from 'three';
import { FRIEND, FOE } from './teams.js';

// The jail: two big pens fenced with iron bars, one per team, each with room for 500
// bikes parked in rows. The red pen is around the origin, so a jailed player starts
// inside it. Bars are spaced so the bike's 1.3 m padding cannot slip between them.

const HALF_X = 85;
const HALF_Z = 70;
const BAR_STEP = 2.2;
const BAR_H = 6;
const SLOT = 6.2; // parking grid spacing
const COLS = 25;

export const PENS = {
  [FRIEND]: { x: 0, z: 0 },
  [FOE]: { x: 260, z: 0 },
};

// Parking spot n (0..499) in a team's pen.
export function penSlot(team, n) {
  const pen = PENS[team];
  const col = n % COLS;
  const row = Math.floor(n / COLS);
  return {
    x: pen.x + (col - (COLS - 1) / 2) * SLOT,
    z: pen.z - HALF_Z + 8 + row * SLOT,
    yaw: 0,
  };
}

// Is (x, z) inside a pen, with a margin?
export function inPen(team, x, z, margin = 0) {
  const pen = PENS[team];
  return Math.abs(x - pen.x) < HALF_X - margin && Math.abs(z - pen.z) < HALF_Z - margin;
}

const barGeo = new THREE.CylinderGeometry(0.12, 0.12, BAR_H, 6);
barGeo.translate(0, BAR_H / 2, 0);
const railGeo = new THREE.BoxGeometry(BAR_STEP, 0.25, 0.25);
const iron = new THREE.MeshStandardMaterial({ color: 0x3a3c42, metalness: 0.7, roughness: 0.45 });
const flagMats = {
  [FRIEND]: new THREE.MeshStandardMaterial({ color: 0xe8222a, roughness: 0.8, side: THREE.DoubleSide }),
  [FOE]: new THREE.MeshStandardMaterial({ color: 0x2257e8, roughness: 0.8, side: THREE.DoubleSide }),
};

// Bar positions around a pen's perimeter, with the yaw of the side they sit on.
function perimeter(pen) {
  const out = [];
  const side = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.round(len / BAR_STEP);
    const yaw = Math.atan2(z1 - z0, x1 - x0);
    for (let i = 0; i < n; i++) out.push({ x: x0 + ((x1 - x0) * i) / n, z: z0 + ((z1 - z0) * i) / n, yaw });
  };
  const x0 = pen.x - HALF_X;
  const x1 = pen.x + HALF_X;
  const z0 = pen.z - HALF_Z;
  const z1 = pen.z + HALF_Z;
  side(x0, z0, x1, z0);
  side(x1, z0, x1, z1);
  side(x1, z1, x0, z1);
  side(x0, z1, x0, z0);
  return out;
}

const BARS = { [FRIEND]: perimeter(PENS[FRIEND]), [FOE]: perimeter(PENS[FOE]) };

export function buildJailProps(cx, cz, size, heightAt) {
  const group = new THREE.Group();
  const colliders = [];
  const x0 = cx * size;
  const z0 = cz * size;
  const mine = [];
  for (const team of [FRIEND, FOE]) {
    for (const b of BARS[team]) {
      if (b.x >= x0 && b.x < x0 + size && b.z >= z0 && b.z < z0 + size) mine.push(b);
    }
  }
  if (mine.length) {
    const bars = new THREE.InstancedMesh(barGeo, iron, mine.length);
    const rails = new THREE.InstancedMesh(railGeo, iron, mine.length * 2);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    mine.forEach((b, i) => {
      const gy = heightAt(b.x, b.z) - 0.3;
      bars.setMatrixAt(i, m.compose(p.set(b.x, gy, b.z), q.identity(), one));
      // Rails run along the side, from this bar to the next.
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -b.yaw);
      const mx = b.x + (Math.cos(b.yaw) * BAR_STEP) / 2;
      const mz = b.z + (Math.sin(b.yaw) * BAR_STEP) / 2;
      rails.setMatrixAt(i * 2, m.compose(p.set(mx, gy + BAR_H - 0.2, mz), q, one));
      rails.setMatrixAt(i * 2 + 1, m.compose(p.set(mx, gy + 0.6, mz), q, one));
      colliders.push({ x: b.x, z: b.z, r: 0.15, top: gy + BAR_H });
    });
    for (const mesh of [bars, rails]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  // A tall team flag on each pen's far corner.
  for (const team of [FRIEND, FOE]) {
    const pen = PENS[team];
    const fx = pen.x + HALF_X - 4;
    const fz = pen.z + HALF_Z - 4;
    if (fx < x0 || fx >= x0 + size || fz < z0 || fz >= z0 + size) continue;
    const gy = heightAt(fx, fz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 22, 8), iron);
    pole.position.set(fx, gy + 11, fz);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.5), flagMats[team]);
    cloth.position.set(fx - 4.5, gy + 19, fz);
    group.add(pole, cloth);
  }
  return { group, colliders, slopes: [] };
}
