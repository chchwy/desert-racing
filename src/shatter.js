import * as THREE from 'three';
import { heightAt } from './terrain.js';

// Ice shards from a smashed crystal. One pooled InstancedMesh; each shard flies out with
// part of the bike's momentum, spins, bounces and slides on the snow, then shrinks away.

const MAX = 480;
const GRAVITY = 24;

const shardGeo = new THREE.TetrahedronGeometry(1, 0);

export class Shatter {
  constructor(scene, material) {
    this.mesh = new THREE.InstancedMesh(shardGeo, material, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.rot = new Float32Array(MAX * 3);
    this.spin = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.cursor = 0;
    this.live = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.p = new THREE.Vector3();
    this.s = new THREE.Vector3();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, zero);
    scene.add(this.mesh);
  }

  // spire: { x, z, baseY, h, w } from snow.js. bikeVel: the bike's velocity at impact.
  burst(spire, bikeVel) {
    const n = Math.round(THREE.MathUtils.clamp(spire.h * 2.4, 24, 110));
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spire.w;
      const y = spire.baseY + 0.5 + Math.random() * spire.h * 0.9;
      this.pos[i * 3] = spire.x + Math.cos(a) * r;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = spire.z + Math.sin(a) * r;
      const out = 4 + Math.random() * 10;
      const carry = 0.3 + Math.random() * 0.5;
      this.vel[i * 3] = Math.cos(a) * out + bikeVel.x * carry;
      this.vel[i * 3 + 1] = 3 + Math.random() * 9;
      this.vel[i * 3 + 2] = Math.sin(a) * out + bikeVel.z * carry;
      for (let j = 0; j < 3; j++) {
        this.rot[i * 3 + j] = Math.random() * Math.PI * 2;
        this.spin[i * 3 + j] = (Math.random() - 0.5) * 14;
      }
      const s = Math.min(spire.w * (0.06 + Math.random() * 0.16), 1.1);
      this.size[i * 3] = s * (0.6 + Math.random() * 0.6);
      this.size[i * 3 + 1] = s * (1 + Math.random() * 1.4); // splinters are long
      this.size[i * 3 + 2] = s * (0.6 + Math.random() * 0.6);
      this.life[i] = 3 + Math.random() * 2.5;
    }
    this.live = MAX;
  }

  update(dt) {
    if (!this.live) return;
    let alive = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = i * 3;
      if (this.life[i] <= 0) {
        this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
        continue;
      }
      alive++;
      this.vel[k + 1] -= GRAVITY * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      let spin = 1;
      const ground = heightAt(this.pos[k], this.pos[k + 2]) + this.size[k + 1] * 0.3;
      if (this.pos[k + 1] < ground) {
        // Bounce a little, then slide and settle.
        this.pos[k + 1] = ground;
        this.vel[k + 1] = Math.abs(this.vel[k + 1]) * 0.3;
        const f = Math.exp(-4 * dt);
        this.vel[k] *= f;
        this.vel[k + 2] *= f;
        spin = Math.exp(-6 * dt);
      }
      for (let j = 0; j < 3; j++) {
        this.spin[k + j] *= spin;
        this.rot[k + j] += this.spin[k + j] * dt;
      }
      const fade = Math.min(1, this.life[i] / 0.6);
      this.p.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]);
      this.q.setFromEuler(this.e.set(this.rot[k], this.rot[k + 1], this.rot[k + 2]));
      this.s.set(this.size[k] * fade, this.size[k + 1] * fade, this.size[k + 2] * fade);
      this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.live = alive;
  }
}
