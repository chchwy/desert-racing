import * as THREE from 'three';

// The penalty jail, for riders caught speeding in jail without the 10,000-coin fine: a
// block of ROOMS x ROOMS rooms with walls between them and a door in the middle of every
// inner wall. Each rider starts alone in a room (the player in room 0, around the
// origin). Ramming a door breaks it like an ice crystal (Terrain.smash), and the two
// rooms open into one. A machine hangs over every room and keeps dropping coins.

export const ROOMS = 4;
export const ROOM = 36; // metres, wall to wall
const WALL_H = 8;
const POST_STEP = 2;
const DOOR_W = 6;
const HALF = ROOM / 2;

// Room k (0..ROOMS²-1) center and floor box.
export function roomCenter(k) {
  return { x: (k % ROOMS) * ROOM, z: Math.floor(k / ROOMS) * ROOM };
}
export function roomBox(k, margin = 2.5) {
  const c = roomCenter(k);
  return { x0: c.x - HALF + margin, x1: c.x + HALF - margin, z0: c.z - HALF + margin, z1: c.z + HALF - margin };
}
export const BUILDING = { x0: -HALF, x1: (ROOMS - 1) * ROOM + HALF, z0: -HALF, z1: (ROOMS - 1) * ROOM + HALF };
export const MACHINES = Array.from({ length: ROOMS * ROOMS }, (_, k) => roomCenter(k));

// Which room a point is in, or -1 outside.
export function roomAt(x, z) {
  const i = Math.round(x / ROOM);
  const j = Math.round(z / ROOM);
  if (i < 0 || j < 0 || i >= ROOMS || j >= ROOMS) return -1;
  return j * ROOMS + i;
}

// Walls as segments { x0, z0, x1, z1 }, and doors on the inner ones with the two rooms
// each joins.
function layout() {
  const walls = [];
  const doors = [];
  for (let k = 0; k <= ROOMS; k++) {
    const line = -HALF + k * ROOM;
    for (let r = 0; r < ROOMS; r++) {
      const a = -HALF + r * ROOM;
      const b = a + ROOM;
      const inner = k > 0 && k < ROOMS;
      // A wall along z at x = line (between columns k-1 and k), and one along x at z = line.
      for (const vertical of [true, false]) {
        const seg = vertical ? { x0: line, z0: a, x1: line, z1: b } : { x0: a, z0: line, x1: b, z1: line };
        if (!inner) {
          walls.push(seg);
          continue;
        }
        const mid = (a + b) / 2;
        const lo = mid - DOOR_W / 2;
        const hi = mid + DOOR_W / 2;
        if (vertical) {
          walls.push({ x0: line, z0: a, x1: line, z1: lo }, { x0: line, z0: hi, x1: line, z1: b });
          doors.push({ x: line, z: mid, along: 'z', rooms: [r * ROOMS + (k - 1), r * ROOMS + k] });
        } else {
          walls.push({ x0: a, z0: line, x1: lo, z1: line }, { x0: hi, z0: line, x1: b, z1: line });
          doors.push({ x: mid, z: line, along: 'x', rooms: [(k - 1) * ROOMS + r, k * ROOMS + r] });
        }
      }
    }
  }
  return { walls, doors };
}
const LAYOUT = layout();

const wallMat = new THREE.MeshStandardMaterial({ color: 0x6c6a66, roughness: 0.95 });
const doorMat = new THREE.MeshStandardMaterial({ color: 0x7a3a20, roughness: 0.7, metalness: 0.3 });
const machineMat = new THREE.MeshStandardMaterial({ color: 0x40444c, metalness: 0.6, roughness: 0.4, emissive: 0x302008 });
const box = new THREE.BoxGeometry(1, 1, 1);

const inChunk = (x, z, x0, z0, size) => x >= x0 && x < x0 + size && z >= z0 && z < z0 + size;

export function buildPenaltyProps(cx, cz, size, heightAt) {
  const group = new THREE.Group();
  const colliders = [];
  const breakables = [];
  const x0 = cx * size;
  const z0 = cz * size;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();

  // Walls: a slab per segment owned by the chunk holding its middle, posts as colliders.
  const mine = LAYOUT.walls.filter((w) => inChunk((w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2, x0, z0, size));
  if (mine.length) {
    const slabs = new THREE.InstancedMesh(box, wallMat, mine.length);
    mine.forEach((w, i) => {
      const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
      const mx = (w.x0 + w.x1) / 2;
      const mz = (w.z0 + w.z1) / 2;
      const gy = heightAt(mx, mz);
      sc.set(w.x0 === w.x1 ? 0.6 : len, WALL_H, w.x0 === w.x1 ? len : 0.6);
      slabs.setMatrixAt(i, m.compose(p.set(mx, gy + WALL_H / 2 - 0.3, mz), q.identity(), sc));
      const n = Math.max(1, Math.round(len / POST_STEP));
      for (let k = 0; k <= n; k++) {
        const x = w.x0 + ((w.x1 - w.x0) * k) / n;
        const z = w.z0 + ((w.z1 - w.z0) * k) / n;
        colliders.push({ x, z, r: 0.4, top: gy + WALL_H });
      }
    });
    slabs.castShadow = true;
    slabs.receiveShadow = true;
    slabs.computeBoundingSphere();
    group.add(slabs);
  }

  // Doors: one instance each, breakable. A record looks enough like an ice spire
  // (x, z, baseY, h, w) for main.js's smash dust to work on it.
  const doors = LAYOUT.doors.filter((d) => inChunk(d.x, d.z, x0, z0, size));
  if (doors.length) {
    const mesh = new THREE.InstancedMesh(box, doorMat, doors.length);
    doors.forEach((d, i) => {
      const gy = heightAt(d.x, d.z);
      sc.set(d.along === 'x' ? DOOR_W : 0.5, WALL_H - 1.5, d.along === 'x' ? 0.5 : DOOR_W);
      mesh.setMatrixAt(i, m.compose(p.set(d.x, gy + (WALL_H - 1.5) / 2 - 0.3, d.z), q.identity(), sc));
      const rec = { id: i, mesh, index: i, x: d.x, z: d.z, baseY: gy, h: 6, w: 3, colliders: [], door: d };
      for (let s = -DOOR_W / 2 + 0.5; s <= DOOR_W / 2 - 0.5; s += 1.25) {
        const c = {
          x: d.along === 'x' ? d.x + s : d.x,
          z: d.along === 'x' ? d.z : d.z + s,
          r: 0.6,
          top: gy + WALL_H,
          breakable: rec,
        };
        rec.colliders.push(c);
        colliders.push(c);
      }
      breakables.push(rec);
    });
    mesh.castShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  // A coin machine over each room: a box with a chute, hanging high.
  for (const mc of MACHINES) {
    if (!inChunk(mc.x, mc.z, x0, z0, size)) continue;
    const gy = heightAt(mc.x, mc.z);
    const body = new THREE.Mesh(box, machineMat);
    body.scale.set(4, 2.2, 4);
    body.position.set(mc.x, gy + 12.5, mc.z);
    const chute = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 1.4, 12), machineMat);
    chute.position.set(mc.x, gy + 10.8, mc.z);
    group.add(body, chute);
  }
  return { group, colliders, slopes: [], breakables };
}

// Rooms joined by broken doors, as union-find over room numbers.
export class RoomZones {
  constructor() {
    this.parent = Array.from({ length: ROOMS * ROOMS }, (_, k) => k);
  }
  find(k) {
    while (this.parent[k] !== k) k = this.parent[k] = this.parent[this.parent[k]];
    return k;
  }
  join(a, b) {
    this.parent[this.find(a)] = this.find(b);
  }
  // The floor box covering every room joined to room k.
  box(k) {
    const root = this.find(k);
    let b = null;
    for (let r = 0; r < ROOMS * ROOMS; r++) {
      if (this.find(r) !== root) continue;
      const rb = roomBox(r);
      b = b ? { x0: Math.min(b.x0, rb.x0), x1: Math.max(b.x1, rb.x1), z0: Math.min(b.z0, rb.z0), z1: Math.max(b.z1, rb.z1) } : rb;
    }
    return b;
  }
}
