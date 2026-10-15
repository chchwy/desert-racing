import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { crash } from './sound.js';

// Air cannon and machine gun. Everyone carries both: the player fires the air cannon with
// R (or B) and the gun with T; rivals and the swarm fire at foes ahead of them and, now
// and then, at nothing at all. Shots only hit the other team.
//
// The air cannon throws one big slow ring, and its owner cannot fire again until that
// ring is gone. The gun fires a burst of four fast tracers. A shot dies on the ground,
// at the end of its life, or on the first foe it reaches. Targets are bucketed in a
// grid each frame so a thousand shots do not test a thousand bikes each.

export const AIR = 0;
export const GUN = 1;

const MAX = 1400;
const SPEC = {
  [AIR]: { speed: 75, life: 3, r: 2.8 },
  [GUN]: { speed: 170, life: 1.4, r: 1.7 },
};
const BURST = [-0.05, -0.017, 0.017, 0.05]; // gun spread, radians
const CELL = 24;

const ringGeo = new THREE.TorusGeometry(1.5, 0.35, 8, 20); // faces +Z
const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 2.0, 2.2), transparent: true, opacity: 0.55, depthWrite: false });
const tracerGeo = new THREE.CylinderGeometry(0.09, 0.09, 2.6, 5);
tracerGeo.rotateX(Math.PI / 2); // along +Z
const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.2, 0.5) });

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v = new THREE.Vector3();
const sc = new THREE.Vector3();
const UPY = new THREE.Vector3(0, 1, 0);

export class Weapons {
  constructor(scene) {
    this.x = new Float32Array(MAX);
    this.y = new Float32Array(MAX);
    this.z = new Float32Array(MAX);
    this.vx = new Float32Array(MAX);
    this.vz = new Float32Array(MAX);
    this.age = new Float32Array(MAX);
    this.kind = new Uint8Array(MAX);
    this.team = new Uint8Array(MAX);
    this.owner = new Int32Array(MAX);
    this.live = new Uint8Array(MAX);
    this.free = [];
    for (let i = MAX - 1; i >= 0; i--) this.free.push(i);
    this.airOut = new Map(); // owner -> shot index of its ring in flight
    this.rings = new THREE.InstancedMesh(ringGeo, ringMat, MAX);
    this.tracers = new THREE.InstancedMesh(tracerGeo, tracerMat, MAX);
    for (const m of [this.rings, this.tracers]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    this.targets = []; // filled by the caller each frame: { id, team, x, y, z }
    this.grid = new Map();
  }

  canFireAir(owner) {
    return !this.airOut.has(owner);
  }

  // Fire from (x, y, z) along yaw. Returns false when the air cannon is still out.
  fire(kind, owner, team, x, y, z, yaw) {
    if (kind === AIR) {
      if (this.airOut.has(owner)) return false;
      const i = this.spawn(AIR, owner, team, x, y, z, yaw);
      if (i >= 0) this.airOut.set(owner, i);
      return i >= 0;
    }
    for (const a of BURST) this.spawn(GUN, owner, team, x, y, z, yaw + a);
    return true;
  }

  spawn(kind, owner, team, x, y, z, yaw) {
    const i = this.free.pop();
    if (i === undefined) return -1;
    const sp = SPEC[kind].speed;
    this.x[i] = x + Math.sin(yaw) * 3;
    this.y[i] = y;
    this.z[i] = z + Math.cos(yaw) * 3;
    this.vx[i] = Math.sin(yaw) * sp;
    this.vz[i] = Math.cos(yaw) * sp;
    this.age[i] = 0;
    this.kind[i] = kind;
    this.team[i] = team;
    this.owner[i] = owner;
    this.live[i] = 1;
    return i;
  }

  kill(i) {
    this.live[i] = 0;
    this.free.push(i);
    if (this.kind[i] === AIR && this.airOut.get(this.owner[i]) === i) this.airOut.delete(this.owner[i]);
  }

  bucket() {
    this.grid.clear();
    for (const t of this.targets) {
      const k = Math.floor(t.x / CELL) + ',' + Math.floor(t.z / CELL);
      let list = this.grid.get(k);
      if (!list) this.grid.set(k, (list = []));
      list.push(t);
    }
  }

  // Moves the shots, draws them, and calls onHit(target, kind, shooterId) for each foe hit.
  update(dt, cameraPos, onHit) {
    this.bucket();
    let nr = 0;
    let nt = 0;
    for (let i = 0; i < MAX; i++) {
      if (!this.live[i]) continue;
      const kind = this.kind[i];
      const spec = SPEC[kind];
      this.age[i] += dt;
      this.x[i] += this.vx[i] * dt;
      this.z[i] += this.vz[i] * dt;
      if (this.age[i] > spec.life || heightAt(this.x[i], this.z[i]) > this.y[i] + 0.5) {
        this.kill(i);
        continue;
      }
      // Foes in the shot's cell and its neighbours.
      const cx = Math.floor(this.x[i] / CELL);
      const cz = Math.floor(this.z[i] / CELL);
      let hit = null;
      for (let dz = -1; dz <= 1 && !hit; dz++) {
        for (let dx = -1; dx <= 1 && !hit; dx++) {
          const list = this.grid.get(cx + dx + ',' + (cz + dz));
          if (!list) continue;
          for (const t of list) {
            if (t.team === this.team[i] || t.gone) continue;
            const ddx = t.x - this.x[i];
            const ddz = t.z - this.z[i];
            const ddy = t.y + 1 - this.y[i];
            if (ddx * ddx + ddz * ddz + ddy * ddy < spec.r * spec.r) {
              hit = t;
              break;
            }
          }
        }
      }
      if (hit) {
        hit.gone = true; // one hit per target per frame
        const near = Math.hypot(hit.x - cameraPos.x, hit.z - cameraPos.z);
        if (near < 120) crash((kind === AIR ? 0.7 : 0.45) * (1 - near / 120));
        onHit(hit, kind, this.owner[i]);
        this.kill(i);
        continue;
      }
      const yaw = Math.atan2(this.vx[i], this.vz[i]);
      q.setFromAxisAngle(UPY, yaw);
      v.set(this.x[i], this.y[i], this.z[i]);
      if (kind === AIR) {
        const grow = 1 + this.age[i] * 0.5;
        sc.set(grow, grow, 1);
        this.rings.setMatrixAt(nr++, m4.compose(v, q, sc));
      } else {
        sc.set(1, 1, 1);
        this.tracers.setMatrixAt(nt++, m4.compose(v, q, sc));
      }
    }
    this.rings.count = nr;
    this.tracers.count = nt;
    this.rings.instanceMatrix.needsUpdate = true;
    this.tracers.instanceMatrix.needsUpdate = true;
  }
}
