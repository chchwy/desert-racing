import * as THREE from 'three';

const TOTAL = 100000;
// 2.8 km across: wider than the stretch of desert the fog used to show (~1.9 km),
// and far larger than the cat (~1.9 m).
export const COIN_R = 1400;
const COIN_THICK = 120;
const RIM_GAP = 480;
const GAP = COIN_R * 2 + RIM_GAP;
const AHEAD = COIN_R + 360; // near rim sits ahead of spawn; pyramids stay outside the disc
const COIN_LIFT = COIN_R + 6; // bottom sits just above the sand
const PICKUP_R = COIN_R + 12;
const Y_REACH = COIN_LIFT + 40; // center is one radius up; a ground bike must still reach it
const HUB = 8;
const SPIN = 0.1;
// One big disc stands in for this many small coins. The HUD shows the small-coin total.
const COIN_WORTH = 10000;

// Same basis as the bike's initial yaw (player.yaw = 0.9):
// forward (sin yaw, cos yaw), right (-forward.z, forward.x).
const YAW = 0.9;
const FX = Math.sin(YAW);
const FZ = Math.cos(YAW);
const RX = -FZ;
const RZ = FX;

const coinGeo = new THREE.CylinderGeometry(COIN_R, COIN_R, COIN_THICK, 80);
coinGeo.rotateX(Math.PI / 2);

const gold = new THREE.MeshStandardMaterial({
  color: new THREE.Color().setRGB(0.95, 0.72, 0.22, THREE.SRGBColorSpace),
  metalness: 0.42,
  roughness: 0.4,
  emissive: new THREE.Color().setRGB(0.72, 0.42, 0.08, THREE.SRGBColorSpace),
  emissiveIntensity: 1,
  fog: false, // seen through any level's fog, so the next disc is always in sight
});

const collected = new Set();
let count = 0;

export function coinCount() {
  return count;
}

// Small coins picked up outside the big discs (the coin rain).
export function addCoins(n) {
  count += n;
}

// The war save carries the count across level reloads, and a shot can empty it.
export function setCoins(n) {
  count = n;
}

export function formatCoinCount(n = count) {
  return n.toLocaleString('zh-Hant');
}

// One bowed trail, starting ahead of the spawn and bending off the nose
// so the first discs clear the pyramid group at (149, 118).
// The third component is the forward projection, strictly increasing with u.
function pointAt(u) {
  const lat = Math.sin(u * 0.0034) * 340 + Math.sin(u * 0.011 + Math.PI) * 28;
  const along = AHEAD + u;
  return [FX * along + RX * lat, FZ * along + RZ * lat, along];
}

function buildPath() {
  const pts = [{ i: 0, ...xy(pointAt(0)) }];
  let u = 0;
  let prev = pointAt(0);
  for (let i = 1; i < TOTAL; i++) {
    let lo = u;
    let hi = u + GAP;
    for (let k = 0; k < 14; k++) {
      const mid = (lo + hi) / 2;
      const p = pointAt(mid);
      const d = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      if (d < GAP) lo = mid;
      else hi = mid;
    }
    u = (lo + hi) / 2;
    prev = pointAt(u);
    pts.push({ i, ...xy(prev) });
  }
  return pts;
}

function xy(p) {
  return { x: p[0], z: p[1], a: p[2] };
}

export const coinPath = buildPath();

const EMPTY = [];
let bucketSize = 0;
const buckets = new Map();

function ensureBuckets(size) {
  if (bucketSize === size) return;
  buckets.clear();
  bucketSize = size;
  for (const spot of coinPath) {
    const k = Math.floor(spot.x / size) + ',' + Math.floor(spot.z / size);
    let list = buckets.get(k);
    if (!list) buckets.set(k, (list = []));
    list.push(spot);
  }
}

export function coinsInChunk(cx, cz, size) {
  ensureBuckets(size);
  return buckets.get(cx + ',' + cz) || EMPTY;
}

// Spots are sorted by forward projection. A full scan of 100000 is unnecessary.
export function coinsNear(x, z, reach) {
  const along = x * FX + z * FZ;
  const reach2 = reach * reach;
  let lo = 0;
  let hi = coinPath.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (coinPath[mid].a < along - reach) lo = mid + 1;
    else hi = mid;
  }
  const out = [];
  for (let i = lo; i < coinPath.length && coinPath[i].a <= along + reach; i++) {
    const spot = coinPath[i];
    const dx = spot.x - x;
    const dz = spot.z - z;
    if (dx * dx + dz * dz <= reach2) out.push(spot);
  }
  return out;
}

// The closest disc center within reach that has not been collected, or null.
export function nearestCoin(x, z, reach) {
  let best = null;
  let bestD2 = Infinity;
  for (const spot of coinsNear(x, z, reach)) {
    if (collected.has('path:' + spot.i)) continue;
    const d2 = (spot.x - x) ** 2 + (spot.z - z) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = spot;
    }
  }
  return best;
}

function nearestHub(colliders, x, z) {
  let best = null;
  for (const c of colliders) {
    if (c.top < 1) continue;
    const dx = x - c.x;
    const dz = z - c.z;
    const dist = Math.hypot(dx, dz);
    const gap = dist - c.r;
    if (!best || gap < best.gap) best = { dx, dz, dist, gap };
  }
  return best;
}

// The disc dwarfs ruins. Only slide the hub out of a solid it is actually sitting in.
function nudge(x, z, colliders) {
  let px = x;
  let pz = z;
  for (let n = 0; n < 6; n++) {
    const hit = nearestHub(colliders, px, pz);
    if (!hit || hit.gap >= HUB) break;
    const dist = Math.max(hit.dist, 0.001);
    const push = HUB + 0.4 - hit.gap;
    px += (hit.dx / dist) * push;
    pz += (hit.dz / dist) * push;
  }
  return { x: px, z: pz };
}

function segmentHits(x0, z0, x1, z1, cx, cz, r) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  let t = 0;
  if (len2 > 1e-8) {
    t = THREE.MathUtils.clamp(((cx - x0) * dx + (cz - z0) * dz) / len2, 0, 1);
  }
  const px = x0 + dx * t - cx;
  const pz = z0 + dz * t - cz;
  return px * px + pz * pz <= r * r;
}

export function buildChunkCoins(cx, cz, size, heightAt, colliders) {
  const group = new THREE.Group();
  const list = [];

  for (const spot of coinsInChunk(cx, cz, size)) {
    const id = 'path:' + spot.i;
    if (collected.has(id)) continue;
    const moved = nudge(spot.x, spot.z, colliders);
    const y = heightAt(moved.x, moved.z) + COIN_LIFT;
    const phase = spot.i * 0.55;
    const mesh = new THREE.Mesh(coinGeo, gold);
    mesh.position.set(moved.x, y, moved.z);
    mesh.rotation.y = phase;
    group.add(mesh);
    list.push({ id, mesh, x: moved.x, z: moved.z, baseY: y, phase, taken: false });
  }

  return { group, list };
}

export function updateChunkCoins(list, time) {
  for (const coin of list) {
    if (coin.taken) continue;
    coin.mesh.rotation.y = time * SPIN + coin.phase;
    coin.mesh.position.y = coin.baseY + Math.sin(time * 0.45 + coin.phase) * 10;
  }
}

// Sweep the frame's path so a fast bike cannot skip through a coin.
export function collectChunkCoins(list, prev, pos) {
  const yMin = Math.min(prev.y, pos.y) - Y_REACH;
  const yMax = Math.max(prev.y, pos.y) + Y_REACH;
  let gained = 0;
  for (const coin of list) {
    if (coin.taken) continue;
    if (coin.baseY < yMin || coin.baseY > yMax) continue;
    if (!segmentHits(prev.x, prev.z, pos.x, pos.z, coin.x, coin.z, PICKUP_R)) continue;
    coin.taken = true;
    collected.add(coin.id);
    coin.mesh.visible = false;
    gained++;
  }
  count += gained * COIN_WORTH;
  return gained;
}
