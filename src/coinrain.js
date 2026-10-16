import * as THREE from 'three';
import { COIN_R, coinsNear, addCoins } from './coins.js';
import { chime } from './sound.js';

// Coin rain around the big discs. Within ZONE of a disc's center (collected or not, so
// the whole trail corridor rains), small gold coins tumble out of the sky in a box
// around the bike, denser closer to a disc, lie on the ground a few seconds, and are
// recycled to the top. Each one the bike touches adds RAIN_WORTH to the counter.
// Others may take them too (take()); `active` lists the ones in the air or on the ground.
// Every few seconds a burst drops a dense column of coins just ahead of the bike, and
// one coin in JACKPOT_SHARE is a big glowing jackpot coin worth JACKPOT_WORTH.

const MAX = 3000;
const ZONE = COIN_R + 500; // metres from a disc center where it rains
const FADE = 300; // the rain thins over the last stretch of the zone
const BOX = 65; // half-width of the rain box around the bike
const TOP = 70; // spawn height above the ground
const FALL = 12; // m/s, slowest
const FALL_SPAN = 16; // up to FALL + FALL_SPAN
const BURST = 250; // coins in a burst
const BURST_R = 14;
const BURST_MIN = 6; // seconds between bursts
const BURST_SPAN = 4;
const JACKPOT_SHARE = 0.05;
export const JACKPOT_WORTH = 1000;
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
const two = new THREE.Vector3(2, 2, 2);
const PLAIN = new THREE.Color(1, 1, 1);
const JACKPOT = new THREE.Color(1.7, 1.25, 0.45); // past 1: the bloom makes it shine
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
      x: 0, y: 0, z: 0, ground: 0, landed: -1, spin: 0, tilt: 0, phase: 0, live: false, fall: FALL, jackpot: false,
    }));
    this.mesh.setColorAt(0, PLAIN);
    this.burstIn = 3;
    // The jail turns these on: rain only inside the pen, always at full density, and
    // every coin worth `worth` times as much.
    this.bounds = null; // { x0, x1, z0, z1 }
    this.full = false;
    this.worth = 1;
    this.burstAt = 0; // next coin index a burst takes over
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
    this.keepIn(c);
    c.ground = this.terrain.floorAt(c.x, c.z);
    c.y = c.ground + (fill ? Math.random() : 1) * TOP + 2;
    c.landed = -1;
    c.fall = FALL + Math.random() * FALL_SPAN;
    c.jackpot = Math.random() < JACKPOT_SHARE;
    c.spin = 4 + Math.random() * 8;
    c.tilt = Math.random() * Math.PI;
    c.phase = Math.random() * 10;
    c.live = true;
  }

  // A burst: a column of coins over a spot just ahead of the bike.
  burst(want, pos, vel) {
    const cx = pos.x + vel.x * 2.5 + (Math.random() - 0.5) * 30;
    const cz = pos.z + vel.z * 2.5 + (Math.random() - 0.5) * 30;
    const n = Math.min(BURST, want);
    for (let k = 0; k < n; k++) {
      const c = this.coins[this.burstAt];
      this.burstAt = (this.burstAt + 1) % Math.max(want, 1);
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * BURST_R;
      this.spawn(c, pos, vel, false);
      c.x = cx + Math.cos(a) * r;
      c.z = cz + Math.sin(a) * r;
      this.keepIn(c);
      c.ground = this.terrain.floorAt(c.x, c.z);
      c.y = c.ground + TOP * 0.6 + Math.random() * TOP;
      c.fall = FALL + FALL_SPAN * (0.5 + Math.random() * 0.5);
    }
  }

  // Inside the bounds, when there are any: a coin outside wraps to a random spot in them.
  keepIn(c) {
    const b = this.bounds;
    if (!b) return;
    if (c.x < b.x0 || c.x > b.x1) c.x = b.x0 + Math.random() * (b.x1 - b.x0);
    if (c.z < b.z0 || c.z > b.z1) c.z = b.z0 + Math.random() * (b.z1 - b.z0);
  }

  // Remove a coin someone picked up; it comes back at the top.
  take(c, byPlayer) {
    c.live = false;
    if (byPlayer) {
      addCoins((c.jackpot ? JACKPOT_WORTH : RAIN_WORTH) * this.worth);
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
      this.density = this.full ? 1 : this.zone(player.pos);
      this.check = 0.25;
    }
    const want = Math.round(MAX * this.density);
    const pos = player.pos;
    const vel = player.vel;
    let gained = 0;
    let n = 0;
    this.active.length = 0;
    this.burstIn -= dt;
    if (this.burstIn <= 0 && want > 0) {
      this.burst(want, pos, vel);
      this.burstIn = BURST_MIN + Math.random() * BURST_SPAN;
    }
    for (let i = 0; i < want; i++) {
      const c = this.coins[i];
      const far = Math.abs(c.x - pos.x) > BOX * 1.6 || Math.abs(c.z - pos.z) > BOX * 1.6;
      if (!c.live || far || (c.landed >= 0 && time - c.landed > REST)) this.spawn(c, pos, vel, !c.live && i >= this.prevWant);
      if (c.landed < 0) {
        c.y -= c.fall * dt;
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
      this.mesh.setColorAt(n, c.jackpot ? JACKPOT : PLAIN);
      this.mesh.setMatrixAt(n++, m4.compose(p, q, c.jackpot ? two : one));
    }
    // Coins past the wanted count go dark and respawn fresh when the rain thickens.
    for (let i = want; i < this.prevWant; i++) this.coins[i].live = false;
    this.prevWant = want;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    return gained;
  }
}
