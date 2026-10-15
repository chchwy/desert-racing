import * as THREE from 'three';
import { COIN_R, coinsNear, addCoins } from './coins.js';
import { chime } from './sound.js';

// Coin rain around the big discs. Within ZONE of a disc's center (collected or not, so
// the whole trail corridor rains), small gold coins tumble out of the sky in a box
// around the bike, denser closer to a disc, lie on the ground a few seconds, and are
// recycled to the top. Each one the bike touches adds RAIN_WORTH to the counter.
// Others may take them too (take()); `active` lists the ones in the air or on the ground.

const MAX = 1500;
const ZONE = COIN_R + 500; // metres from a disc center where it rains
const FADE = 300; // the rain thins over the last stretch of the zone
const BOX = 90; // half-width of the rain box around the bike
const TOP = 70; // spawn height above the ground
const FALL = 16; // m/s
const REST = 4; // seconds a landed coin stays
const PICK = 2.6; // bike pickup radius
export const RAIN_WORTH = 100;

const geo = new THREE.CylinderGeometry(0.85, 0.85, 0.12, 18);
const mat = new THREE.MeshStandardMaterial({
  color: new THREE.Color().setRGB(1.0, 0.78, 0.25, THREE.SRGBColorSpace),
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

export class CoinRain {
  constructor(scene, terrain) {
    this.terrain = terrain;
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.coins = Array.from({ length: MAX }, () => ({
      x: 0, y: 0, z: 0, ground: 0, landed: -1, spin: 0, tilt: 0, phase: 0, live: false,
    }));
    this.active = [];
    this.density = 0;
    this.chimeIn = 0;
    this.check = 0;
    this.prevWant = 0;
  }

  // Density 0..1 from the nearest disc center. Checked a few times a second.
  zone(pos) {
    let best = Infinity;
    for (const spot of coinsNear(pos.x, pos.z, ZONE)) best = Math.min(best, Math.hypot(spot.x - pos.x, spot.z - pos.z));
    return 1 - THREE.MathUtils.clamp((best - (ZONE - FADE)) / FADE, 0, 1);
  }

  spawn(c, pos, vel, fill) {
    // Ahead of the bike, where it will be by the time the coin lands.
    const lead = Math.min(TOP / FALL, 3);
    c.x = pos.x + vel.x * lead + (Math.random() * 2 - 1) * BOX;
    c.z = pos.z + vel.z * lead + (Math.random() * 2 - 1) * BOX;
    c.ground = this.terrain.floorAt(c.x, c.z);
    c.y = c.ground + (fill ? Math.random() : 1) * TOP + 2;
    c.landed = -1;
    c.spin = 4 + Math.random() * 8;
    c.tilt = Math.random() * Math.PI;
    c.phase = Math.random() * 10;
    c.live = true;
  }

  // Remove a coin someone picked up; it comes back at the top.
  take(c, byPlayer) {
    c.live = false;
    if (byPlayer) {
      addCoins(RAIN_WORTH);
      if (this.chimeIn <= 0) {
        chime();
        this.chimeIn = 0.06;
      }
    }
  }

  // Returns how many coins the player picked up this frame.
  update(dt, time, player, alive) {
    this.chimeIn -= dt;
    this.check -= dt;
    if (this.check <= 0) {
      this.density = this.zone(player.pos);
      this.check = 0.25;
    }
    const want = Math.round(MAX * this.density);
    const pos = player.pos;
    const vel = player.vel;
    let gained = 0;
    let n = 0;
    this.active.length = 0;
    for (let i = 0; i < want; i++) {
      const c = this.coins[i];
      const far = Math.abs(c.x - pos.x) > BOX * 1.6 || Math.abs(c.z - pos.z) > BOX * 1.6;
      if (!c.live || far || (c.landed >= 0 && time - c.landed > REST)) this.spawn(c, pos, vel, !c.live && i >= this.prevWant);
      if (c.landed < 0) {
        c.y -= FALL * dt;
        if (c.y <= c.ground + 0.35) {
          c.y = c.ground + 0.35;
          c.landed = time;
        }
      }
      if (alive && Math.abs(c.x - pos.x) < PICK && Math.abs(c.z - pos.z) < PICK && Math.abs(c.y - pos.y) < PICK + 1) {
        this.take(c, true);
        gained++;
        continue;
      }
      this.active.push(c);
      const flat = c.landed >= 0;
      e.set(flat ? Math.PI / 2 + 0.15 : c.tilt + time * 1.3, flat ? c.phase : time * c.spin + c.phase, 0);
      q.setFromEuler(e);
      p.set(c.x + (flat ? 0 : Math.sin(time * 2 + c.phase) * 0.6), c.y, c.z);
      this.mesh.setMatrixAt(n++, m4.compose(p, q, one));
    }
    // Coins past the wanted count go dark and respawn fresh when the rain thickens.
    for (let i = want; i < this.prevWant; i++) this.coins[i].live = false;
    this.prevWant = want;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    return gained;
  }
}
