import * as THREE from 'three';
import { heightAt, normalAt } from './terrain.js';
import { readGamepad } from './gamepad.js';

const G = 26;
const G_AIR = 34; // heavier when airborne so crest jumps stay readable
const HOVER = 0.9; // target gap above sand (m)
const FIELD = 4.5; // hover field reach (m)
const ACCEL = 26;
const BOOST_ACCEL = 42;
const VMAX = 58; // ~210 km/h
const VMAX_BOOST = 72; // ~260 km/h

const tmpN = new THREE.Vector3();

const PAD_IDLE = {
  throttle: 0,
  brake: 0,
  steer: 0,
  boost: false,
  lookX: 0,
  lookY: 0,
};

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.pad = { ...PAD_IDLE };
    this._padHeld = { jump: false, camera: false, reset: false };
    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }
  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }
  hit(code) {
    return this.pressed.has(code);
  }
  poll() {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    let chosen = null;
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      if (pad.mapping === 'standard') {
        chosen = pad;
        break;
      }
      if (!chosen) chosen = pad;
    }
    const snap = readGamepad(chosen);
    this.pad.throttle = snap.throttle;
    this.pad.brake = snap.brake;
    this.pad.steer = snap.steer;
    this.pad.boost = snap.boost;
    this.pad.lookX = snap.lookX;
    this.pad.lookY = snap.lookY;
    if (snap.jump && !this._padHeld.jump) this.pressed.add('Space');
    if (snap.camera && !this._padHeld.camera) this.pressed.add('KeyC');
    if (snap.reset && !this._padHeld.reset) this.pressed.add('KeyR');
    this._padHeld.jump = snap.jump;
    this._padHeld.camera = snap.camera;
    this._padHeld.reset = snap.reset;
  }
  endFrame() {
    this.pressed.clear();
  }
}

export class Player {
  constructor() {
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0.9;
    this.yawRate = 0;
    this.throttle = 0;
    this.boost = 0; // 0..1 visual boost amount
    this.energy = 1;
    this.lean = 0;
    this.pitch = 0;
    this.gap = HOVER;
    this.airborne = false;
    this.airTime = 0;
    this.landImpact = 0;
    this.jumpTimer = 0; // hover field is off briefly after a jump
    this.reset();
  }

  reset() {
    this.pos.set(0, heightAt(0, 0) + HOVER, 0);
    this.vel.set(0, 0, 0);
    this.yawRate = 0;
    this.energy = 1;
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  update(dt, input, colliders) {
    const pad = input.pad ?? PAD_IDLE;
    const fwdIn = Math.max(input.down('KeyW', 'ArrowUp') ? 1 : 0, pad.throttle);
    const back = Math.max(input.down('KeyS', 'ArrowDown') ? 1 : 0, pad.brake);
    const keySteer = (input.down('KeyA', 'ArrowLeft') ? 1 : 0) - (input.down('KeyD', 'ArrowRight') ? 1 : 0);
    const steer = THREE.MathUtils.clamp(keySteer + pad.steer, -1, 1);
    const wantBoost = (input.down('ShiftLeft', 'ShiftRight') || pad.boost) && fwdIn > 0.15 && this.energy > 0.02;

    // boost energy
    if (wantBoost) this.energy = Math.max(0, this.energy - dt * 0.28);
    else this.energy = Math.min(1, this.energy + dt * 0.12);
    this.boost = THREE.MathUtils.damp(this.boost, wantBoost ? 1 : 0, 6, dt);
    this.throttle = THREE.MathUtils.damp(this.throttle, fwdIn, 5, dt);

    const fwd = this.forward;
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x); // screen-right when looking along fwd
    let speed = this.speed;

    // steering: sharper at low speed, smooth & weighty at high speed
    const turnMax = 2.4 / (1 + speed / 28);
    this.yawRate = THREE.MathUtils.damp(this.yawRate, steer * turnMax, this.airborne ? 2 : 6, dt);
    this.yaw += this.yawRate * dt;

    // thrust & drag along the ground plane
    const vmax = wantBoost ? VMAX_BOOST : VMAX;
    const accel = wantBoost ? BOOST_ACCEL : ACCEL;
    const thrust = this.airborne ? 0.25 : 1;
    this.vel.addScaledVector(fwd, (fwdIn * accel - back * 26) * thrust * dt);
    const k = accel / (vmax * vmax);
    let dragA = k * speed * speed + (fwdIn ? 0.4 : 2.5);
    if (speed > vmax) dragA += (speed - vmax) * 1.5; // bleed off overspeed from slopes / boost
    if (speed > 0.01) {
      const s = Math.max(0, speed - dragA * dt) / speed;
      this.vel.x *= s;
      this.vel.z *= s;
    }

    // lateral grip: hover bikes slide, so this is fairly loose
    const lateral = this.vel.x * right.x + this.vel.z * right.z;
    const grip = this.airborne ? 0.3 : 2.8;
    const keep = 1 - Math.exp(-grip * dt);
    this.vel.x -= right.x * lateral * keep;
    this.vel.z -= right.z * lateral * keep;
    // redirect some of the removed lateral speed forward (carving)
    this.vel.addScaledVector(fwd, Math.abs(lateral) * keep * 0.5);

    // slopes: gravity pulls along the sand
    const h = heightAt(this.pos.x, this.pos.z);
    normalAt(this.pos.x, this.pos.z, tmpN, 1.5);
    if (!this.airborne) {
      this.vel.x += tmpN.x * G * 0.35 * dt;
      this.vel.z += tmpN.z * G * 0.35 * dt;
    }

    // vertical hover spring
    this.gap = this.pos.y - h;
    const slopeVy = -(tmpN.x * this.vel.x + tmpN.z * this.vel.z) / Math.max(tmpN.y, 0.3);
    let ay = -G_AIR;
    this.jumpTimer = Math.max(0, this.jumpTimer - dt);
    if (this.gap < FIELD && this.jumpTimer === 0) {
      const spring = 70 * (HOVER - this.gap) - 11 * (this.vel.y - slopeVy);
      ay = THREE.MathUtils.clamp(spring, -G_AIR * 1.5, 160); // field also pulls the bike down over crests
    }
    if (input.hit('Space') && this.gap < FIELD && this.jumpTimer === 0) {
      this.vel.y = Math.max(this.vel.y, slopeVy) + 13;
      this.jumpTimer = 0.6;
    }
    this.vel.y += ay * dt;

    this.pos.addScaledVector(this.vel, dt);

    const h2 = heightAt(this.pos.x, this.pos.z);
    const minGap = 0.35;
    if (this.pos.y < h2 + minGap) {
      const impact = slopeVy - this.vel.y;
      if (this.airborne && impact > 6) this.landImpact = Math.min(1, impact / 25);
      this.pos.y = h2 + minGap;
      this.vel.y = Math.max(this.vel.y, slopeVy);
    }
    this.gap = this.pos.y - h2;
    const wasAir = this.airborne;
    this.airborne = this.gap > FIELD || this.jumpTimer > 0;
    this.airTime = this.airborne ? this.airTime + dt : 0;
    if (wasAir && !this.airborne && this.landImpact === 0) this.landImpact = 0.3;

    // ruins: push out of cylinders and bounce
    for (const c of colliders) {
      if (this.pos.y > c.top + 0.5) continue;
      const dx = this.pos.x - c.x;
      const dz = this.pos.z - c.z;
      const minD = c.r + 1.3;
      const d2 = dx * dx + dz * dz;
      if (d2 < minD * minD && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        this.pos.x = c.x + nx * minD;
        this.pos.z = c.z + nz * minD;
        const vn = this.vel.x * nx + this.vel.z * nz;
        if (vn < 0) {
          this.vel.x -= nx * vn * 1.4;
          this.vel.z -= nz * vn * 1.4;
          this.vel.multiplyScalar(0.7);
          this.landImpact = Math.min(1, -vn / 30);
        }
      }
    }

    // visual attitude
    speed = this.speed;
    const leanTarget = THREE.MathUtils.clamp(-this.yawRate * speed * 0.035, -0.6, 0.6);
    this.lean = THREE.MathUtils.damp(this.lean, leanTarget, 5, dt);
    let pitchTarget;
    if (this.airborne) {
      pitchTarget = -Math.atan2(this.vel.y, Math.max(speed, 1)) * 0.6;
    } else {
      const ahead = heightAt(this.pos.x + fwd.x * 2.5, this.pos.z + fwd.z * 2.5);
      const behind = heightAt(this.pos.x - fwd.x * 2.5, this.pos.z - fwd.z * 2.5);
      pitchTarget = -Math.atan2(ahead - behind, 5) - this.throttle * 0.05;
    }
    this.pitch = THREE.MathUtils.damp(this.pitch, pitchTarget, 6, dt);
    this.landImpact = THREE.MathUtils.damp(this.landImpact, 0, 4, dt);
  }

  get stateLabel() {
    if (this.airborne) return '滯空';
    if (this.boost > 0.5) return '加速';
    return this.speed > 1 ? '滑行' : '懸停';
  }
}
