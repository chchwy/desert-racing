import * as THREE from 'three';
import { FRIEND, FOE } from './teams.js';

// The jail: two big pens fenced with iron bars, one per team, each with room for 500
// bikes parked in rows. The red pen is around the origin, so a jailed player starts
// inside it. Bars are spaced so the bike's 1.3 m padding cannot slip between them.
//
// The red pen has a way out: a few bars missing on its south side, easy to miss, open
// onto a secret winding route walled in on both sides. The walls are colliders with no
// mesh, and the route itself is drawn only for a player rich enough to see it
// (RouteOverlay). Big coins sit along the way, and a finish gate stands at the end.

const HALF_X = 85;
const HALF_Z = 70;
const BAR_STEP = 2.2;
const BAR_H = 6;
const SLOT = 6.2; // parking grid spacing
const COLS = 25;

export const PENS = {
  [FRIEND]: { x: 0, z: 0 },
  [FOE]: { x: 260, z: 0 },
};

// Parking spot n (0..499) in a team's pen.
export function penSlot(team, n) {
  const pen = PENS[team];
  const col = n % COLS;
  const row = Math.floor(n / COLS);
  return {
    x: pen.x + (col - (COLS - 1) / 2) * SLOT,
    z: pen.z - HALF_Z + 8 + row * SLOT,
    yaw: 0,
  };
}

// A pen's floor as { x0, x1, z0, z1 }, pulled in by margin.
export function penBounds(team, margin = 0) {
  const pen = PENS[team];
  return { x0: pen.x - HALF_X + margin, x1: pen.x + HALF_X - margin, z0: pen.z - HALF_Z + margin, z1: pen.z + HALF_Z - margin };
}

// Is (x, z) inside a pen, with a margin?
export function inPen(team, x, z, margin = 0) {
  const pen = PENS[team];
  return Math.abs(x - pen.x) < HALF_X - margin && Math.abs(z - pen.z) < HALF_Z - margin;
}

const barGeo = new THREE.CylinderGeometry(0.12, 0.12, BAR_H, 6);
barGeo.translate(0, BAR_H / 2, 0);
const railGeo = new THREE.BoxGeometry(BAR_STEP, 0.25, 0.25);
const iron = new THREE.MeshStandardMaterial({ color: 0x3a3c42, metalness: 0.7, roughness: 0.45 });
const flagMats = {
  [FRIEND]: new THREE.MeshStandardMaterial({ color: 0xe8222a, roughness: 0.8, side: THREE.DoubleSide }),
  [FOE]: new THREE.MeshStandardMaterial({ color: 0x2257e8, roughness: 0.8, side: THREE.DoubleSide }),
};

// Bar positions around a pen's perimeter, with the yaw of the side they sit on.
function perimeter(pen) {
  const out = [];
  const side = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.round(len / BAR_STEP);
    const yaw = Math.atan2(z1 - z0, x1 - x0);
    for (let i = 0; i < n; i++) out.push({ x: x0 + ((x1 - x0) * i) / n, z: z0 + ((z1 - z0) * i) / n, yaw });
  };
  const x0 = pen.x - HALF_X;
  const x1 = pen.x + HALF_X;
  const z0 = pen.z - HALF_Z;
  const z1 = pen.z + HALF_Z;
  side(x0, z0, x1, z0);
  side(x1, z0, x1, z1);
  side(x1, z1, x0, z1);
  side(x0, z1, x0, z0);
  return out;
}

// The secret route, as a polyline out of the red pen's south side, ROUTE_W either side.
export const ROUTE = [
  [40, -60], [40, -110], [-20, -150], [-20, -200], [60, -240], [60, -295],
].map(([x, z]) => ({ x, z }));
export const ROUTE_W = 4;
export const ROUTE_END = ROUTE[ROUTE.length - 1];

// Distance from (x, z) to the route polyline.
export function routeDistance(x, z) {
  let best = Infinity;
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const a = ROUTE[i];
    const b = ROUTE[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
  }
  return best;
}

// Wall posts along both sides of every segment, dropping the ones that would poke into
// the corridor at a bend. The end is capped behind the finish.
function routeWalls() {
  const out = [];
  const off = ROUTE_W + 0.2;
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const a = ROUTE[i];
    const b = ROUTE[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const ux = (b.x - a.x) / len;
    const uz = (b.z - a.z) / len;
    const n = Math.ceil(len / BAR_STEP);
    for (let k = 0; k <= n; k++) {
      for (const side of [-1, 1]) {
        const x = a.x + ux * (len * k) / n - uz * off * side;
        const z = a.z + uz * (len * k) / n + ux * off * side;
        // Inside the pen the fence does the job; past it the walls run the route.
        if (inPen(FRIEND, x, z, -1)) continue;
        if (routeDistance(x, z) < ROUTE_W) continue;
        out.push({ x, z, yaw: Math.atan2(uz, ux) });
      }
    }
  }
  const e = ROUTE_END;
  const p = ROUTE[ROUTE.length - 2];
  const len = Math.hypot(e.x - p.x, e.z - p.z);
  const ux = (e.x - p.x) / len;
  const uz = (e.z - p.z) / len;
  for (let s = -ROUTE_W; s <= ROUTE_W; s += BAR_STEP) out.push({ x: e.x + ux * 3 - uz * s, z: e.z + uz * 3 + ux * s, yaw: 0 });
  return out;
}

const BARS = {
  // The red fence loses the bars where the route crosses it: that gap is the way out.
  [FRIEND]: perimeter(PENS[FRIEND]).filter((b) => routeDistance(b.x, b.z) > ROUTE_W),
  [FOE]: perimeter(PENS[FOE]),
};
export const ROUTE_WALLS = routeWalls();

export function buildJailProps(cx, cz, size, heightAt) {
  const group = new THREE.Group();
  const colliders = [];
  const x0 = cx * size;
  const z0 = cz * size;
  const mine = [];
  for (const team of [FRIEND, FOE]) {
    for (const b of BARS[team]) {
      if (b.x >= x0 && b.x < x0 + size && b.z >= z0 && b.z < z0 + size) mine.push(b);
    }
  }
  if (mine.length) {
    const bars = new THREE.InstancedMesh(barGeo, iron, mine.length);
    const rails = new THREE.InstancedMesh(railGeo, iron, mine.length * 2);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    mine.forEach((b, i) => {
      const gy = heightAt(b.x, b.z) - 0.3;
      bars.setMatrixAt(i, m.compose(p.set(b.x, gy, b.z), q.identity(), one));
      // Rails run along the side, from this bar to the next.
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -b.yaw);
      const mx = b.x + (Math.cos(b.yaw) * BAR_STEP) / 2;
      const mz = b.z + (Math.sin(b.yaw) * BAR_STEP) / 2;
      rails.setMatrixAt(i * 2, m.compose(p.set(mx, gy + BAR_H - 0.2, mz), q, one));
      rails.setMatrixAt(i * 2 + 1, m.compose(p.set(mx, gy + 0.6, mz), q, one));
      colliders.push({ x: b.x, z: b.z, r: 0.15, top: gy + BAR_H });
    });
    for (const mesh of [bars, rails]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  // The route's walls: colliders only, nothing to see.
  for (const w of ROUTE_WALLS) {
    if (w.x < x0 || w.x >= x0 + size || w.z < z0 || w.z >= z0 + size) continue;
    colliders.push({ x: w.x, z: w.z, r: 0.2, top: heightAt(w.x, w.z) + BAR_H });
  }
  // A tall team flag on each pen's far corner.
  for (const team of [FRIEND, FOE]) {
    const pen = PENS[team];
    const fx = pen.x + HALF_X - 4;
    const fz = pen.z + HALF_Z - 4;
    if (fx < x0 || fx >= x0 + size || fz < z0 || fz >= z0 + size) continue;
    const gy = heightAt(fx, fz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 22, 8), iron);
    pole.position.set(fx, gy + 11, fz);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.5), flagMats[team]);
    cloth.position.set(fx - 4.5, gy + 19, fz);
    group.add(pole, cloth);
  }
  return { group, colliders, slopes: [] };
}

// Coins thrown into a pen from outside the fence. Each one is lobbed on a long arc from
// somewhere 25-60 m outside the bars to a spot inside, and once it lands it stays, so
// the pen fills up over time. The bike picks one up within PICK. Some are big (twice
// the size, counting 10), and now and then a super coin, a standing disc like the
// big ones outside, drops in from high up (counting SUPER_COUNT).
const COIN_MAX = 4000;
const COIN_RATE = 10; // per second
const BIG_SHARE = 0.12;
const BIG_COUNT = 10;
const SUPER_R = 12;
const SUPER_COUNT = 20;
const SUPER_WORTH = 10000;
const SUPER_MIN = 30; // seconds between super coins
const SUPER_SPAN = 15;
const COIN_G = 20;
const PICK = 2.6;
const coinGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.12, 18);
const coinMat = new THREE.MeshStandardMaterial({
  color: new THREE.Color().setRGB(1.0, 0.78, 0.25, THREE.SRGBColorSpace),
  metalness: 0.6,
  roughness: 0.3,
  emissive: new THREE.Color().setRGB(0.85, 0.5, 0.08, THREE.SRGBColorSpace),
  emissiveIntensity: 0.9,
});

export class JailCoins {
  constructor(scene, team, heightAt) {
    this.team = team;
    this.heightAt = heightAt;
    this.inside = penBounds(team, 4);
    this.mesh = new THREE.InstancedMesh(coinGeo, coinMat, COIN_MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.coins = [];
    this.acc = 0;
    this.supers = [];
    this.superIn = 8;
    this.scene = scene;
    this.two = new THREE.Vector3(2, 2, 2);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.p = new THREE.Vector3();
    this.one = new THREE.Vector3(1, 1, 1);
  }

  throwOne() {
    const pen = PENS[this.team];
    const b = this.inside;
    // From outside: a random bearing from the pen center, past the fence.
    const a = Math.random() * Math.PI * 2;
    const reach = Math.max(HALF_X, HALF_Z) + 25 + Math.random() * 35;
    const sx = pen.x + Math.cos(a) * reach;
    const sz = pen.z + Math.sin(a) * reach;
    const sy = this.heightAt(sx, sz) + 2;
    const tx = b.x0 + Math.random() * (b.x1 - b.x0);
    const tz = b.z0 + Math.random() * (b.z1 - b.z0);
    const ty = this.heightAt(tx, tz) + 0.35;
    const T = 2.5 + Math.random() * 1.5;
    this.coins.push({
      x: sx, y: sy, z: sz, vx: (tx - sx) / T, vy: (ty - sy) / T + 0.5 * COIN_G * T, vz: (tz - sz) / T,
      t: 0, T, ty, landed: false, spin: 5 + Math.random() * 8, phase: Math.random() * 10,
      big: Math.random() < BIG_SHARE,
    });
  }

  // A super coin falls almost straight down from high above a spot in the pen.
  dropSuper() {
    const b = this.inside;
    const x = b.x0 + SUPER_R + Math.random() * (b.x1 - b.x0 - SUPER_R * 2);
    const z = b.z0 + SUPER_R + Math.random() * (b.z1 - b.z0 - SUPER_R * 2);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(SUPER_R, SUPER_R, 1.4, 48), coinMat);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.x = Math.PI / 2; // standing, like the discs outside
    const rest = this.heightAt(x, z) + SUPER_R + 0.2;
    mesh.position.set(x, rest + 160, z);
    this.scene.add(mesh);
    this.supers.push({ x, z, y: rest + 160, vy: 0, rest, mesh });
  }

  // Returns { count, worth }: bail count and coins the bike picked up this frame.
  update(dt, time, pos) {
    let count = 0;
    let worth = 0;
    this.superIn -= dt;
    if (this.superIn <= 0) {
      this.dropSuper();
      this.superIn = SUPER_MIN + Math.random() * SUPER_SPAN;
    }
    for (let i = this.supers.length - 1; i >= 0; i--) {
      const sc = this.supers[i];
      if (sc.y > sc.rest) {
        sc.vy -= COIN_G * dt;
        sc.y = Math.max(sc.rest, sc.y + sc.vy * dt);
      }
      sc.mesh.position.y = sc.y;
      sc.mesh.rotation.y = time * 0.4;
      // Touch it anywhere near its foot.
      if (sc.y < sc.rest + 20 && Math.hypot(sc.x - pos.x, sc.z - pos.z) < SUPER_R * 0.6 + 2) {
        this.scene.remove(sc.mesh);
        sc.mesh.geometry.dispose();
        this.supers.splice(i, 1);
        count += SUPER_COUNT;
        worth += SUPER_WORTH;
      }
    }
    this.acc += dt * COIN_RATE;
    while (this.acc >= 1) {
      this.acc -= 1;
      if (this.coins.length < COIN_MAX) this.throwOne();
    }
    let n = 0;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (!c.landed) {
        c.t += dt;
        c.vy -= COIN_G * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.z += c.vz * dt;
        if (c.t >= c.T) {
          c.y = c.ty;
          c.landed = true;
        }
      }
      const reach = c.big ? PICK * 1.6 : PICK;
      if (Math.abs(c.x - pos.x) < reach && Math.abs(c.z - pos.z) < reach && Math.abs(c.y - pos.y) < reach + 1) {
        this.coins[i] = this.coins[this.coins.length - 1];
        this.coins.pop();
        count += c.big ? BIG_COUNT : 1;
        worth += c.big ? 1000 : 100;
        continue;
      }
      this.e.set(c.landed ? Math.PI / 2 + 0.15 : time * 1.3 + c.phase, c.landed ? c.phase : time * c.spin, 0);
      this.q.setFromEuler(this.e);
      this.mesh.setMatrixAt(n++, this.m.compose(this.p.set(c.x, c.landed && c.big ? c.y + 0.1 : c.y, c.z), this.q, c.big ? this.two : this.one));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    return { count, worth };
  }
}

// What a rich enough player sees of the secret route: a glowing road, ghostly walls and
// the big coins along it. The finish gate shows to anyone close enough.
const ROUTE_COINS = 8;
const ROUTE_COIN_R = 2.6;
const roadMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.6, 1.2), transparent: true, opacity: 0.35, depthWrite: false });
const ghostMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.9, 1.4), transparent: true, opacity: 0.25, depthWrite: false });
const gateMat = new THREE.MeshStandardMaterial({ color: 0xd8c070, emissive: 0x6a4a10, roughness: 0.5 });

function finishTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c0182a';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#fff7e0';
  ctx.font = 'bold 84px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('終點', 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class RouteOverlay {
  constructor(scene, heightAt) {
    this.secret = new THREE.Group(); // only for the rich
    this.secret.visible = false;
    // Road: one flat ribbon per segment, a little above the ground.
    for (let i = 0; i < ROUTE.length - 1; i++) {
      const a = ROUTE[i];
      const b = ROUTE[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const geo = new THREE.PlaneGeometry(ROUTE_W * 2, len + ROUTE_W * 2);
      geo.rotateX(-Math.PI / 2); // flat, its length along local Z
      const road = new THREE.Mesh(geo, roadMat);
      road.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); // local +Z along the segment
      road.position.set((a.x + b.x) / 2, heightAt((a.x + b.x) / 2, (a.z + b.z) / 2) + 0.15, (a.z + b.z) / 2);
      road.renderOrder = 2;
      this.secret.add(road);
    }
    const ghosts = new THREE.InstancedMesh(barGeo, ghostMat, ROUTE_WALLS.length);
    const m = new THREE.Matrix4();
    ROUTE_WALLS.forEach((w, i) => ghosts.setMatrixAt(i, m.makeTranslation(w.x, heightAt(w.x, w.z) - 0.3, w.z)));
    this.secret.add(ghosts);
    scene.add(this.secret);

    // Big coins spaced along the route, past the fence.
    this.coins = [];
    const total = ROUTE.slice(1).reduce((s, b, i) => s + Math.hypot(b.x - ROUTE[i].x, b.z - ROUTE[i].z), 0);
    for (let k = 1; k <= ROUTE_COINS; k++) {
      const p = this.along((total * (k + 0.5)) / (ROUTE_COINS + 1.5));
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(ROUTE_COIN_R, ROUTE_COIN_R, 0.35, 32), coinMat);
      mesh.rotation.order = 'YXZ'; // stood up on X, then spun about the vertical
      mesh.rotation.x = Math.PI / 2;
      const y = heightAt(p.x, p.z) + ROUTE_COIN_R + 0.4;
      mesh.position.set(p.x, y, p.z);
      this.secret.add(mesh);
      this.coins.push({ x: p.x, z: p.z, y, mesh, taken: false });
    }

    // The finish gate: two posts and a red banner.
    const e = ROUTE_END;
    const p = ROUTE[ROUTE.length - 2];
    const yaw = Math.atan2(e.x - p.x, e.z - p.z);
    this.gate = new THREE.Group();
    this.gate.position.set(e.x, heightAt(e.x, e.z), e.z);
    this.gate.rotation.y = yaw;
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 7, 10), gateMat);
      post.position.set(sx * (ROUTE_W + 0.5), 3.5, 0);
      this.gate.add(post);
    }
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(ROUTE_W * 2 + 1, 2.2), new THREE.MeshBasicMaterial({ map: finishTexture(), side: THREE.DoubleSide }));
    banner.position.set(0, 6.2, 0);
    banner.rotation.y = Math.PI; // the text faces back down the route
    this.gate.add(banner);
    this.gate.visible = false;
    scene.add(this.gate);
  }

  // The point `d` metres along the route.
  along(d) {
    for (let i = 0; i < ROUTE.length - 1; i++) {
      const a = ROUTE[i];
      const b = ROUTE[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (d <= len) return { x: a.x + ((b.x - a.x) * d) / len, z: a.z + ((b.z - a.z) * d) / len };
      d -= len;
    }
    return ROUTE_END;
  }

  // Returns { coins, finished }: route coins picked up this frame, and whether the bike
  // reached the finish. The coins can be picked up seen or not.
  update(time, pos, rich) {
    this.secret.visible = rich;
    this.gate.visible = rich || Math.hypot(pos.x - ROUTE_END.x, pos.z - ROUTE_END.z) < 45;
    let coins = 0;
    for (const c of this.coins) {
      if (c.taken) continue;
      c.mesh.rotation.y = time * 1.5;
      if (Math.hypot(c.x - pos.x, c.z - pos.z) < ROUTE_COIN_R + 1.5 && Math.abs(c.y - pos.y) < ROUTE_COIN_R + 2) {
        c.taken = true;
        c.mesh.visible = false;
        coins++;
      }
    }
    const finished = Math.hypot(pos.x - ROUTE_END.x, pos.z - ROUTE_END.z) < ROUTE_W + 1;
    return { coins, finished };
  }
}
