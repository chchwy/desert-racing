import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, hashSeed } from './noise.js';
import { Batch } from './jungle.js';
import { onRoad } from './road.js';
import { LEVEL } from './levels.js';
import { lavaAt } from './lava.js';

// Other people's houses, scattered over every racing level. They are solid and their
// doors stay shut: only the player's own house (house.js) lets it in. At night their
// windows light up (setWindowGlow). Four instanced meshes per chunk: walls and roofs
// tinted per house, the trim, and the windows. They come from their own seed, after the
// chunk's props, so nothing else moves.
const TRIES = 3;
const KEEP = 0.55;
const SPAWN_CLEAR = 90;
const STEEP = 0.3;
const W = 8;
const D = 7;
const H = 4.5;
const ROOF = 2.6;

const WALLS = [0xead9b8, 0xd8e4ec, 0xf0d0c0, 0xe4e8cc, 0xf4f0e8, 0xc8d8c0].map((c) => new THREE.Color(c));
const ROOFS = [0xa83a2a, 0x3a5a8a, 0x4a6a3a, 0x7a4a2a, 0x8a2a4a, 0x505058].map((c) => new THREE.Color(c));

function merged(parts) {
  const geo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  parts.forEach((g) => g.dispose());
  geo.computeVertexNormals();
  return geo;
}

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

const wallGeo = box(W, H, D, 0, H / 2, 0);
const roofGeo = (() => {
  const tri = new THREE.Shape([new THREE.Vector2(-W / 2 - 0.6, 0), new THREE.Vector2(W / 2 + 0.6, 0), new THREE.Vector2(0, ROOF)]);
  const roof = new THREE.ExtrudeGeometry(tri, { depth: D + 1, bevelEnabled: false }).translate(0, H, -(D + 1) / 2);
  return merged([roof, box(0.9, 2.2, 0.9, 2, H + 1.6, -1.2)]);
})();
const trimGeo = merged([
  box(W + 0.6, 2, D + 0.6, 0, -0.6, 0),
  box(1.9, 3, 0.16, 0, 1.5, D / 2 + 0.05),
  ...[-1, 1].map((sx) => box(1.7, 0.12, 0.2, sx * 2.6, 1.9, D / 2 + 0.08)),
]);
const windowGeo = merged([-1, 1].flatMap((sx) => [box(1.5, 1.3, 0.1, sx * 2.6, 2.6, D / 2 + 0.03), box(1.5, 1.3, 0.1, sx * 2.6, 2.6, -D / 2 - 0.03)]));

const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
const roofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.8 });
const windowMat = new THREE.MeshStandardMaterial({ color: 0x1a2430, emissive: 0xffb050, emissiveIntensity: 0.05, roughness: 0.3 });

export function setWindowGlow(dark) {
  windowMat.emissiveIntensity = 0.05 + dark * 2.6;
}

export const HOUSES_HERE = LEVEL.id !== 'jail' && LEVEL.id !== 'penalty';

export function addHouses(props, cx, cz, size, heightAt) {
  const rng = mulberry32(hashSeed(cx + 51000, cz - 51000));
  const walls = new Batch(wallGeo, wallMat, { colors: true });
  const roofs = new Batch(roofGeo, roofMat, { colors: true });
  const trims = new Batch(trimGeo, trimMat);
  const windows = new Batch(windowGeo, windowMat, { shadow: false });
  for (let i = 0; i < TRIES; i++) {
    const x = (cx + rng()) * size;
    const z = (cz + rng()) * size;
    const yaw = rng() * Math.PI * 2;
    const wall = WALLS[Math.floor(rng() * WALLS.length)];
    const roof = ROOFS[Math.floor(rng() * ROOFS.length)];
    if (rng() > KEEP) continue;
    if (Math.hypot(x, z) < SPAWN_CLEAR || onRoad(x, z, 8)) continue;
    if (LEVEL.lava && lavaAt(x, z) > 0.05) continue;
    if (props.colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 8)) continue;
    if (Math.hypot(heightAt(x + 4, z) - heightAt(x - 4, z), heightAt(x, z + 4) - heightAt(x, z - 4)) / 8 > STEEP) continue;
    const y = Math.min(heightAt(x + 4, z + 4), heightAt(x - 4, z + 4), heightAt(x + 4, z - 4), heightAt(x - 4, z - 4), heightAt(x, z));
    walls.add(x, y, z, 1, 1, 1, yaw, 0, 0, wall);
    roofs.add(x, y, z, 1, 1, 1, yaw, 0, 0, roof);
    trims.add(x, y, z, 1, 1, 1, yaw);
    windows.add(x, y, z, 1, 1, 1, yaw);
    props.colliders.push({ x, z, r: 5.2, top: y + H + ROOF });
  }
  walls.build(props.group);
  roofs.build(props.group);
  trims.build(props.group);
  windows.build(props.group);
}
