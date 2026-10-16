import * as THREE from 'three';
import { Bike } from './bike.js';
import { Player } from './player.js';
import { buildAnimalRider, SPECIES } from './riders/animals.js';
import { LEVEL } from './levels.js';
import { lavaAt } from './lava.js';
import { crash } from './sound.js';
import { TEAM_COLOR, FRIEND, FOE } from './teams.js';
import { AIR, GUN } from './weapons.js';

// Animal rivals racing alongside the player on the same hover-bikes. Each one drives a
// Player of its own through a fake input, so the hover, slopes and colliders are the
// player's. They hold a loose pack around the player: a slot ahead or behind and to one
// side that drifts over time, steering around props and boosting to catch up. A rival
// that falls far behind, drops into an abyss or dies respawns out of sight behind the
// player. Bikes that touch push apart and bounce, and a hard hit plays a loud crash.

const LINEUP = {
  desert: ['fox', 'shiba', 'rabbit', 'pig', 'tiger'],
  rainforest: ['frog', 'tiger', 'koala', 'panda', 'otter'],
  grassland: ['rabbit', 'bear', 'shiba', 'pig', 'koala'],
  snow: ['penguin', 'polarBear', 'arcticFox', 'rabbit', 'panda'],
  volcano: ['tiger', 'shiba', 'bear', 'frog', 'fox'],
  ocean: ['penguin', 'otter', 'frog', 'pig', 'shiba'],
  jail: ['fox', 'shiba', 'rabbit', 'pig', 'tiger'],
  penalty: ['fox', 'shiba', 'rabbit', 'pig', 'tiger'],
}[LEVEL.id];

const VEINS = [
  new THREE.Color(2.6, 0.9, 0.2), new THREE.Color(0.4, 2.6, 0.6), new THREE.Color(2.6, 2.2, 0.3),
  new THREE.Color(0.3, 1.8, 2.8), new THREE.Color(2.6, 0.4, 1.4),
];
// Start grid beside and behind the player: [left, ahead] in metres.
const GRID = [[5, -3], [-5, -3], [9, -10], [-9, -10], [0, -14]];

const BIKE_R = 1.5; // bikes touch when their centers are 2 * BIKE_R apart
const BIKE_H = 2.2;
const RESTITUTION = 0.45;
const LOST = 320; // metres from the player before a rival respawns
const HEAR = 140; // crashes past this distance from the camera are silent

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

class AiInput {
  constructor() {
    this.pad = { throttle: 0, brake: 0, steer: 0, boost: false, lookX: 0, lookY: 0 };
    this.jump = false;
  }
  down() {
    return false;
  }
  hit(code) {
    return code === 'Space' && this.jump;
  }
}

export class Rivals {
  constructor(scene, terrain, player, dust) {
    this.terrain = terrain;
    this.player = player;
    this.dust = dust;
    this.cooldown = new Map();
    this.list = LINEUP.map((id, i) => {
      const team = i < 2 ? FRIEND : FOE; // two friends, three foes
      const bike = new Bike({ rider: buildAnimalRider(SPECIES[id]), veinColor: VEINS[i % VEINS.length], lights: false, flag: TEAM_COLOR[team] });
      scene.add(bike.root);
      return {
        id,
        name: SPECIES[id].name,
        bike,
        body: new Player(),
        input: new AiInput(),
        lane: GRID[i][0] * 0.8 + (Math.random() - 0.5) * 3,
        lead: 10 + Math.random() * 25,
        freq: 0.05 + Math.random() * 0.08,
        phase: Math.random() * 10,
        skill: 0.85 + Math.random() * 0.25,
        grid: GRID[i],
        team,
        active: true, // on this level (the war moves riders between levels)
        fireIn: 2 + Math.random() * 4,
        tgt: { id: 1 + i, team, x: 0, y: 0, z: 0, gone: false, group: 'rivals', index: i },
      };
    });
    this.weapons = null; // set by the caller
    this.regroup();
  }

  setActive(i, on) {
    const r = this.list[i];
    r.active = on;
    r.bike.root.visible = on;
    if (on) this.respawn(r);
  }

  // Shot targets for the rivals on this level.
  targets(out) {
    for (const r of this.list) {
      if (!r.active) continue;
      const t = r.tgt;
      t.x = r.body.pos.x;
      t.y = r.body.pos.y;
      t.z = r.body.pos.z;
      t.gone = false;
      out.push(t);
    }
  }

  // The closest rival of a team between min and range from a point: { x, z, d } or null.
  nearest(team, pos, range, min = 0) {
    let best = null;
    for (const r of this.list) {
      if (r.team !== team || !r.active) continue;
      const d = Math.hypot(r.body.pos.x - pos.x, r.body.pos.z - pos.z);
      if (d < range && d >= min && (!best || d < best.d)) best = { x: r.body.pos.x, z: r.body.pos.z, d };
    }
    return best;
  }

  // Back to the start grid around the player, facing the player's heading.
  regroup() {
    const p = this.player;
    for (const r of this.list) this.place(r, p.pos, p.yaw, r.grid[0], r.grid[1]);
  }

  place(r, origin, yaw, left, ahead, vel = null) {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const x = origin.x + Math.cos(yaw) * left + fx * ahead;
    const z = origin.z - Math.sin(yaw) * left + fz * ahead;
    const b = r.body;
    b.pos.set(x, this.terrain.floorAt(x, z) + 1, z);
    b.vel.set(vel ? vel.x : 0, 0, vel ? vel.z : 0);
    b.yaw = yaw;
    b.yawRate = 0;
    b.energy = 1;
    b.bump = 0;
  }

  // Out of sight behind the player, in its lane, matching the player's speed.
  respawn(r) {
    const p = this.player;
    for (let k = 0; k < 6; k++) {
      this.place(r, p.pos, p.yaw, r.lane + (k ? (Math.random() - 0.5) * 30 : 0), -70 - Math.random() * 40, p.vel);
      if (!this.deadly(r.body)) break;
    }
  }

  deadly(b) {
    if (LEVEL.lava && b.gap < 2.5 && lavaAt(b.pos.x, b.pos.z) > 0.5) return true;
    return LEVEL.sea != null && this.terrain.hazardHit(b.pos);
  }

  puff(b) {
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 6;
      this.dust.emit(b.pos.x, b.pos.y, b.pos.z, Math.cos(a) * sp, 2 + Math.random() * 5, Math.sin(a) * sp, 1.5 + Math.random() * 2, 1 + Math.random());
    }
  }

  drive(r, time, colliders) {
    const p = this.player;
    const b = r.body;
    const pf = p.forward;
    const plx = Math.cos(p.yaw);
    const plz = -Math.sin(p.yaw);
    // The slot this rival is aiming for drifts ahead and behind the player.
    const lead = r.lead + Math.sin(time * r.freq * Math.PI * 2 + r.phase) * 25;
    const tx = p.pos.x + pf.x * lead + plx * r.lane;
    const tz = p.pos.z + pf.z * lead + plz * r.lane;
    const dx = tx - b.pos.x;
    const dz = tz - b.pos.z;
    const dist = Math.hypot(dx, dz);
    const fx = Math.sin(b.yaw);
    const fz = Math.cos(b.yaw);
    const lx = Math.cos(b.yaw);
    const lz = -Math.sin(b.yaw);

    // In the slot, ride with the player; otherwise head for the slot.
    let diff = dist < 8 && p.speed > 5 ? wrap(p.yaw - b.yaw) : wrap(Math.atan2(dx, dz) - b.yaw);

    // Swerve around props in the way.
    let avoid = 0;
    for (const c of colliders) {
      if (b.pos.y > c.top + 0.5) continue;
      const rx = c.x - b.pos.x;
      const rz = c.z - b.pos.z;
      const f = rx * fx + rz * fz;
      if (f < 0 || f > 22) continue;
      const side = rx * lx + rz * lz;
      if (Math.abs(side) > c.r + 2.8) continue;
      avoid += (side > 0 ? -1 : 1) * (1 - f / 22) * 2.5;
    }
    const pad = r.input.pad;
    pad.steer = THREE.MathUtils.clamp(diff * 2.4 + avoid, -1, 1);

    const along = dx * fx + dz * fz;
    pad.throttle = THREE.MathUtils.clamp((0.35 + along / 14) * r.skill, 0, 1) * (Math.abs(diff) > 1.6 ? 0.5 : 1);
    pad.brake = along < -6 && b.speed > p.speed + 4 ? 0.6 : 0;
    pad.boost = along > 35 && b.energy > 0.3;
    // Hop lava channels ahead.
    r.input.jump = !!LEVEL.lava && lavaAt(b.pos.x + fx * 9, b.pos.z + fz * 9) > 0.5 && !b.airborne;
  }

  update(dt, time, cameraPos, playerAlive) {
    const p = this.player;
    const floorAt = (x, z, n) => this.terrain.floorAt(x, z, n);
    for (const r of this.list) {
      if (!r.active) continue;
      const b = r.body;
      const colliders = this.terrain.collidersNear(b.pos.x, b.pos.z);
      this.drive(r, time, colliders);
      for (let i = 0; i < 2; i++) {
        b.update(dt / 2, r.input, colliders, floorAt);
        r.input.jump = false;
      }
      const far = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z) > LOST || b.pos.y < p.pos.y - 80;
      if (this.deadly(b)) {
        this.puff(b);
        this.respawn(r);
      } else if (far) {
        this.respawn(r);
      }
      if (b.bump > 10) this.bang(b.bump / 30, b.pos, cameraPos);
      b.bump = 0;
      this.shoot(r, dt, playerAlive);
    }

    this.collide(dt, cameraPos, playerAlive);

    for (const r of this.list) {
      if (!r.active) continue;
      const b = r.body;
      const bike = r.bike;
      bike.root.position.copy(b.pos);
      bike.root.rotation.y = b.yaw;
      bike.tilt.rotation.set(b.pitch, 0, b.lean, 'YXZ');
      bike.tilt.position.y = -0.35 + Math.sin(time * 3.1 + r.phase) * 0.05 * (1 - Math.min(b.speed / 30, 1));
      const near = b.pos.distanceToSquared(cameraPos) < 500 * 500;
      bike.root.visible = near;
      if (near) bike.update(dt, time, { throttle: b.throttle, boost: b.boost, speed: b.speed, lean: b.lean });
    }
  }

  // Bikes are upright cylinders. Overlapping pairs split the overlap and trade the
  // closing speed along the line between them, with a little bounce.
  // Foes of the player shoot at it when it is ahead and close; everyone fires wild now
  // and then.
  shoot(r, dt, playerAlive) {
    r.fireIn -= dt;
    if (!this.weapons || r.fireIn > 0) return;
    r.fireIn = 2 + Math.random() * 4;
    const b = r.body;
    const p = this.player;
    let aim = null;
    if (playerAlive && r.team !== FRIEND) {
      const bearing = Math.atan2(p.pos.x - b.pos.x, p.pos.z - b.pos.z);
      const off = wrap(bearing - b.yaw);
      if (Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z) < 70 && Math.abs(off) < 0.4) aim = bearing;
    }
    if (aim == null && Math.random() > 0.4) return;
    const kind = Math.random() < 0.4 ? AIR : GUN;
    this.weapons.fire(kind, r.tgt.id, r.team, b.pos.x, b.pos.y + 1.2, b.pos.z, (aim ?? b.yaw) + (Math.random() - 0.5) * 0.6);
  }

  collide(dt, cameraPos, playerAlive) {
    const bodies = this.list.filter((r) => r.active).map((r) => r.body);
    if (playerAlive) bodies.push(this.player);
    for (const [k, t] of this.cooldown) {
      if (t - dt <= 0) this.cooldown.delete(k);
      else this.cooldown.set(k, t - dt);
    }
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        if (Math.abs(a.pos.y - b.pos.y) > BIKE_H) continue;
        const dx = a.pos.x - b.pos.x;
        const dz = a.pos.z - b.pos.z;
        const d2 = dx * dx + dz * dz;
        const min = BIKE_R * 2;
        if (d2 > min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        const push = (min - d) / 2;
        a.pos.x += nx * push;
        a.pos.z += nz * push;
        b.pos.x -= nx * push;
        b.pos.z -= nz * push;
        const closing = (a.vel.x - b.vel.x) * nx + (a.vel.z - b.vel.z) * nz;
        if (closing >= 0) continue;
        const jn = (-(1 + RESTITUTION) * closing) / 2;
        a.vel.x += nx * jn;
        a.vel.z += nz * jn;
        b.vel.x -= nx * jn;
        b.vel.z -= nz * jn;
        const hit = -closing;
        for (const body of [a, b]) body.landImpact = Math.max(body.landImpact, Math.min(1, hit / 18));
        const key = i + ',' + j;
        if (hit > 3 && !this.cooldown.has(key)) {
          this.cooldown.set(key, 0.35);
          this.bang(0.3 + hit / 20, a.pos, cameraPos);
        }
      }
    }
  }

  bang(strength, pos, cameraPos) {
    const fade = 1 - Math.min(pos.distanceTo(cameraPos) / HEAR, 1);
    crash(Math.min(strength, 1) * fade);
  }
}
