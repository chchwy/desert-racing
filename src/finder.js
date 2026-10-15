import * as THREE from 'three';
import { alarm } from './sound.js';
import { nearestCoin } from './coins.js';

// Arrows that float ahead of the bike and point at a target, like a compass card
// tilted toward the chase camera: tip up is straight ahead, tip left means turn left.
// Turn the way it points and you drive into the target.
//
// IceFinder (snow level): the nearest unbroken ice spire. An alarm beeps faster and
// higher the closer it gets, and the reticle tag shows the distance.
// CoinFinder (every level): a yellow arrow to the nearest big coin not yet collected.

const TILT = -1.0; // radians: the card leans back to face the camera behind the bike

function arrowGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 1.6);
  s.lineTo(1.15, 0.25);
  s.lineTo(0.42, 0.25);
  s.lineTo(0.42, -1.2);
  s.lineTo(-0.42, -1.2);
  s.lineTo(-0.42, 0.25);
  s.lineTo(-1.15, 0.25);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: false });
  g.translate(0, 0, -0.11);
  g.rotateX(Math.PI / 2); // shape +Y (the tip) -> +Z, the frame's forward
  return g;
}

class Pointer {
  // color: a little past 1, a soft bloom glow that keeps its shape.
  constructor(scene, color, { ahead, lift, scale }) {
    this.ahead = ahead;
    this.lift = lift;
    this.color = color;
    this.mat = new THREE.MeshBasicMaterial({ color: color.clone(), transparent: true, opacity: 0.9, depthTest: false });
    // root: bike heading; card: tilted toward the camera; needle: turned toward the target.
    this.root = new THREE.Group();
    const card = new THREE.Group();
    card.rotation.x = TILT;
    this.needle = new THREE.Mesh(arrowGeometry(), this.mat);
    this.needle.renderOrder = 10; // drawn over the ground and the bike
    this.needle.scale.setScalar(scale);
    card.add(this.needle);
    this.root.add(card);
    this.root.visible = false;
    scene.add(this.root);
  }

  hide() {
    this.root.visible = false;
  }

  // Points at (tx, tz); pulse speeds up with `near` (0..1).
  show(player, tx, tz, time, near) {
    const f = player.forward;
    this.root.visible = true;
    this.root.position.set(player.pos.x + f.x * this.ahead, player.pos.y + this.lift + Math.sin(time * 4) * 0.15, player.pos.z + f.z * this.ahead);
    this.root.rotation.y = player.yaw;
    this.needle.rotation.y = Math.atan2(tx - player.pos.x, tz - player.pos.z) - player.yaw;
    this.mat.color.copy(this.color).multiplyScalar(0.75 + 0.25 * Math.sin(time * (6 + near * 14)));
  }
}

const ICE_RANGE = 260; // metres

export class IceFinder {
  constructor(scene, terrain, tag) {
    this.terrain = terrain;
    this.tag = tag;
    this.idle = tag.textContent;
    this.arrow = new Pointer(scene, new THREE.Color(0.3, 1.25, 1.7), { ahead: 14, lift: 5.5, scale: 1.2 });
    this.beepIn = 0;
    this.target = null;
  }

  update(dt, time, player, alive) {
    const t = alive ? this.terrain.nearestBreakable(player.pos, ICE_RANGE) : null;
    this.target = t;
    if (!t) {
      this.arrow.hide();
      this.tag.textContent = this.idle;
      this.beepIn = 0;
      return;
    }
    const d = Math.hypot(t.x - player.pos.x, t.z - player.pos.z);
    const near = 1 - THREE.MathUtils.clamp((d - 15) / (ICE_RANGE - 15), 0, 1);
    this.arrow.show(player, t.x, t.z, time, near);
    this.tag.textContent = `冰晶 ${Math.round(d)} m`;

    this.beepIn -= dt;
    if (this.beepIn <= 0) {
      alarm(near);
      this.beepIn = THREE.MathUtils.lerp(1.1, 0.16, near);
    }
  }
}

const COIN_RANGE = 6000; // metres to the disc center; the trail spacing is ~3.3 km

export class CoinFinder {
  constructor(scene) {
    // Above the ice arrow so the two never overlap.
    this.arrow = new Pointer(scene, new THREE.Color(1.5, 1.05, 0.02), { ahead: 20, lift: 7.5, scale: 1.4 });
  }

  update(time, player, alive) {
    const c = alive ? nearestCoin(player.pos.x, player.pos.z, COIN_RANGE) : null;
    if (!c) {
      this.arrow.hide();
      return;
    }
    const d = Math.hypot(c.x - player.pos.x, c.z - player.pos.z);
    this.arrow.show(player, c.x, c.z, time, 1 - THREE.MathUtils.clamp(d / COIN_RANGE, 0, 1));
  }
}
