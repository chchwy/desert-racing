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

// A pen's floor as { x0, x1, z0, z1 }, pulled in by margin.
export function penBounds(team, margin = 0) {
  const pen = PENS[team];
  return { x0: pen.x - HALF_X + margin, x1: pen.x + HALF_X - margin, z0: pen.z - HALF_Z + margin, z1: pen.z + HALF_Z - margin };
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

// Coins thrown into a pen from outside the fence. Each one is lobbed on a long arc from
// somewhere 25-60 m outside the bars to a spot inside, and once it lands it stays, so
// the pen fills up over time. The bike picks one up within PICK.
const COIN_MAX = 4000;
const COIN_RATE = 4; // per second
const COIN_G = 20;
const PICK = 2.6;
const coinGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.12, 18);
const coinMat = new THREE.MeshStandardMaterial({
  color: new THREE.Color().setRGB(1.0, 0.78, 0.25, THREE.SRGBColorSpace),
  metalness: 0.6,
  roughness: 0.3,
  emissive: new THREE.Color().setRGB(0.85, 0.5, 0.08, THREE.SRGBColorSpace),
  emissiveIntensity: 0.9,
});

export class JailCoins {
  constructor(scene, team, heightAt) {
    this.team = team;
    this.heightAt = heightAt;
    this.inside = penBounds(team, 4);
    this.mesh = new THREE.InstancedMesh(coinGeo, coinMat, COIN_MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.coins = [];
    this.acc = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.p = new THREE.Vector3();
    this.one = new THREE.Vector3(1, 1, 1);
  }

  throwOne() {
    const pen = PENS[this.team];
    const b = this.inside;
    // From outside: a random bearing from the pen center, past the fence.
    const a = Math.random() * Math.PI * 2;
    const reach = Math.max(HALF_X, HALF_Z) + 25 + Math.random() * 35;
    const sx = pen.x + Math.cos(a) * reach;
    const sz = pen.z + Math.sin(a) * reach;
    const sy = this.heightAt(sx, sz) + 2;
    const tx = b.x0 + Math.random() * (b.x1 - b.x0);
    const tz = b.z0 + Math.random() * (b.z1 - b.z0);
    const ty = this.heightAt(tx, tz) + 0.35;
    const T = 2.5 + Math.random() * 1.5;
    this.coins.push({
      x: sx, y: sy, z: sz, vx: (tx - sx) / T, vy: (ty - sy) / T + 0.5 * COIN_G * T, vz: (tz - sz) / T,
      t: 0, T, ty, landed: false, spin: 5 + Math.random() * 8, phase: Math.random() * 10,
    });
  }

  // Returns how many coins the bike picked up this frame.
  update(dt, time, pos) {
    this.acc += dt * COIN_RATE;
    while (this.acc >= 1) {
      this.acc -= 1;
      if (this.coins.length < COIN_MAX) this.throwOne();
    }
    let picked = 0;
    let n = 0;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (!c.landed) {
        c.t += dt;
        c.vy -= COIN_G * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.z += c.vz * dt;
        if (c.t >= c.T) {
          c.y = c.ty;
          c.landed = true;
        }
      }
      if (Math.abs(c.x - pos.x) < PICK && Math.abs(c.z - pos.z) < PICK && Math.abs(c.y - pos.y) < PICK + 1) {
        this.coins[i] = this.coins[this.coins.length - 1];
        this.coins.pop();
        picked++;
        continue;
      }
      this.e.set(c.landed ? Math.PI / 2 + 0.15 : time * 1.3 + c.phase, c.landed ? c.phase : time * c.spin, 0);
      this.q.setFromEuler(this.e);
      this.mesh.setMatrixAt(n++, this.m.compose(this.p.set(c.x, c.y, c.z), this.q, this.one));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    return picked;
  }
}
