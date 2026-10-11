import * as THREE from 'three';

const TOTAL = 100;
const GAP = 32;
const COIN_R = 2.55; // 5.1 m across, about the length of a car
const COIN_LIFT = COIN_R + 0.85; // bottom sits just above the sand
const PICKUP_R = COIN_R + 1.7;
const Y_REACH = 4.5;
const CLEAR = COIN_R + 2.2;

// Same basis as the bike's initial yaw (player.yaw = 0.9):
// forward (sin yaw, cos yaw), right (-forward.z, forward.x).
const YAW = 0.9;
const FX = Math.sin(YAW);
const FZ = Math.cos(YAW);
const RX = -FZ;
const RZ = FX;

const coinGeo = new THREE.CylinderGeometry(COIN_R, COIN_R, 0.5, 28);
coinGeo.rotateX(Math.PI / 2);

const gold = new THREE.MeshStandardMaterial({
  color: new THREE.Color().setRGB(0.95, 0.72, 0.22, THREE.SRGBColorSpace),
  metalness: 0.72,
  roughness: 0.32,
  emissive: new THREE.Color().setRGB(0.55, 0.28, 0.04, THREE.SRGBColorSpace),
  emissiveIntensity: 0.65,
});

const collected = new Set();
let count = 0;

export function coinCount() {
  return count;
}

// One bowed trail of 100 coins, starting ahead of the spawn and bending
// off the nose so it clears the pyramid group at (149, 118).
function pointAt(u) {
  const lat = Math.sin(u * 0.0034) * 340 + Math.sin(u * 0.011 + Math.PI) * 28;
  const along = 48 + u;
  return [FX * along + RX * lat, FZ * along + RZ * lat];
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
  return { x: p[0], z: p[1] };
}

export const coinPath = buildPath();

function nearestSolid(colliders, x, z, y) {
  const bottom = y - COIN_R;
  let best = null;
  for (const c of colliders) {
    if (c.top < bottom) continue;
    const dx = x - c.x;
    const dz = z - c.z;
    const dist = Math.hypot(dx, dz);
    const gap = dist - c.r;
    if (!best || gap < best.gap) best = { dx, dz, dist, gap };
  }
  return best;
}

// Slide a coin off a ruin so the trail stays collectible without leaving the line.
function nudge(x, z, colliders, heightAt) {
  let px = x;
  let pz = z;
  for (let n = 0; n < 6; n++) {
    const hit = nearestSolid(colliders, px, pz, heightAt(px, pz) + COIN_LIFT);
    if (!hit || hit.gap >= CLEAR) break;
    const dist = Math.max(hit.dist, 0.001);
    const push = CLEAR + 0.4 - hit.gap;
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

  for (const spot of coinPath) {
    if (Math.floor(spot.x / size) !== cx || Math.floor(spot.z / size) !== cz) continue;
    const id = 'path:' + spot.i;
    if (collected.has(id)) continue;
    const moved = nudge(spot.x, spot.z, colliders, heightAt);
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
    coin.mesh.rotation.y = time * 2.4 + coin.phase;
    coin.mesh.position.y = coin.baseY + Math.sin(time * 2.1 + coin.phase) * 0.35;
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
  count += gained;
  return gained;
}
