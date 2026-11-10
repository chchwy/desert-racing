import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, hashSeed } from './noise.js';
import { Batch } from './jungle.js';
import { onRoad } from './road.js';

// Cacti in the desert (LEVEL.cacti). A cactus does not block the bike or hurt it. The first
// rider to hit one withers it yellow; if that rider is the player, a spine sticks on the
// bike (main.js counts them). They come from their own seed, after the chunk's props, so
// the ruins do not move.

const PER_CHUNK = 8;
const SPAWN_CLEAR = 60;
const STEEP = 0.7; // rise over run: steeper ground stays bare
const HEIGHT = 5.2; // of the trunk at scale 1, with its rounded top
const SPINE_COUNT = 30;

const GREEN = new THREE.Color(0.16, 0.42, 0.2);
const WITHERED = new THREE.Color(0.62, 0.5, 0.14);

// A trunk or arm section standing on (x, y, z), with a rounded top.
function column(parts, x, y, z, r, h) {
  const body = new THREE.CylinderGeometry(r, r, h, 8, 1, true);
  body.translate(x, y + h / 2, z);
  const cap = new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.translate(x, y + h, z);
  parts.push(body, cap);
}

function merged(parts) {
  const geo = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  parts.forEach((g) => g.dispose());
  geo.computeVertexNormals();
  return geo;
}

function trunkGeometry() {
  const parts = [];
  column(parts, 0, 0, 0, 0.55, HEIGHT - 0.55);
  for (const [side, y, h] of [[1, 1.9, 1.3], [-1, 2.6, 1.0]]) {
    const elbow = new THREE.CylinderGeometry(0.3, 0.3, 1.1, 6, 1, true);
    elbow.rotateZ(Math.PI / 2);
    elbow.translate(side * 0.95, y, 0);
    parts.push(elbow);
    column(parts, side * 1.5, y - 0.3, 0, 0.3, h);
  }
  return merged(parts);
}

// The spines stand out of the trunk, in rows around it.
function spinesGeometry() {
  const parts = [];
  const rng = mulberry32(hashSeed(41, 73));
  const up = new THREE.Vector3(0, 1, 0);
  const out = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  for (let i = 0; i < SPINE_COUNT; i++) {
    const a = rng() * Math.PI * 2;
    const y = 0.3 + rng() * (HEIGHT - 1);
    out.set(Math.cos(a), 0.15, Math.sin(a)).normalize();
    turn.setFromUnitVectors(up, out);
    const spine = new THREE.ConeGeometry(0.035, 0.42, 3, 1, true);
    spine.translate(0, 0.21, 0);
    m.compose(new THREE.Vector3(Math.cos(a) * 0.5, y, Math.sin(a) * 0.5), turn, new THREE.Vector3(1, 1, 1));
    spine.applyMatrix4(m);
    parts.push(spine);
  }
  return merged(parts);
}

const trunkGeo = trunkGeometry();
const spinesGeo = spinesGeometry();
const trunkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true });
const spinesMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.95, 0.92, 0.78), roughness: 0.85, flatShading: true });

export function setWithered(c, withered) {
  c.withered = withered;
  c.mesh.setColorAt(c.index, withered ? WITHERED : GREEN);
  c.mesh.instanceColor.needsUpdate = true;
}

// Adds this chunk's cacti to its props group and returns them as { id, x, z, r, top, withered, mesh, index }.
// keep(x, z), when given, says where a cactus may stand; prefix keeps one level's ids apart.
export function addCacti(props, cx, cz, size, heightAt, keep = null, prefix = '') {
  const rng = mulberry32(hashSeed(cx + 21000, cz - 21000));
  const trunks = new Batch(trunkGeo, trunkMat, { colors: true });
  const spines = new Batch(spinesGeo, spinesMat);
  const cacti = [];
  for (let i = 0; i < PER_CHUNK; i++) {
    const x = (cx + rng()) * size;
    const z = (cz + rng()) * size;
    const s = 0.9 + rng() * 0.6;
    const yaw = rng() * Math.PI * 2;
    if (Math.hypot(x, z) < SPAWN_CLEAR || onRoad(x, z, 3 * s) || (keep && !keep(x, z))) continue;
    if (props.colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 2)) continue;
    if (Math.hypot(heightAt(x + 2, z) - heightAt(x - 2, z), heightAt(x, z + 2) - heightAt(x, z - 2)) / 4 > STEEP) continue;
    const y = heightAt(x, z);
    trunks.add(x, y - 0.1, z, s, s, s, yaw, 0, 0, GREEN);
    spines.add(x, y - 0.1, z, s, s, s, yaw);
    cacti.push({ id: `${prefix}${cx}:${cz}:${i}`, x, z, r: 1.1 * s, top: y + HEIGHT * s, withered: false, index: cacti.length });
  }
  const mesh = trunks.build(props.group);
  spines.build(props.group);
  for (const c of cacti) c.mesh = mesh;
  return cacti;
}
