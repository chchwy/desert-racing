import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt } from './terrain.js';
import { SPECIES } from './riders/animals.js';
import { crash } from './sound.js';
import { AIR, GUN } from './weapons.js';
import { flagParts, FLAG_MOUNT, TEAM_COLOR, FRIEND, FOE } from './teams.js';

// A swarm of hover-bikes ridden by animals, hundreds to thousands of them, around the
// player. Each is a simplified bike-and-rider drawn with one InstancedMesh (plus one for
// the glowing nozzles, sharing the same instance matrices), and moves kinematically:
// it hovers over heightAt and steers toward a goal that changes every few seconds.
// Goals: circle the player, roam at random, chase the player, or go pick up a coin
// from the coin rain. Bikes that stray past FAR respawn around the player. They do not
// hit props or each other; they do bump the player, with the crash sound.
// `friends` of them are on the player's team: red flags, and they keep closer, circling
// the player more often. The rest fly blue. A third InstancedMesh draws the flags.
//
// Locked up (the jail, the penalty jail), a rider gets a box: a pen or a room it stays
// inside. Boxed riders keep under `speedCap`, roam and pick up the coins that land in
// their box (`coinSources`), and fire like everyone else. Thirty coins and `onBail(i)`
// fires; now and then one speeds anyway and `onSpeed(i)` fires.

const FAR = 420; // metres from the player before a bike respawns
const SPAWN_MIN = 60;
const SPAWN_MAX = 380;
const HOVER = 1.1;
const TURN = 1.8; // rad/s
const HIT_R = 2.8; // player-to-bike contact distance
const NEAR = 140; // within this of the camera, ground height every frame
const SLICES = 6; // farther bikes refresh their ground height one slice per frame

// Rider states: not on this level, driving, or parked in a jail pen.
export const OFF = 0;
export const DRIVE = 1;
export const PARKED = 2;

// Firing: every few seconds a rider shoots. Foes of the player shoot at it when it is
// ahead and in range; otherwise a share of riders fire straight ahead at whatever.
const FIRE_MIN = 4;
const FIRE_SPAN = 8;
const AIM_RANGE = 70;
const AIM_CONE = 0.4;
const AIM_ERROR = 0.45;
const WILD = 0.15;
const AIM_CHANCE = 0.25; // a foe that has the player in its sights takes the shot this often

const ORBIT = 0;
const ROAM = 1;
const CHASE = 2;
const COIN = 3;

function part(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Bike frame: +Z forward, +Y up, +X left. Vertex colors near white take the rider's fur
// color from the instance color; the dark hull stays dark under any tint.
function bikeGeometry() {
  const hull = 0x2a2a34;
  const parts = [];
  const add = (geo, color, p, r = [0, 0, 0], s = [1, 1, 1]) => {
    geo.scale(...s);
    geo.rotateX(r[0]);
    geo.rotateY(r[1]);
    geo.rotateZ(r[2]);
    geo.translate(...p);
    parts.push(part(geo, color));
  };
  add(new THREE.CapsuleGeometry(0.5, 2.0, 4, 10), hull, [0, 0.55, 0.1], [Math.PI / 2, 0, 0], [0.85, 1, 0.7]);
  add(new THREE.ConeGeometry(0.16, 1.8, 6), hull, [0, 0.55, 1.9], [Math.PI / 2, 0, 0]);
  for (const sx of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.62, 0.55, 1.7, 12), hull, [sx * 1.15, 0.7, -0.3], [Math.PI / 2, 0, 0]);
    add(new THREE.BoxGeometry(0.6, 0.18, 0.5), hull, [sx * 0.7, 0.62, -0.3]);
  }
  // Rider: body, head, ears, muzzle, eyes, arms.
  add(new THREE.SphereGeometry(0.34, 10, 8), 0xffffff, [0, 1.35, -0.15], [0.5, 0, 0], [1, 1.25, 0.9]);
  add(new THREE.SphereGeometry(0.3, 10, 8), 0xffffff, [0, 1.92, 0.22]);
  for (const sx of [-1, 1]) {
    add(new THREE.ConeGeometry(0.1, 0.24, 6), 0xffffff, [sx * 0.17, 2.2, 0.18], [0, 0, -sx * 0.3]);
    add(new THREE.SphereGeometry(0.055, 6, 4), 0x111114, [sx * 0.12, 1.98, 0.48]);
    add(new THREE.CapsuleGeometry(0.07, 0.55, 3, 6), 0xffffff, [sx * 0.3, 1.25, 0.45], [1.1, 0, 0]);
  }
  add(new THREE.SphereGeometry(0.13, 8, 6), 0xf2ebe0, [0, 1.84, 0.46], [0, 0, 0], [1, 0.8, 1]);
  return mergeGeometries(parts);
}

function glowGeometry() {
  const parts = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.CircleGeometry(0.47, 14);
    g.rotateY(Math.PI); // face backward (-Z)
    g.translate(sx * 1.15, 0.7, -1.17);
    g.deleteAttribute('uv');
    parts.push(g);
  }
  return mergeGeometries(parts);
}

const FURS = Object.values(SPECIES).map((s) => new THREE.Color(s.fur));

function flagGeometry() {
  const g = mergeGeometries(flagParts());
  g.translate(FLAG_MOUNT.x, FLAG_MOUNT.y, FLAG_MOUNT.z);
  return g;
}

export class Swarm {
  constructor(scene, count, player, coinRain, friends = Math.floor(count / 2)) {
    this.n = count;
    this.player = player;
    this.coinRain = coinRain;
    const n = count;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.z = new Float32Array(n);
    this.ground = new Float32Array(n);
    this.yaw = new Float32Array(n);
    this.rate = new Float32Array(n);
    this.speed = new Float32Array(n);
    this.cruise = new Float32Array(n);
    this.mode = new Uint8Array(n);
    this.timer = new Float32Array(n);
    this.orbitR = new Float32Array(n);
    this.orbitDir = new Float32Array(n);
    this.orbitA = new Float32Array(n);
    this.coin = new Array(n).fill(null);
    this.team = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.team[i] = i < friends ? FRIEND : FOE;
    this.state = new Uint8Array(n).fill(DRIVE);
    this.fireIn = new Float32Array(n);
    for (let i = 0; i < n; i++) this.fireIn[i] = 1 + Math.random() * FIRE_SPAN;
    this.weapons = null; // set by the caller
    this.idBase = 0; // war id of rider 0
    this.tgt = Array.from({ length: n }, (_, i) => ({ id: 0, team: 0, x: 0, y: 0, z: 0, gone: false, group: 'swarm', index: i }));
    this.box = new Array(n).fill(null); // { x0, x1, z0, z1 } for a locked-up rider
    this.bail = new Uint8Array(n); // coins picked up toward bail
    this.crying = new Uint8Array(n); // losers in the arena, after a war is won
    this.speedCap = Infinity;
    this.coinSources = []; // [{ box, src }]: src has `coins` (live list) and take(coin)
    this.onBail = null;
    this.onSpeed = null;
    this.slice = 0;
    this.hitCooldown = 0;

    this.mesh = new THREE.InstancedMesh(
      bikeGeometry(),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.3 }),
      n,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.glow = new THREE.InstancedMesh(glowGeometry(), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 2.4, 3.2) }), n);
    this.glow.instanceMatrix = this.mesh.instanceMatrix; // same transforms
    this.glow.frustumCulled = false;
    this.flags = new THREE.InstancedMesh(
      flagGeometry(),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }),
      n,
    );
    this.flags.instanceMatrix = this.mesh.instanceMatrix;
    this.flags.frustumCulled = false;
    for (let i = 0; i < n; i++) {
      this.mesh.setColorAt(i, FURS[i % FURS.length]);
      this.flags.setColorAt(i, TEAM_COLOR[this.team[i]]);
      this.spawn(i, true);
    }
    scene.add(this.mesh, this.glow, this.flags);
  }

  spawn(i, anywhere) {
    const p = this.player.pos;
    const a = Math.random() * Math.PI * 2;
    const r = anywhere ? 8 + Math.sqrt(Math.random()) * SPAWN_MAX : SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
    this.x[i] = p.x + Math.cos(a) * r;
    this.z[i] = p.z + Math.sin(a) * r;
    this.ground[i] = heightAt(this.x[i], this.z[i]);
    this.y[i] = this.ground[i] + HOVER;
    this.yaw[i] = Math.random() * Math.PI * 2;
    this.cruise[i] = 22 + Math.random() * 40;
    this.speed[i] = this.cruise[i] * 0.6;
    this.pick(i);
  }

  // The coin source whose box holds rider i, if any.
  sourceFor(i) {
    for (const cs of this.coinSources) {
      const b = cs.box;
      if (this.x[i] >= b.x0 && this.x[i] <= b.x1 && this.z[i] >= b.z0 && this.z[i] <= b.z1) return cs.src;
    }
    return null;
  }

  // Lock rider i in a box, placed at a random spot inside it.
  confine(i, box) {
    this.box[i] = box;
    this.bail[i] = 0;
    this.x[i] = box.x0 + Math.random() * (box.x1 - box.x0);
    this.z[i] = box.z0 + Math.random() * (box.z1 - box.z0);
    this.ground[i] = heightAt(this.x[i], this.z[i]);
    this.y[i] = this.ground[i] + HOVER;
    this.pick(i);
  }

  pick(i) {
    if (this.box[i]) {
      // Locked up: wander the box, or go for a coin that landed in it.
      this.timer[i] = 3 + Math.random() * 5;
      this.mode[i] = ROAM;
      this.coin[i] = null;
      const src = this.sourceFor(i);
      const b = this.box[i];
      if (src && src.coins.length && Math.random() < 0.7) {
        // A few random tries for a coin inside this rider's own box.
        for (let k = 0; k < 12; k++) {
          const c = src.coins[Math.floor(Math.random() * src.coins.length)];
          if (c.x >= b.x0 && c.x <= b.x1 && c.z >= b.z0 && c.z <= b.z1) {
            this.coin[i] = c;
            this.mode[i] = COIN;
            break;
          }
        }
      }
      return;
    }
    const friend = this.team[i] === FRIEND;
    const roll = Math.random();
    // Friends mostly ride with the player; foes roam, chase and grab coins more.
    this.mode[i] = friend
      ? (roll < 0.65 ? ORBIT : roll < 0.85 ? ROAM : COIN)
      : (roll < 0.35 ? ORBIT : roll < 0.65 ? ROAM : roll < 0.8 ? CHASE : COIN);
    this.timer[i] = 4 + Math.random() * 8;
    this.orbitR[i] = friend ? 10 + Math.random() * 50 : 12 + Math.random() * 110;
    this.orbitDir[i] = Math.random() < 0.5 ? -1 : 1;
    this.orbitA[i] = Math.atan2(this.z[i] - this.player.pos.z, this.x[i] - this.player.pos.x);
    this.coin[i] = null;
    if (this.mode[i] === COIN) {
      const list = this.coinRain?.active;
      if (list && list.length) this.coin[i] = list[Math.floor(Math.random() * list.length)];
      else this.mode[i] = ROAM;
    }
  }

  setState(i, state, park = null) {
    this.state[i] = state;
    const k = i * 16;
    const arr = this.mesh.instanceMatrix.array;
    if (state === DRIVE) this.spawn(i, false);
    if (state === OFF) {
      arr.fill(0, k, k + 16);
    } else if (state === PARKED && park) {
      this.x[i] = park.x;
      this.z[i] = park.z;
      this.y[i] = heightAt(park.x, park.z) + HOVER;
      this.yaw[i] = park.yaw;
      this.writeMatrix(i, 0);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  writeMatrix(i, lean) {
    const arr = this.mesh.instanceMatrix.array;
    const s = Math.sin(this.yaw[i]);
    const c = Math.cos(this.yaw[i]);
    const cl = Math.cos(lean);
    const sl = Math.sin(lean);
    const k = i * 16;
    arr[k] = c * cl; arr[k + 1] = sl; arr[k + 2] = -s * cl; arr[k + 3] = 0;
    arr[k + 4] = -c * sl; arr[k + 5] = cl; arr[k + 6] = s * sl; arr[k + 7] = 0;
    arr[k + 8] = s; arr[k + 9] = 0; arr[k + 10] = c; arr[k + 11] = 0;
    arr[k + 12] = this.x[i]; arr[k + 13] = this.y[i]; arr[k + 14] = this.z[i]; arr[k + 15] = 1;
  }

  // Shot targets for the driving riders, reused objects.
  targets(out) {
    for (let i = 0; i < this.n; i++) {
      if (this.state[i] !== DRIVE) continue;
      const t = this.tgt[i];
      t.id = this.idBase + i;
      t.team = this.team[i];
      t.x = this.x[i];
      t.y = this.y[i];
      t.z = this.z[i];
      t.gone = false;
      out.push(t);
    }
  }

  // The closest driving bike of a team between min and range from a point: { x, z, d } or null.
  nearest(team, pos, range, min = 0) {
    let bi = -1;
    let bd2 = range * range;
    const min2 = min * min;
    for (let i = 0; i < this.n; i++) {
      if (this.team[i] !== team || this.state[i] !== DRIVE) continue;
      const dx = this.x[i] - pos.x;
      const dz = this.z[i] - pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bd2 && d2 >= min2) {
        bd2 = d2;
        bi = i;
      }
    }
    return bi < 0 ? null : { x: this.x[bi], z: this.z[bi], d: Math.sqrt(bd2) };
  }

  update(dt, time, cameraPos, playerAlive) {
    const n = this.n;
    const p = this.player;
    this.slice = (this.slice + 1) % SLICES;
    this.hitCooldown -= dt;
    for (let i = 0; i < n; i++) {
      if (this.state[i] !== DRIVE) continue;
      let x = this.x[i];
      let z = this.z[i];
      const dpx = x - p.pos.x;
      const dpz = z - p.pos.z;
      const box = this.box[i];
      if (!box && dpx * dpx + dpz * dpz > FAR * FAR) {
        this.spawn(i, false);
        x = this.x[i];
        z = this.z[i];
      }
      this.timer[i] -= dt;
      if (this.timer[i] <= 0) this.pick(i);

      // Goal heading.
      let want = this.yaw[i];
      let speed = this.cruise[i];
      const mode = this.mode[i];
      if (mode === ORBIT) {
        this.orbitA[i] += (this.orbitDir[i] * this.cruise[i] * dt) / this.orbitR[i];
        const tx = p.pos.x + Math.cos(this.orbitA[i]) * this.orbitR[i] + p.vel.x * 0.8;
        const tz = p.pos.z + Math.sin(this.orbitA[i]) * this.orbitR[i] + p.vel.z * 0.8;
        want = Math.atan2(tx - x, tz - z);
        speed = Math.max(this.cruise[i], p.speed * 1.1);
      } else if (mode === ROAM) {
        want = this.yaw[i] + Math.sin(time * 0.7 + i) * 0.8;
      } else if (mode === CHASE) {
        want = Math.atan2(p.pos.x + p.vel.x * 0.5 - x, p.pos.z + p.vel.z * 0.5 - z);
        speed = Math.max(this.cruise[i], p.speed + 8);
      } else {
        const c = this.coin[i];
        if (!c || !c.live) {
          this.pick(i);
        } else {
          const cx = c.x - x;
          const cz = c.z - z;
          want = Math.atan2(cx, cz);
          if (cx * cx + cz * cz < 2.5 * 2.5 && Math.abs(c.y - this.y[i]) < 4) {
            if (box) {
              const src = this.sourceFor(i);
              const got = src ? src.take(c) : 0;
              this.bail[i] = Math.min(255, this.bail[i] + got);
              if (this.bail[i] >= 30 && this.onBail) {
                this.pick(i);
                this.onBail(i);
                continue;
              }
            } else {
              this.coinRain.take(c, false);
            }
            this.pick(i);
          }
        }
      }
      let diff = want - this.yaw[i];
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const rate = THREE.MathUtils.clamp(diff * 3, -TURN, TURN);
      this.rate[i] += (rate - this.rate[i]) * Math.min(1, dt * 5);
      this.yaw[i] += this.rate[i] * dt;
      this.speed[i] += (speed - this.speed[i]) * Math.min(1, dt * 0.8);
      if (box) this.speed[i] = Math.min(this.speed[i], this.speedCap * 0.85);
      const s = Math.sin(this.yaw[i]);
      const c = Math.cos(this.yaw[i]);
      x += s * this.speed[i] * dt;
      z += c * this.speed[i] * dt;
      if (box) {
        // Walls: stay in the box, turning back toward its middle at an edge.
        if (x < box.x0 || x > box.x1 || z < box.z0 || z > box.z1) {
          x = THREE.MathUtils.clamp(x, box.x0, box.x1);
          z = THREE.MathUtils.clamp(z, box.z0, box.z1);
          this.yaw[i] = Math.atan2((box.x0 + box.x1) / 2 - x, (box.z0 + box.z1) / 2 - z);
        }
        // Rules are the same for everyone: now and then a locked-up rider speeds.
        if (this.onSpeed && Math.random() < dt * 0.0005) {
          this.onSpeed(i);
          continue;
        }
      }

      // Hover: ground every frame near the camera, a slice at a time farther out.
      const dcx = x - cameraPos.x;
      const dcz = z - cameraPos.z;
      if (dcx * dcx + dcz * dcz < NEAR * NEAR || i % SLICES === this.slice) this.ground[i] = heightAt(x, z);
      const yTarget = this.ground[i] + HOVER + Math.sin(time * 3 + i) * 0.08;
      this.y[i] += (yTarget - this.y[i]) * Math.min(1, dt * 10);
      if (this.y[i] < this.ground[i] + 0.4) this.y[i] = this.ground[i] + 0.4;

      // Bump the player.
      if (playerAlive) {
        const bx = x - p.pos.x;
        const bz = z - p.pos.z;
        const d2 = bx * bx + bz * bz;
        if (d2 < HIT_R * HIT_R && d2 > 1e-6 && Math.abs(this.y[i] - p.pos.y) < 2.2) {
          const d = Math.sqrt(d2);
          const nx = bx / d;
          const nz = bz / d;
          const push = HIT_R - d;
          x += nx * push * 0.5;
          z += nz * push * 0.5;
          p.pos.x -= nx * push * 0.5;
          p.pos.z -= nz * push * 0.5;
          const closing = (s * this.speed[i] - p.vel.x) * nx + (c * this.speed[i] - p.vel.z) * nz;
          if (closing < 0) {
            p.vel.x += nx * closing * 0.7;
            p.vel.z += nz * closing * 0.7;
            this.speed[i] *= 0.5;
            this.yaw[i] += (Math.random() - 0.5) * 1.5;
            p.landImpact = Math.max(p.landImpact, Math.min(1, -closing / 18));
            p.shoved = 1.5; // speed from a shove is not speeding
            if (-closing > 3 && this.hitCooldown <= 0) {
              crash(0.3 + -closing / 20);
              this.hitCooldown = 0.3;
            }
          }
        }
      }
      this.x[i] = x;
      this.z[i] = z;

      // Fire: at the player when it is a foe ahead and in range, else now and then wild.
      this.fireIn[i] -= dt;
      if (this.weapons && this.fireIn[i] <= 0) {
        this.fireIn[i] = FIRE_MIN + Math.random() * FIRE_SPAN;
        let aim = null;
        if (playerAlive && this.team[i] !== FRIEND && Math.random() < AIM_CHANCE) {
          const ax = p.pos.x - x;
          const az = p.pos.z - z;
          if (ax * ax + az * az < AIM_RANGE * AIM_RANGE) {
            const bearing = Math.atan2(ax, az);
            const off = Math.atan2(Math.sin(bearing - this.yaw[i]), Math.cos(bearing - this.yaw[i]));
            if (Math.abs(off) < AIM_CONE) aim = bearing;
          }
        }
        if (aim != null || Math.random() < WILD) {
          const kind = Math.random() < 0.4 ? AIR : GUN;
          this.weapons.fire(kind, this.idBase + i, this.team[i], x, this.y[i] + 1.2, z, (aim ?? this.yaw[i]) + (Math.random() - 0.5) * 2 * AIM_ERROR);
        }
      }

      // Instance matrix: yaw, then a lean into the turn. Column-major.
      this.writeMatrix(i, THREE.MathUtils.clamp(-this.rate[i] * this.speed[i] * 0.03, -0.6, 0.6));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
