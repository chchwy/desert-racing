import * as THREE from 'three';
import { addCoins } from './coins.js';
import { chime } from './sound.js';

// Coins that keep falling over the player's own head (硬幣先生 and 仙人掌硬幣先生).
// Only the player sees them and only the player picks them up; the other riders do not
// know they exist. They fall from ahead of the bike so they meet it, and a coin that
// reaches the ground starts over above the bike.
const COUNT = 40;
const SPREAD = 5; // metres around the bike
const HIGH = [10, 22];
const FALL = 9; // m/s
const PICK = 2.6;
export const PRIVATE_WORTH = 100;

const geo = new THREE.CylinderGeometry(0.5, 0.5, 0.08, 16);
const mat = new THREE.MeshStandardMaterial({
  color: new THREE.Color().setRGB(1.0, 0.8, 0.3, THREE.SRGBColorSpace),
  metalness: 0.6,
  roughness: 0.3,
  emissive: new THREE.Color().setRGB(0.85, 0.5, 0.08, THREE.SRGBColorSpace),
  emissiveIntensity: 0.9,
});
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const one = new THREE.Vector3(1, 1, 1);
const p = new THREE.Vector3();

export class PrivateRain {
  constructor(scene, floorAt) {
    this.floorAt = floorAt;
    this.mesh = new THREE.InstancedMesh(geo, mat, COUNT);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.coins = Array.from({ length: COUNT }, () => ({ x: 0, y: -1e6, z: 0, spin: 0 }));
    this.chimeIn = 0;
  }

  spawn(c, pos, vel, anyHeight) {
    const lead = (HIGH[0] + HIGH[1]) / 2 / FALL;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * SPREAD;
    c.x = pos.x + vel.x * lead + Math.cos(a) * r;
    c.z = pos.z + vel.z * lead + Math.sin(a) * r;
    const h = HIGH[0] + Math.random() * (HIGH[1] - HIGH[0]);
    c.y = pos.y + (anyHeight ? Math.random() * h : h);
    c.spin = Math.random() * 10;
  }

  // Returns the coins the player picked up this frame.
  update(dt, time, player, on) {
    const was = this.mesh.visible;
    this.mesh.visible = on;
    if (!on) return 0;
    const pos = player.pos;
    let got = 0;
    this.chimeIn -= dt;
    this.coins.forEach((c, i) => {
      if (!was) this.spawn(c, pos, player.vel, true);
      c.y -= FALL * dt;
      const near = Math.hypot(c.x - pos.x, c.z - pos.z) < PICK && Math.abs(c.y - pos.y - 1) < 2.2;
      if (near) {
        got += PRIVATE_WORTH;
        this.spawn(c, pos, player.vel, false);
      } else if (c.y < this.floorAt(c.x, c.z) || Math.hypot(c.x - pos.x, c.z - pos.z) > 80) {
        this.spawn(c, pos, player.vel, false);
      }
      e.set(time * 3 + c.spin, time * 2 + c.spin, 0);
      q.setFromEuler(e);
      m4.compose(p.set(c.x, c.y, c.z), q, one);
      this.mesh.setMatrixAt(i, m4);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (got) {
      addCoins(got);
      if (this.chimeIn <= 0) {
        chime();
        this.chimeIn = 0.08;
      }
    }
    return got;
  }
}
