import * as THREE from 'three';
import { heightAt } from './terrain.js';

const MODES = ['chase', 'side', 'front'];

export class ChaseCamera {
  constructor(camera, dom) {
    this.camera = camera;
    this.mode = 0;
    this.heading = 0;
    this.orbit = 0; // user drag offset (yaw)
    this.orbitPitch = 0;
    this.dragging = false;
    this.offset = new THREE.Vector3(); // camera position relative to the bike
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.shake = 0;
    this.initialized = false;

    dom.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointerup', () => (this.dragging = false));
    dom.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.orbit -= e.movementX * 0.006;
      this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + e.movementY * 0.004, -0.3, 0.8);
    });
  }

  get modeName() {
    return MODES[this.mode];
  }

  cycle() {
    this.mode = (this.mode + 1) % MODES.length;
  }

  update(dt, player, time) {
    const speed = player.speed;
    // follow the travel direction when moving, the nose when slow
    const velHeading = Math.atan2(player.vel.x, player.vel.z);
    const target = speed > 8 ? lerpAngle(player.yaw, velHeading, 0.5) : player.yaw;
    this.heading = dampAngle(this.heading, target, 3.2, dt);
    if (!this.dragging) {
      this.orbit = THREE.MathUtils.damp(this.orbit, 0, 1.5, dt);
      this.orbitPitch = THREE.MathUtils.damp(this.orbitPitch, 0, 1.5, dt);
    }

    const s = THREE.MathUtils.clamp(speed / 70, 0, 1.3);
    let yaw = this.heading + this.orbit;
    let dist = 4.6 + s * 1.6;
    let height = 1.55 + s * 0.3;
    let lookAhead = 1.5 + s * 3;
    if (this.modeName === 'side') {
      yaw += Math.PI * 0.55;
      dist = 6.5;
      height = 1.2;
      lookAhead = 1;
    } else if (this.modeName === 'front') {
      yaw += Math.PI;
      dist = 6.5 + s;
      height = 1.4;
      lookAhead = -1;
    }
    height += this.orbitPitch * dist;

    const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const desired = player.pos.clone().addScaledVector(back, -dist);
    desired.y += height;
    const ground = heightAt(desired.x, desired.z) + 0.8;
    if (desired.y < ground) desired.y = ground;

    const lookTarget = player.pos.clone();
    lookTarget.y += 1.25;
    lookTarget.addScaledVector(new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)), lookAhead);

    // smooth in bike-relative space so high speed never makes the camera lag into the bike
    const desiredOffset = desired.sub(player.pos);
    if (!this.initialized) {
      this.offset.copy(desiredOffset);
      this.look.copy(lookTarget);
      this.initialized = true;
    }
    this.offset.lerp(desiredOffset, 1 - Math.exp(-6 * dt));
    this.pos.copy(player.pos).add(this.offset);
    const ground2 = heightAt(this.pos.x, this.pos.z) + 0.6;
    if (this.pos.y < ground2) this.pos.y = ground2;
    this.look.lerp(lookTarget, 1 - Math.exp(-20 * dt));

    this.shake = Math.max(this.shake * Math.exp(-5 * dt), player.landImpact * 0.5, player.boost * 0.06);
    const sh = this.shake * 0.25;
    this.camera.position.set(
      this.pos.x + Math.sin(time * 61) * sh,
      this.pos.y + Math.sin(time * 47 + 1) * sh,
      this.pos.z + Math.sin(time * 53 + 2) * sh,
    );
    this.camera.lookAt(this.look);

    const fov = 62 + s * 10 + player.boost * 8;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, fov, 4, dt);
      this.camera.updateProjectionMatrix();
    }
  }
}

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function lerpAngle(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

function dampAngle(a, b, lambda, dt) {
  return a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
}
