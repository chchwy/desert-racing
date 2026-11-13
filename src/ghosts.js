import * as THREE from 'three';

// Ghosts that come out at night for a player with no house of its own: pale sheets with
// dark eyes that rise around the bike, drift after it slower than it can ride, and say
// so when one touches it. They sink away when the night (or the homelessness) ends.
const COUNT = 7;
const SPEED = 11; // m/s, slower than the bike
const SPAWN = [45, 90]; // metres from the bike
const TOUCH = 2.6;

function ghostMesh(mat, eye) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  head.position.y = 1.4;
  g.add(head);
  const sheet = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.25, 1.6, 20, 1, true), mat);
  sheet.position.y = 0.6;
  g.add(sheet);
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), eye);
    e.position.set(sx * 0.35, 1.55, 0.88);
    e.scale.set(1, 1.5, 0.6);
    g.add(e);
  }
  return g;
}

export class Ghosts {
  constructor(scene) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xeef4ff, emissive: 0x9fb8ff, emissiveIntensity: 0.6, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false,
    });
    const eye = new THREE.MeshBasicMaterial({ color: 0x0a0a14 });
    this.mat = mat;
    this.list = Array.from({ length: COUNT }, () => {
      const mesh = ghostMesh(mat, eye);
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, phase: Math.random() * 10 };
    });
    this.out = 0; // 0 hidden .. 1 fully out
  }

  spawn(g, pos, floorAt) {
    const a = Math.random() * Math.PI * 2;
    const r = SPAWN[0] + Math.random() * (SPAWN[1] - SPAWN[0]);
    const x = pos.x + Math.sin(a) * r;
    const z = pos.z + Math.cos(a) * r;
    g.mesh.position.set(x, floorAt(x, z) + 1, z);
  }

  // Returns true when a ghost touched the bike this frame.
  update(dt, time, active, pos, floorAt) {
    const was = this.out;
    this.out = THREE.MathUtils.clamp(this.out + (active ? dt : -dt) * 0.5, 0, 1);
    this.mat.opacity = 0.75 * this.out;
    let touched = false;
    for (const g of this.list) {
      g.mesh.visible = this.out > 0;
      if (!g.mesh.visible) continue;
      if (was === 0) this.spawn(g, pos, floorAt);
      const m = g.mesh.position;
      const dx = pos.x - m.x;
      const dz = pos.z - m.z;
      const d = Math.hypot(dx, dz);
      if (d > SPAWN[1] * 2) this.spawn(g, pos, floorAt);
      else if (d > 0.01) {
        const step = Math.min(SPEED * dt, d);
        m.x += (dx / d) * step + Math.sin(time * 0.9 + g.phase) * dt * 2;
        m.z += (dz / d) * step;
      }
      m.y = floorAt(m.x, m.z) + 1.2 + Math.sin(time * 2 + g.phase) * 0.5;
      g.mesh.rotation.y = Math.atan2(dx, dz);
      if (this.out > 0.5 && d < TOUCH && Math.abs(pos.y - m.y) < 4) {
        touched = true;
        this.spawn(g, pos, floorAt);
      }
    }
    return touched;
  }
}
