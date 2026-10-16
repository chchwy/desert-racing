import * as THREE from 'three';
import { FRIEND, FOE } from './teams.js';

// The jail: two big pens fenced with iron bars, one per team, each with room for 500
// bikes parked in rows. The red pen is around the origin, so a jailed player starts
// inside it. Bars are spaced so the bike's 1.3 m padding cannot slip between them.
//
// Each pen has a way out: a few bars missing on its south side, easy to miss, open onto
// a secret winding route walled in on both sides. The walls are colliders with no mesh,
// and the routes are drawn only for a player rich enough to see them (RouteOverlay).
// Big coins sit along the way, and both routes end in the fenced arena where red and
// blue meet; reaching it is the finish.

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

// The secret routes: one out of each pen's south side (the blue one mirrors the red),
// ROUTE_W either side, both running into the arena where red and blue meet.
const RED_ROUTE = [[40, -60], [40, -110], [-20, -150], [-20, -200], [60, -240], [60, -305]];
export const ROUTES = {
  [FRIEND]: RED_ROUTE.map(([x, z]) => ({ x, z })),
  [FOE]: RED_ROUTE.map(([x, z]) => ({ x: PENS[FOE].x - x, z })),
};
export const ROUTE_W = 4;
export const ARENA = { x0: 40, x1: 220, z0: -370, z1: -295 };
export function inArena(x, z, margin = 0) {
  return x > ARENA.x0 + margin && x < ARENA.x1 - margin && z > ARENA.z0 + margin && z < ARENA.z1 - margin;
}

function distTo(route, x, z) {
  let best = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
  }
  return best;
}

// Distance from (x, z) to the nearer route.
export function routeDistance(x, z) {
  return Math.min(distTo(ROUTES[FRIEND], x, z), distTo(ROUTES[FOE], x, z));
}

// Wall posts along both sides of every segment, dropping the ones that would poke into
// the corridor at a bend, and the ones inside a pen or the arena (their fences do it).
function routeWalls() {
  const out = [];
  const off = ROUTE_W + 0.2;
  for (const route of Object.values(ROUTES)) {
    for (let i = 0; i < route.length - 1; i++) {
      const a = route[i];
      const b = route[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const ux = (b.x - a.x) / len;
      const uz = (b.z - a.z) / len;
      const n = Math.ceil(len / BAR_STEP);
      for (let k = 0; k <= n; k++) {
        for (const side of [-1, 1]) {
          const x = a.x + ux * (len * k) / n - uz * off * side;
          const z = a.z + uz * (len * k) / n + ux * off * side;
          if (inPen(FRIEND, x, z, -1) || inPen(FOE, x, z, -1) || inArena(x, z, -1)) continue;
          if (routeDistance(x, z) < ROUTE_W) continue;
          out.push({ x, z, yaw: Math.atan2(uz, ux) });
        }
      }
    }
  }
  return out;
}

// The arena's fence, open where the two routes come in.
function arenaFence() {
  const out = [];
  const side = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.round(len / BAR_STEP);
    const yaw = Math.atan2(z1 - z0, x1 - x0);
    for (let i = 0; i < n; i++) out.push({ x: x0 + ((x1 - x0) * i) / n, z: z0 + ((z1 - z0) * i) / n, yaw });
  };
  const a = ARENA;
  side(a.x0, a.z0, a.x1, a.z0);
  side(a.x1, a.z0, a.x1, a.z1);
  side(a.x1, a.z1, a.x0, a.z1);
  side(a.x0, a.z1, a.x0, a.z0);
  return out.filter((b) => routeDistance(b.x, b.z) > ROUTE_W);
}

const BARS = {
  // Each fence loses the bars where its route crosses it: that gap is the way out.
  red: perimeter(PENS[FRIEND]).filter((b) => routeDistance(b.x, b.z) > ROUTE_W),
  blue: perimeter(PENS[FOE]).filter((b) => routeDistance(b.x, b.z) > ROUTE_W),
  arena: arenaFence(),
};
export const ROUTE_WALLS = routeWalls();

// The gaps in the pen fences, closed by an invisible gate: colliders marked `gate`, which
// main.js leaves out for a rider holding enough coins to see the way out.
const GATE_POSTS = [PENS[FRIEND], PENS[FOE]].flatMap((pen) => perimeter(pen).filter((b) => routeDistance(b.x, b.z) <= ROUTE_W));

export function buildJailProps(cx, cz, size, heightAt) {
  const group = new THREE.Group();
  const colliders = [];
  const x0 = cx * size;
  const z0 = cz * size;
  const mine = [];
  for (const fence of Object.values(BARS)) {
    for (const b of fence) {
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
  for (const g of GATE_POSTS) {
    if (g.x < x0 || g.x >= x0 + size || g.z < z0 || g.z >= z0 + size) continue;
    colliders.push({ x: g.x, z: g.z, r: 0.15, top: heightAt(g.x, g.z) + BAR_H, gate: true });
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

// Coins that pile up in a locked-up space. In the jail they are lobbed on long arcs from
// 25-60 m outside the fence (`lobFrom`, the pen center); in the penalty jail they drop
// from machines over each room (`machines`). Once a coin lands it stays until someone
// picks it up, so the space fills over time. Some are big (twice the size, counting
// BIG_COUNT toward bail), and now and then a super coin, a standing disc like the big
// ones outside, falls in from high up (counting SUPER_COUNT). The bike picks one up
// within PICK; boxed swarm riders take them with take(). `coins` is the live list.
const COIN_MAX = 4000;
const COIN_G = 20;
const PICK = 2.6;
// Coin kinds: plain, big (twice the size) and huge (three times), with how much each
// counts toward bail and how many coins it is worth.
const KINDS = [
  { scale: 1, count: 1, worth: 100 },
  { scale: 2, count: 10, worth: 1000 },
  { scale: 3.2, count: 10, worth: 10000 },
];
const SUPER_COUNT = 20;
const SUPER_WORTH = 10000; // default; opts.superWorth overrides
const coinGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.12, 18);
const coinMat = new THREE.MeshStandardMaterial({
  color: new THREE.Color().setRGB(1.0, 0.78, 0.25, THREE.SRGBColorSpace),
  metalness: 0.6,
  roughness: 0.3,
  emissive: new THREE.Color().setRGB(0.85, 0.5, 0.08, THREE.SRGBColorSpace),
  emissiveIntensity: 0.9,
});

export class JailCoins {
  // opts: { bounds, lobFrom } or { bounds, machines }, plus rate (coins/s), bigShare,
  // superR, superMin and superSpan (seconds between super coins).
  constructor(scene, heightAt, opts) {
    this.heightAt = heightAt;
    this.inside = opts.bounds;
    this.lobFrom = opts.lobFrom ?? null;
    this.machines = opts.machines ?? null;
    this.rate = opts.rate ?? 10;
    // Share of each kind; bigShare alone means plain and big only.
    const big = opts.bigShare ?? 0.12;
    this.mix = opts.mix ?? [1 - big, big, 0];
    this.pieces = !!opts.pieces; // every coin counts 1 toward bail, whatever its size
    this.superWorth = opts.superWorth ?? SUPER_WORTH;
    this.fountain = opts.fountain ?? 0; // machines spray coins out to this radius
    this.superR = opts.superR ?? 12;
    this.superMin = opts.superMin ?? 30;
    this.superSpan = opts.superSpan ?? 15;
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
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.p = new THREE.Vector3();
    this.one = new THREE.Vector3(1, 1, 1);
    this.sc = new THREE.Vector3(1, 1, 1);
  }

  throwOne(pos) {
    const b = this.inside;
    let sx;
    let sz;
    let sy;
    let tx;
    let tz;
    if (this.machines) {
      // Out of a machine overhead, landing a few metres around under it. Most come out
      // of the machine over the bike's own room, so there is always plenty to grab.
      let mc = this.machines[Math.floor(Math.random() * this.machines.length)];
      if (Math.random() < 0.6) {
        let best = Infinity;
        for (const m of this.machines) {
          const d = (m.x - pos.x) ** 2 + (m.z - pos.z) ** 2;
          if (d < best) {
            best = d;
            mc = m;
          }
        }
      }
      sx = mc.x;
      sz = mc.z;
      sy = this.heightAt(sx, sz) + (this.fountain ? 15 : 11);
      const spread = this.fountain || 6;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spread;
      tx = THREE.MathUtils.clamp(mc.x + Math.cos(a) * r, b.x0, b.x1);
      tz = THREE.MathUtils.clamp(mc.z + Math.sin(a) * r, b.z0, b.z1);
    } else {
      // From outside: a random bearing from the pen center, past the fence.
      const a = Math.random() * Math.PI * 2;
      const reach = Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2 + 25 + Math.random() * 35;
      sx = this.lobFrom.x + Math.cos(a) * reach;
      sz = this.lobFrom.z + Math.sin(a) * reach;
      sy = this.heightAt(sx, sz) + 2;
      tx = b.x0 + Math.random() * (b.x1 - b.x0);
      tz = b.z0 + Math.random() * (b.z1 - b.z0);
    }
    const ty = this.heightAt(tx, tz) + 0.35;
    let T = this.machines ? 1 + Math.random() * 0.5 : 2.5 + Math.random() * 1.5;
    if (this.fountain) {
      // Sprayed up out of the machine, then down: the flight time that lands it at ty.
      const up = 10 + Math.random() * 12;
      T = (up + Math.sqrt(up * up + 2 * COIN_G * (sy - ty))) / COIN_G;
    }
    this.coins.push({
      x: sx, y: sy, z: sz, vx: (tx - sx) / T, vy: (ty - sy) / T + 0.5 * COIN_G * T, vz: (tz - sz) / T,
      t: 0, T, ty, landed: false, spin: 5 + Math.random() * 8, phase: Math.random() * 10,
      kind: this.pickKind(), live: true,
    });
  }

  pickKind() {
    let r = Math.random();
    for (let k = 0; k < this.mix.length; k++) {
      r -= this.mix[k];
      if (r < 0) return k;
    }
    return this.mix.length - 1;
  }

  // A super coin falls almost straight down from high above a spot inside.
  dropSuper() {
    const b = this.inside;
    const r = this.superR;
    const span = (lo, hi) => (hi - lo > r * 2 ? lo + r + Math.random() * (hi - lo - r * 2) : (lo + hi) / 2);
    const x = span(b.x0, b.x1);
    const z = span(b.z0, b.z1);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(0.4, r * 0.12), 48), coinMat);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.x = Math.PI / 2; // standing, like the discs outside
    const rest = this.heightAt(x, z) + r + 0.2;
    const top = this.machines ? 11 : 160;
    mesh.position.set(x, rest + top, z);
    this.scene.add(mesh);
    this.supers.push({ x, z, y: rest + top, vy: 0, rest, mesh, r });
  }

  // Someone else picked coin c up: returns its bail count.
  take(c) {
    if (!c.live) return 0;
    c.live = false;
    const i = this.coins.indexOf(c);
    if (i >= 0) {
      this.coins[i] = this.coins[this.coins.length - 1];
      this.coins.pop();
    }
    return this.pieces ? 1 : KINDS[c.kind].count;
  }

  // Returns { count, worth }: bail count and coins the bike picked up this frame.
  update(dt, time, pos) {
    let count = 0;
    let worth = 0;
    this.superIn -= dt;
    if (this.superIn <= 0) {
      this.dropSuper();
      this.superIn = this.superMin + Math.random() * this.superSpan;
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
      if (sc.y < sc.rest + 20 && Math.hypot(sc.x - pos.x, sc.z - pos.z) < sc.r * 0.6 + 2) {
        this.scene.remove(sc.mesh);
        sc.mesh.geometry.dispose();
        this.supers.splice(i, 1);
        count += this.pieces ? 1 : SUPER_COUNT;
        worth += this.superWorth;
      }
    }
    this.acc += dt * this.rate;
    while (this.acc >= 1) {
      this.acc -= 1;
      if (this.coins.length < COIN_MAX) this.throwOne(pos);
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
      const kind = KINDS[c.kind];
      const reach = PICK * (1 + (kind.scale - 1) * 0.6);
      if (Math.abs(c.x - pos.x) < reach && Math.abs(c.z - pos.z) < reach && Math.abs(c.y - pos.y) < reach + 1) {
        c.live = false;
        this.coins[i] = this.coins[this.coins.length - 1];
        this.coins.pop();
        count += this.pieces ? 1 : kind.count;
        worth += kind.worth;
        continue;
      }
      this.e.set(c.landed ? Math.PI / 2 + 0.15 : time * 1.3 + c.phase, c.landed ? c.phase : time * c.spin, 0);
      this.q.setFromEuler(this.e);
      this.sc.setScalar(kind.scale);
      this.mesh.setMatrixAt(n++, this.m.compose(this.p.set(c.x, c.landed ? c.y + (kind.scale - 1) * 0.06 : c.y, c.z), this.q, this.sc));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    return { count, worth };
  }
}

// What a rich enough player sees of the secret routes: glowing roads, ghostly walls and
// the big coins along them. The finish banner over the arena shows to anyone close.
const ROUTE_COINS = 6; // per route
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

// The point `d` metres along a route.
function along(route, d) {
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (d <= len) return { x: a.x + ((b.x - a.x) * d) / len, z: a.z + ((b.z - a.z) * d) / len };
    d -= len;
  }
  return route[route.length - 1];
}

export class RouteOverlay {
  constructor(scene, heightAt) {
    this.secret = new THREE.Group(); // only for the rich
    this.secret.visible = false;
    this.coins = [];
    for (const route of Object.values(ROUTES)) {
      // Road: one flat ribbon per segment, a little above the ground.
      for (let i = 0; i < route.length - 1; i++) {
        const a = route[i];
        const b = route[i + 1];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const geo = new THREE.PlaneGeometry(ROUTE_W * 2, len + ROUTE_W * 2);
        geo.rotateX(-Math.PI / 2); // flat, its length along local Z
        const road = new THREE.Mesh(geo, roadMat);
        road.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); // local +Z along the segment
        road.position.set((a.x + b.x) / 2, heightAt((a.x + b.x) / 2, (a.z + b.z) / 2) + 0.15, (a.z + b.z) / 2);
        road.renderOrder = 2;
        this.secret.add(road);
      }
      // Big coins spaced along the route, past the fence.
      const total = route.slice(1).reduce((s, b, i) => s + Math.hypot(b.x - route[i].x, b.z - route[i].z), 0);
      for (let k = 1; k <= ROUTE_COINS; k++) {
        const p = along(route, (total * (k + 0.5)) / (ROUTE_COINS + 1.5));
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(ROUTE_COIN_R, ROUTE_COIN_R, 0.35, 32), coinMat);
        mesh.rotation.order = 'YXZ'; // stood up on X, then spun about the vertical
        mesh.rotation.x = Math.PI / 2;
        const y = heightAt(p.x, p.z) + ROUTE_COIN_R + 0.4;
        mesh.position.set(p.x, y, p.z);
        this.secret.add(mesh);
        this.coins.push({ x: p.x, z: p.z, y, mesh, taken: false });
      }
    }
    const ghosts = new THREE.InstancedMesh(barGeo, ghostMat, ROUTE_WALLS.length);
    const m = new THREE.Matrix4();
    ROUTE_WALLS.forEach((w, i) => ghosts.setMatrixAt(i, m.makeTranslation(w.x, heightAt(w.x, w.z) - 0.3, w.z)));
    this.secret.add(ghosts);
    scene.add(this.secret);

    // The finish: a big banner on two posts over the middle of the arena.
    const cx = (ARENA.x0 + ARENA.x1) / 2;
    const cz = (ARENA.z0 + ARENA.z1) / 2;
    this.gate = new THREE.Group();
    this.gate.position.set(cx, heightAt(cx, cz), ARENA.z1 - 6);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 14, 10), gateMat);
      post.position.set(sx * 14, 7, 0);
      this.gate.add(post);
    }
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(28, 7), new THREE.MeshBasicMaterial({ map: finishTexture(), side: THREE.DoubleSide }));
    banner.position.set(0, 12, 0);
    banner.rotation.y = Math.PI; // the text faces the routes coming in from the north
    this.gate.add(banner);
    this.gate.visible = false;
    scene.add(this.gate);
  }

  // Returns { coins, finished }: route coins picked up this frame, and whether the bike
  // reached the arena. The coins can be picked up seen or not.
  update(time, pos, rich) {
    this.secret.visible = rich;
    const cx = (ARENA.x0 + ARENA.x1) / 2;
    this.gate.visible = rich || inArena(pos.x, pos.z, -80) || Math.abs(pos.x - cx) < 60 && pos.z < ARENA.z1 + 60;
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
    return { coins, finished: inArena(pos.x, pos.z, 3) };
  }
}
