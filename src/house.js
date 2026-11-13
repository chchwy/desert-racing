import * as THREE from 'three';

// The house that turns up ahead of a rich player: walls, a pitched roof, a door between
// two windows, and a sign. Local +Z is the front. By day the door is shut and the house
// is solid; at night the windows light up, the door swings open and driving in pays.
const W = 8;
const D = 7;
const H = 4.5;
const ROOF = 2.6;

function sign(text, width, bg, fg) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = 80;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, width, 80);
  g.strokeStyle = '#f0c060';
  g.lineWidth = 6;
  g.strokeRect(4, 4, width - 8, 72);
  g.fillStyle = fg;
  g.font = 'bold 40px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, width / 2, 42);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A round clock face with hour and minute hands, for a 24-hour hour h.
export function drawClock(g, h) {
  const r = 60;
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = '#fbf5e6';
  g.strokeStyle = '#3a2a1a';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(64, 64, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#3a2a1a';
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    g.fillRect(64 + Math.sin(a) * 48 - 3, 64 - Math.cos(a) * 48 - 3, 6, 6);
  }
  const hand = (a, len, w) => {
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(64, 64);
    g.lineTo(64 + Math.sin(a) * len, 64 - Math.cos(a) * len);
    g.stroke();
  };
  hand(((h % 12) / 12) * Math.PI * 2, 30, 7);
  hand((h % 1) * Math.PI * 2, 46, 4);
}

export class House {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.root.add(m);
      return m;
    };
    const wall = new THREE.MeshStandardMaterial({ color: 0xead9b8, roughness: 0.9 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.8 });
    add(new THREE.BoxGeometry(W, H, D), wall, 0, H / 2, 0);
    // A plinth sunk into the ground so a slope does not show a gap under the walls.
    add(new THREE.BoxGeometry(W + 0.6, 2, D + 0.6), trim, 0, -0.6, 0);

    const tri = new THREE.Shape([new THREE.Vector2(-W / 2 - 0.6, 0), new THREE.Vector2(W / 2 + 0.6, 0), new THREE.Vector2(0, ROOF)]);
    const roof = new THREE.ExtrudeGeometry(tri, { depth: D + 1, bevelEnabled: false });
    roof.translate(0, 0, -(D + 1) / 2);
    add(roof, new THREE.MeshStandardMaterial({ color: 0xa83a2a, roughness: 0.75 }), 0, H, 0);
    add(new THREE.BoxGeometry(0.9, 2.2, 0.9), new THREE.MeshStandardMaterial({ color: 0x8a5a44, roughness: 0.9 }), 2, H + 1.6, -1.2);

    // Door on a hinge at its left edge, and its frame.
    add(new THREE.BoxGeometry(2.3, 3.3, 0.12), trim, 0, 1.65, D / 2 + 0.02);
    this.hinge = new THREE.Group();
    this.hinge.position.set(-0.95, 0, D / 2 + 0.12);
    this.root.add(this.hinge);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.9, 3, 0.12), new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.7 }));
    door.position.set(0.95, 1.5, 0);
    door.castShadow = true;
    this.hinge.add(door);
    // The room behind the door: warm light that shows when it opens.
    this.glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb050, emissiveIntensity: 0.1 });
    add(new THREE.BoxGeometry(1.9, 3, 0.05), this.glow, 0, 1.5, D / 2 + 0.06);
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(1.5, 1.3, 0.1), this.glow, sx * 2.6, 2.6, D / 2 + 0.03);
      add(new THREE.BoxGeometry(1.7, 0.12, 0.2), trim, sx * 2.6, 1.9, D / 2 + 0.08);
    }
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.94), new THREE.MeshBasicMaterial({ map: sign('晚上回家睡覺', 256, '#5a3418', '#ffe9a8'), toneMapped: false }));
    plate.position.set(0, 3.85, D / 2 + 0.06);
    this.root.add(plate);

    // Over the roof while the player sleeps.
    this.sleepSign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.3), new THREE.MeshBasicMaterial({ map: sign('沉睡中，請勿打擾', 360, '#2a2450', '#fff4c0'), toneMapped: false, side: THREE.DoubleSide }));
    this.sleepSign.position.set(0, H + ROOF + 1.4, D / 2);
    this.sleepSign.visible = false;
    this.root.add(this.sleepSign);

    // A clock on a post beside the door, only on a night the player went out early.
    this.clock = new THREE.Group();
    this.clock.position.set(W / 2 + 2, 0, D / 2 + 1);
    this.clock.visible = false;
    this.root.add(this.clock);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 4, 10), trim);
    post.position.y = 2;
    post.castShadow = true;
    this.clock.add(post);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    this.clockCtx = canvas.getContext('2d');
    this.clockTex = new THREE.CanvasTexture(canvas);
    this.clockTex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), new THREE.MeshBasicMaterial({ map: this.clockTex, toneMapped: false, side: THREE.DoubleSide }));
    face.position.set(0, 4.6, 0);
    this.clock.add(face);
    this.clockMinute = -1;

    this.lamp = new THREE.PointLight(0xffb060, 0, 30, 1.5);
    this.lamp.position.set(0, 2.5, D / 2 + 2);
    this.root.add(this.lamp);
    this.collider = { x: 0, z: 0, r: 5.2, top: H + ROOF };
  }

  get shown() {
    return this.root.visible;
  }

  // Front toward (fx, fz).
  place(x, y, z, fx, fz) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = Math.atan2(fx - x, fz - z);
    this.root.visible = true;
    this.collider.x = x;
    this.collider.z = z;
  }

  // Out the front door, facing away from the house: { x, z, yaw }.
  doorstep(out = D / 2 + 5) {
    const yaw = this.root.rotation.y;
    const p = this.root.position;
    return { x: p.x + Math.sin(yaw) * out, z: p.z + Math.cos(yaw) * out, yaw };
  }

  hide() {
    this.root.visible = false;
  }

  distance(pos) {
    return Math.hypot(pos.x - this.root.position.x, pos.z - this.root.position.z);
  }

  // hour: show the clock at that 24-hour hour, or null to hide it.
  showClock(hour) {
    this.clock.visible = hour != null;
    if (hour == null) return;
    const minute = Math.floor(hour * 60);
    if (minute === this.clockMinute) return;
    this.clockMinute = minute;
    drawClock(this.clockCtx, hour);
    this.clockTex.needsUpdate = true;
  }

  update(dark) {
    this.glow.emissiveIntensity = 0.1 + dark * 3;
    this.lamp.intensity = dark * 40;
    this.hinge.rotation.y = -dark * 1.4;
  }
}
