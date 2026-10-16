import * as THREE from 'three';

// Tears for the losing team: drops that spring from a rider's head, arc out and fall.
// A fixed pool of points, recycled oldest first.

const MAX = 1500;
const G = 14;

export class Tears {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.age = new Float32Array(MAX).fill(99);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: new THREE.Color(0.55, 0.85, 1.6), size: 0.35, transparent: true, opacity: 0.9, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  // Two drops, one from each eye, from a head at (x, y, z) facing yaw.
  cry(x, y, z, yaw) {
    for (const side of [-1, 1]) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      const lx = Math.cos(yaw) * side * 0.18;
      const lz = -Math.sin(yaw) * side * 0.18;
      this.pos.set([x + lx + Math.sin(yaw) * 0.3, y, z + lz + Math.cos(yaw) * 0.3], i * 3);
      this.vel.set([lx * 8 + (Math.random() - 0.5), 1.5 + Math.random() * 1.5, lz * 8 + (Math.random() - 0.5)], i * 3);
      this.age[i] = 0;
    }
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.age[i] > 3) {
        this.pos[i * 3 + 1] = -1e4; // parked out of sight
        continue;
      }
      this.age[i] += dt;
      this.vel[i * 3 + 1] -= G * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
