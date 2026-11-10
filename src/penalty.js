import * as THREE from 'three';

// The penalty jail (the coin jail), for riders caught speeding in the jail: a huge glass block of ROOMS x ROOMS rooms, one rider to a room (the player in room 0, around the
// origin). Every inner wall is two glass panels with a brown door between them; ramming
// a panel or a door breaks it like an ice crystal (Terrain.smash, with glass shards),
// and the two rooms open into one. The outer walls break the same way, onto OUTSIDE. A coin fountain over every room sprays big coins. Through the glass you can see the riders next door before you get to them.

export const ROOMS = 12;
export const ROOM = 90; // metres, wall to wall
const WALL_H = 8;
const POST_STEP = 1.6;
const DOOR_W = 7;
const HALF = ROOM / 2;
export const OUTSIDE = ROOMS * ROOMS; // the zone number of the open floor around the block

// Room k (0..ROOMS²-1) center and floor box.
export function roomCenter(k) {
  return { x: (k % ROOMS) * ROOM, z: Math.floor(k / ROOMS) * ROOM };
}
export function roomBox(k, margin = 2.5) {
  const c = roomCenter(k);
  return { x0: c.x - HALF + margin, x1: c.x + HALF - margin, z0: c.z - HALF + margin, z1: c.z + HALF - margin };
}
export const BUILDING = { x0: -HALF, x1: (ROOMS - 1) * ROOM + HALF, z0: -HALF, z1: (ROOMS - 1) * ROOM + HALF };
const OUT_REACH = 600;
const OPEN = { x0: BUILDING.x0 - OUT_REACH, x1: BUILDING.x1 + OUT_REACH, z0: BUILDING.z0 - OUT_REACH, z1: BUILDING.z1 + OUT_REACH };
export const MACHINES = Array.from({ length: ROOMS * ROOMS }, (_, k) => roomCenter(k));

// Glass panels and doors. Each is a straight piece { x0, z0, x1, z1 } carrying the two
// rooms (or a room and OUTSIDE) it separates; every one can be broken.
function layout() {
  const pieces = [];
  for (let k = 0; k <= ROOMS; k++) {
    const line = -HALF + k * ROOM;
    for (let r = 0; r < ROOMS; r++) {
      const a = -HALF + r * ROOM;
      const b = a + ROOM;
      for (const vertical of [true, false]) {
        const seg = (u0, u1) => (vertical ? { x0: line, z0: u0, x1: line, z1: u1 } : { x0: u0, z0: line, x1: u1, z1: line });
        const room = (j) => (j < 0 || j >= ROOMS ? OUTSIDE : vertical ? r * ROOMS + j : j * ROOMS + r);
        const rooms = [room(k - 1), room(k)];
        const mid = (a + b) / 2;
        pieces.push({ ...seg(a, mid - DOOR_W / 2), kind: 'glass', rooms });
        pieces.push({ ...seg(mid - DOOR_W / 2, mid + DOOR_W / 2), kind: 'door', rooms });
        pieces.push({ ...seg(mid + DOOR_W / 2, b), kind: 'glass', rooms });
      }
    }
  }
  return pieces;
}
const PIECES = layout();

export const glassMat = new THREE.MeshStandardMaterial({
  color: 0xbfe8ff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide,
});
const frameMat = new THREE.MeshStandardMaterial({ color: 0x8a9298, metalness: 0.7, roughness: 0.35 });
const doorMat = new THREE.MeshStandardMaterial({ color: 0x7a4a26, roughness: 0.7, metalness: 0.15 });
const machineMat = new THREE.MeshStandardMaterial({ color: 0x40444c, metalness: 0.6, roughness: 0.4, emissive: 0x302008 });
const machineGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.5, 0.3) });
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

  const mine = PIECES.filter((w) => inChunk((w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2, x0, z0, size));
  const glass = mine.filter((w) => w.kind === 'glass');
  const doors = mine.filter((w) => w.kind === 'door');
  const meshes = {
    glass: glass.length ? new THREE.InstancedMesh(box, glassMat, glass.length) : null,
    door: doors.length ? new THREE.InstancedMesh(box, doorMat, doors.length) : null,
  };
  const index = { glass: 0, door: 0 };
  for (const w of mine) {
    const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
    const mx = (w.x0 + w.x1) / 2;
    const mz = (w.z0 + w.z1) / 2;
    const gy = heightAt(mx, mz);
    const h = w.kind === 'door' ? WALL_H - 1.5 : WALL_H;
    const along = w.x0 === w.x1 ? 'z' : 'x';
    sc.set(along === 'x' ? len : w.kind === 'door' ? 0.5 : 0.25, h, along === 'z' ? len : w.kind === 'door' ? 0.5 : 0.25);
    const mesh = meshes[w.kind];
    const i = index[w.kind]++;
    mesh.setMatrixAt(i, m.compose(p.set(mx, gy + h / 2 - 0.3, mz), q.identity(), sc));
    // A breakable record looks enough like an ice spire (x, z, baseY, h, w) for the
    // shards and the dust; `door.rooms` says which rooms it joins.
    const rec = w.rooms ? { id: breakables.length, mesh, index: i, x: mx, z: mz, baseY: gy, h, w: len / 2, colliders: [], door: w } : null;
    const n = Math.max(1, Math.round(len / POST_STEP));
    for (let k = 0; k <= n; k++) {
      const c = { x: w.x0 + ((w.x1 - w.x0) * k) / n, z: w.z0 + ((w.z1 - w.z0) * k) / n, r: 0.5, top: gy + WALL_H };
      if (rec) {
        c.breakable = rec;
        rec.colliders.push(c);
      }
      colliders.push(c);
    }
    if (rec) breakables.push(rec);
  }
  for (const mesh of Object.values(meshes)) {
    if (!mesh) continue;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  if (meshes.door) meshes.door.castShadow = true;

  // Frame posts at the room corners, and a coin machine over each room.
  for (let i = 0; i <= ROOMS; i++) {
    for (let j = 0; j <= ROOMS; j++) {
      const fx = -HALF + i * ROOM;
      const fz = -HALF + j * ROOM;
      if (!inChunk(fx, fz, x0, z0, size)) continue;
      const post = new THREE.Mesh(box, frameMat);
      post.scale.set(0.6, WALL_H + 0.6, 0.6);
      post.position.set(fx, heightAt(fx, fz) + WALL_H / 2, fz);
      group.add(post);
      colliders.push({ x: fx, z: fz, r: 0.6, top: heightAt(fx, fz) + WALL_H });
    }
  }
  // A super coin fountain over each room: a heavy box on legs with a glowing gold
  // nozzle on top that sprays the coins up and out.
  for (const mc of MACHINES) {
    if (!inChunk(mc.x, mc.z, x0, z0, size)) continue;
    const gy = heightAt(mc.x, mc.z);
    const body = new THREE.Mesh(box, machineMat);
    body.scale.set(7, 3, 7);
    body.position.set(mc.x, gy + 12.5, mc.z);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.2, 2.2, 16), machineGlow);
    nozzle.position.set(mc.x, gy + 15, mc.z);
    group.add(body, nozzle);
    for (const [lx, lz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
      const leg = new THREE.Mesh(box, machineMat);
      leg.scale.set(0.5, 11, 0.5);
      leg.position.set(mc.x + lx, gy + 5.5, mc.z + lz);
      group.add(leg);
    }
  }
  return { group, colliders, slopes: [], breakables };
}

// Rooms joined by broken panels and doors, as union-find over room numbers.
export class RoomZones {
  constructor() {
    this.parent = Array.from({ length: OUTSIDE + 1 }, (_, k) => k);
  }
  find(k) {
    while (this.parent[k] !== k) k = this.parent[k] = this.parent[this.parent[k]];
    return k;
  }
  join(a, b) {
    this.parent[this.find(a)] = this.find(b);
  }
  // The floor box covering every room joined to room k; once that reaches OUTSIDE, the
  // open floor out to OUT_REACH past the block.
  box(k) {
    const root = this.find(k);
    if (root === this.find(OUTSIDE)) return OPEN;
    let b = null;
    for (let r = 0; r < ROOMS * ROOMS; r++) {
      if (this.find(r) !== root) continue;
      const rb = roomBox(r);
      b = b ? { x0: Math.min(b.x0, rb.x0), x1: Math.max(b.x1, rb.x1), z0: Math.min(b.z0, rb.z0), z1: Math.max(b.z1, rb.z1) } : rb;
    }
    return b;
  }
}
