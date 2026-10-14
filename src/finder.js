import * as THREE from 'three';
import { alarm } from './sound.js';

// Snow level: an ice-crystal finder. When an unbroken spire is in range, an alarm
// beeps, faster and higher the closer it gets, and a glowing arrow floats ahead of
// the bike pointing at it, like a compass card tilted toward the chase camera: tip up is
// straight ahead, tip left means turn left. Turn the way it points and you drive into
// the crystal. The reticle tag shows the distance.

const RANGE = 260; // metres
const AHEAD = 14; // arrow distance in front of the bike
const LIFT = 5.5; // high enough to clear the rider from the chase camera
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

export class IceFinder {
  constructor(scene, terrain, tag) {
    this.terrain = terrain;
    this.tag = tag;
    this.idle = tag.textContent;
    this.color = new THREE.Color(0.3, 1.25, 1.7); // a little past 1: a soft glow that keeps its shape
    this.mat = new THREE.MeshBasicMaterial({ color: this.color.clone(), transparent: true, opacity: 0.9, depthTest: false });
    // root: bike heading; card: tilted toward the camera; needle: turned toward the target.
    this.arrow = new THREE.Group();
    this.card = new THREE.Group();
    this.card.rotation.x = TILT;
    this.needle = new THREE.Mesh(arrowGeometry(), this.mat);
    this.needle.renderOrder = 10; // drawn over the snow and the bike
    this.needle.scale.setScalar(1.2);
    this.card.add(this.needle);
    this.arrow.add(this.card);
    this.arrow.visible = false;
    scene.add(this.arrow);
    this.beepIn = 0;
    this.target = null;
  }

  update(dt, time, player, alive) {
    const t = alive ? this.terrain.nearestBreakable(player.pos, RANGE) : null;
    this.target = t;
    if (!t) {
      this.arrow.visible = false;
      this.tag.textContent = this.idle;
      this.beepIn = 0;
      return;
    }
    const dx = t.x - player.pos.x;
    const dz = t.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    const near = 1 - THREE.MathUtils.clamp((d - 15) / (RANGE - 15), 0, 1);

    const f = player.forward;
    this.arrow.visible = true;
    this.arrow.position.set(player.pos.x + f.x * AHEAD, player.pos.y + LIFT + Math.sin(time * 4) * 0.15, player.pos.z + f.z * AHEAD);
    this.arrow.rotation.y = player.yaw;
    this.needle.rotation.y = Math.atan2(dx, dz) - player.yaw;
    const pulse = 0.75 + 0.25 * Math.sin(time * (6 + near * 14));
    this.mat.color.copy(this.color).multiplyScalar(pulse);
    this.tag.textContent = `冰晶 ${Math.round(d)} m`;

    this.beepIn -= dt;
    if (this.beepIn <= 0) {
      alarm(near);
      this.beepIn = THREE.MathUtils.lerp(1.1, 0.16, near);
    }
  }
}
