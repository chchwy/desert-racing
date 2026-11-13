import * as THREE from 'three';
import { mulberry32 } from './noise.js';

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
// A window pane looking out at a night sky: stars and a moon behind a cross frame.
function nightWindow() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 112;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 112);
  sky.addColorStop(0, '#0a1230');
  sky.addColorStop(1, '#24305a');
  g.fillStyle = sky;
  g.fillRect(0, 0, 128, 112);
  const rng = mulberry32(7);
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 40; i++) g.fillRect(rng() * 128, rng() * 112, 1.5, 1.5);
  g.fillStyle = '#f4f0d8';
  g.beginPath();
  g.arc(92, 30, 12, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

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

    // The room inside, seen only from in there; setInterior furnishes it per house.
    this.interior = new THREE.Group();
    this.root.add(this.interior);
    this.buildInterior();
    this.sleepSign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.75), new THREE.MeshBasicMaterial({ map: sign('沉睡中，請勿打擾', 360, '#2a2450', '#fff4c0'), toneMapped: false }));
    this.sleepSign.position.set(-0.6, 3.1, -D / 2 + 0.17);
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

  // Walls and ceiling drawn from inside, a floor, a bed, a bedside lamp, windows onto
  // the night, and extras (rug, plant, bookshelf, picture) that setInterior turns on.
  // Lit by its own glow, since the outer walls shade it from the sun.
  buildInterior() {
    const g = this.interior;
    const mat = (color, glow = 0.3) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: glow, roughness: 0.9 });
    const put = (parent, geo, m, x, y, z) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    const room = put(g, new THREE.BoxGeometry(W - 0.3, H - 0.15, D - 0.3), mat(0xf3e2c4), 0, H / 2, 0);
    room.material.side = THREE.BackSide;
    const floor = put(g, new THREE.BoxGeometry(W - 0.32, 0.05, D - 0.32), mat(0x9a6a40, 0.25), 0, 0.43, 0);
    const bed = new THREE.Group();
    g.add(bed);
    bed.position.set(-1.8, 0, -1.4);
    const frame = mat(0x7a4a26, 0.25);
    put(bed, new THREE.BoxGeometry(2.4, 0.5, 3.4), frame, 0, 0.7, 0);
    put(bed, new THREE.BoxGeometry(2.3, 0.25, 3.3), mat(0xffffff), 0, 1.05, 0);
    const blanket = put(bed, new THREE.BoxGeometry(2.35, 0.2, 2.2), mat(0x4a6ac8, 0.35), 0, 1.2, 0.5);
    put(bed, new THREE.BoxGeometry(1.4, 0.2, 0.6), mat(0xfaf6ee, 0.35), 0, 1.25, -1.3);
    put(bed, new THREE.BoxGeometry(2.4, 1.2, 0.15), frame, 0, 1.3, -1.7);
    const table = new THREE.Group();
    g.add(table);
    put(table, new THREE.BoxGeometry(0.8, 0.7, 0.8), mat(0x8a5a30, 0.25), 0, 0.75, 0);
    put(table, new THREE.SphereGeometry(0.28, 16, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.8) }), 0, 1.4, 0);
    // Windows: a frame with night sky and stars in it, on the side and back walls.
    const night = new THREE.MeshBasicMaterial({ map: nightWindow(), toneMapped: false });
    const sill = mat(0xffffff, 0.35);
    for (const [x, z, ry] of [[-W / 2 + 0.16, 1.2, Math.PI / 2], [-W / 2 + 0.16, -1.6, Math.PI / 2], [1.9, -D / 2 + 0.16, 0]]) {
      const w = new THREE.Group();
      w.position.set(x, 2.6, z);
      w.rotation.y = ry;
      g.add(w);
      put(w, new THREE.PlaneGeometry(1.4, 1.2), night, 0, 0, 0.01);
      put(w, new THREE.BoxGeometry(1.6, 0.1, 0.1), sill, 0, -0.65, 0.05);
      put(w, new THREE.BoxGeometry(1.6, 0.08, 0.06), sill, 0, 0.62, 0.03);
      put(w, new THREE.BoxGeometry(0.06, 1.3, 0.06), sill, 0, 0, 0.03);
    }
    const rug = put(g, new THREE.CylinderGeometry(1.3, 1.3, 0.03, 28), mat(0xc84a4a, 0.3), 1.2, 0.47, 0.6);
    const plant = new THREE.Group();
    g.add(plant);
    plant.position.set(W / 2 - 0.8, 0, -D / 2 + 0.8);
    put(plant, new THREE.CylinderGeometry(0.3, 0.24, 0.5, 14), mat(0xb0603a, 0.3), 0, 0.7, 0);
    put(plant, new THREE.SphereGeometry(0.5, 12, 10), mat(0x3f8a45, 0.3), 0, 1.35, 0);
    const shelf = new THREE.Group();
    g.add(shelf);
    shelf.position.set(W / 2 - 0.35, 0, 0.6);
    put(shelf, new THREE.BoxGeometry(0.4, 2.2, 1.6), frame, 0, 1.55, 0);
    for (const [y, c] of [[1.0, 0xc84a4a], [1.6, 0x4a8ac8], [2.2, 0xe0b040]]) put(shelf, new THREE.BoxGeometry(0.42, 0.35, 1.3), mat(c, 0.3), -0.02, y, 0);
    const picture = put(g, new THREE.BoxGeometry(1.2, 0.8, 0.05), mat(0x6ab0e0, 0.4), -0.6, 2.2, -D / 2 + 0.18);
    this.rooms = { room: room.material, floor: floor.material, blanket: blanket.material, rug, plant, shelf, picture, bed, table };
    this.setInterior(0);
  }

  // Furnish the room for house number `seed`: wall, floor and blanket colors, which side
  // the bed is on, and which extras are there. The same seed always gives the same room.
  setInterior(seed) {
    const rng = mulberry32(seed);
    const pick = (list) => list[Math.floor(rng() * list.length)];
    const r = this.rooms;
    r.room.color.setHex(pick([0xf3e2c4, 0xdde8f0, 0xf4d8d8, 0xe2f0d8, 0xefe6f8, 0xfaf0c8]));
    r.room.emissive.copy(r.room.color);
    r.floor.color.setHex(pick([0x9a6a40, 0x6a4a30, 0xb08a5a, 0x7a7a80]));
    r.floor.emissive.copy(r.floor.color);
    r.blanket.color.setHex(pick([0x4a6ac8, 0xc84a6a, 0x4ab06a, 0xe0a030, 0x8a4ac8, 0x30a0b0]));
    r.blanket.emissive.copy(r.blanket.color);
    const left = rng() < 0.5;
    r.bed.position.x = left ? -1.8 : 0.4;
    r.table.position.set(left ? 0.2 : -1.6, 0, -2.7);
    r.rug.visible = rng() < 0.7;
    r.rug.material.color.setHex(pick([0xc84a4a, 0x4a7ac8, 0xd8b040, 0x6ab06a]));
    r.rug.material.emissive.copy(r.rug.material.color);
    r.plant.visible = rng() < 0.6;
    r.shelf.visible = rng() < 0.5;
    r.picture.visible = rng() < 0.6;
  }

  // Where the camera sits while the player sleeps, and what it looks at, in world space.
  bedroomView(eye, target) {
    this.root.updateMatrixWorld();
    eye.set(W / 2 - 0.9, H - 0.8, D / 2 - 0.7);
    target.set(-1.6, 1.2, -2.2);
    this.root.localToWorld(eye);
    this.root.localToWorld(target);
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
