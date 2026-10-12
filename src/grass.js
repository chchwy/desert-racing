import * as THREE from 'three';
import { fbm, mulberry32, hashSeed } from './noise.js';
import { heightAt } from './terrain.js';

// Tall prairie grass, streamed in square tiles around the bike. Each tile is one pooled
// InstancedMesh of grass tufts set on the height field. Tufts are written in
// random order, so lowering `count` thins a far tile evenly instead of cutting a corner.
//
// The vertex shader works in world space after instancing: wind gusts roll across the
// field, the bike parts the grass around it, blades near the camera lie down so the
// chase view is not a wall of green, and the patch rim shrinks to nothing.

const TILE = 20; // metres
const PER_TILE = 520; // tufts in a full-density tile (~1.3 per m²)
const RADIUS = 100; // grass reaches this far from the bike
const FULL = 45; // full density inside this, thinning to FAR_DENSITY at the rim
const FAR_DENSITY = 0.35;
const MAX_BUILDS_PER_FRAME = 3;

const BLADES = 6;
const SEGS = 3;

// One tuft: a few tapered, curved blades from a small base, 1 unit tall at most.
// aBlade.x = height fraction along the blade, aBlade.y = per-blade random.
function tuftGeometry() {
  const rng = mulberry32(90210);
  const pos = [];
  const nrm = [];
  const col = [];
  const blade = [];
  const idx = [];
  for (let b = 0; b < BLADES; b++) {
    const base = pos.length / 3;
    const a = rng() * Math.PI * 2;
    const off = rng() * 0.22;
    const ox = Math.cos(a) * off;
    const oz = Math.sin(a) * off;
    const lean = rng() * Math.PI * 2;
    const lx = Math.cos(lean);
    const lz = Math.sin(lean);
    const bend = 0.12 + rng() * 0.28;
    const hb = 0.7 + rng() * 0.3;
    const w0 = 0.045 + rng() * 0.035;
    const face = rng() * Math.PI * 2;
    const wx = Math.cos(face);
    const wz = Math.sin(face);
    const r = rng();
    for (let i = 0; i <= SEGS; i++) {
      const t = i / SEGS;
      const cx = ox + lx * bend * t * t;
      const cz = oz + lz * bend * t * t;
      const y = t * hb;
      const w = w0 * (1 - t * 0.92);
      for (const side of [-1, 1]) {
        pos.push(cx + wx * w * side, y, cz + wz * w * side);
        // Mostly up, so the field lights softly from either side of a blade.
        const n = new THREE.Vector3(-wz * 0.35, 1, wx * 0.35).normalize();
        nrm.push(n.x, n.y, n.z);
        const shade = 0.35 + 0.65 * t;
        col.push(shade, shade, shade);
        blade.push(t, r);
      }
    }
    for (let i = 0; i < SEGS; i++) {
      const k = base + i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aBlade', new THREE.Float32BufferAttribute(blade, 2));
  g.setIndex(idx);
  return g;
}

const srgb = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
const GREEN = srgb(0.4, 0.56, 0.17);
const GOLD = srgb(0.74, 0.7, 0.32);
const DEEP = srgb(0.3, 0.45, 0.14);

const GRASS_HEADER = /* glsl */ `
attribute vec2 aBlade;
uniform float uTime;
uniform vec3 uFocus;
uniform vec3 uCam;
uniform float uRadius;
`;

const GRASS_PROJECT = /* glsl */ `
vec4 gw = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
float tall = length(instanceMatrix[1].xyz);
float t = aBlade.x;

// Rim of the patch shrinks to the ground.
float grow = 1.0 - smoothstep(uRadius - 45.0, uRadius, distance(root.xz, uFocus.xz));
// Blades by the camera lie down so the chase view sees over them.
float clear = smoothstep(1.5, 5.0, distance(root.xz, uCam.xz));
// The bike parts the grass.
vec2 away = root.xz - uFocus.xz;
float dBike = length(away);
float part = 1.0 - smoothstep(1.0, 3.4, dBike);
vec2 push = dBike > 0.001 ? away / dBike * part * 1.4 : vec2(0.0);

// Gusts roll across the field; each blade flutters on its own phase.
vec2 windDir = vec2(0.87, 0.49);
float gust = sin(dot(root.xz, vec2(0.05, 0.03)) - uTime * 1.6) * 0.5 + 0.5;
float flutter = sin(uTime * 3.3 + aBlade.y * 6.283 + root.x * 0.4 + root.z * 0.3);
vec2 sway = windDir * (0.12 + 0.38 * gust) + vec2(-windDir.y, windDir.x) * flutter * 0.08;

float keep = grow * clear * (1.0 - part * 0.6);
float bend = t * t * tall;
gw.y = root.y + (gw.y - root.y) * keep;
gw.xz = root.xz + (gw.xz - root.xz) * mix(1.0, keep, 0.4) + (sway + push) * bend * keep;

vec4 mvPosition = viewMatrix * gw;
gl_Position = projectionMatrix * mvPosition;
`;

export class Grass {
  constructor(scene) {
    this.scene = scene;
    this.geometry = tuftGeometry();
    this.uniforms = {
      uTime: { value: 0 },
      uFocus: { value: new THREE.Vector3() },
      uCam: { value: new THREE.Vector3() },
      uRadius: { value: RADIUS },
    };
    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.82,
      side: THREE.DoubleSide,
    });
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = GRASS_HEADER + shader.vertexShader.replace('#include <project_vertex>', GRASS_PROJECT);
    };
    this.material.customProgramCacheKey = () => 'prairie-grass-1';
    this.tiles = new Map();
    this.pool = [];
    this.queue = [];
    this.center = null;
    this.matrix = new THREE.Matrix4();
    this.quat = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.pos = new THREE.Vector3();
    this.scale = new THREE.Vector3();
    this.color = new THREE.Color();
  }

  take() {
    const mesh = this.pool.pop();
    if (mesh) return mesh;
    const m = new THREE.InstancedMesh(this.geometry, this.material, PER_TILE);
    m.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    m.setColorAt(0, this.color.set(0xffffff));
    m.receiveShadow = true;
    m.castShadow = false;
    return m;
  }

  fill(mesh, tx, tz) {
    const rng = mulberry32(hashSeed(tx + 7000, tz - 7000));
    const x0 = tx * TILE;
    const z0 = tz * TILE;
    for (let i = 0; i < PER_TILE; i++) {
      const x = x0 + rng() * TILE;
      const z = z0 + rng() * TILE;
      // Patches of taller and shorter grass, and a golden cast where it is dry.
      const lush = fbm(x * 0.018 + 3.1, z * 0.018 + 7.7, 2);
      const dry = fbm(x * 0.006 + 11.3, z * 0.006 + 1.9, 2);
      const h = (1.0 + rng() * 0.6) * (0.75 + lush * 0.55);
      const w = 0.9 + rng() * 0.5;
      this.pos.set(x, heightAt(x, z) - 0.05, z);
      this.quat.setFromAxisAngle(this.up, rng() * Math.PI * 2);
      this.scale.set(w, h, w);
      mesh.setMatrixAt(i, this.matrix.compose(this.pos, this.quat, this.scale));
      this.color.copy(DEEP).lerp(GREEN, rng()).lerp(GOLD, THREE.MathUtils.clamp(dry * 1.6 - 0.55, 0, 0.8) * (0.6 + rng() * 0.4));
      mesh.setColorAt(i, this.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.count = PER_TILE;
    mesh.computeBoundingSphere();
  }

  density(d) {
    if (d <= FULL) return 1;
    return THREE.MathUtils.lerp(1, FAR_DENSITY, THREE.MathUtils.clamp((d - FULL) / (RADIUS - FULL), 0, 1));
  }

  update(focus, cam, time, force = false) {
    this.uniforms.uTime.value = time;
    this.uniforms.uFocus.value.copy(focus);
    this.uniforms.uCam.value.copy(cam);

    const cx = Math.floor(focus.x / TILE);
    const cz = Math.floor(focus.z / TILE);
    const key = cx + ',' + cz;
    if (key !== this.center || force) {
      this.center = key;
      const reach = Math.ceil(RADIUS / TILE);
      const wanted = new Map();
      for (let dz = -reach; dz <= reach; dz++) {
        for (let dx = -reach; dx <= reach; dx++) {
          // Distance from the bike to the nearest point of the tile.
          const nx = Math.max(0, Math.abs(dx) - 1) * TILE;
          const nz = Math.max(0, Math.abs(dz) - 1) * TILE;
          const d = Math.hypot(nx, nz);
          if (d > RADIUS) continue;
          wanted.set((cx + dx) + ',' + (cz + dz), { tx: cx + dx, tz: cz + dz, d });
        }
      }
      for (const [k, tile] of this.tiles) {
        if (wanted.has(k)) continue;
        this.scene.remove(tile.mesh);
        this.pool.push(tile.mesh);
        this.tiles.delete(k);
      }
      this.queue = [];
      for (const [k, w] of wanted) {
        const tile = this.tiles.get(k);
        if (tile) tile.mesh.count = Math.round(PER_TILE * this.density(w.d));
        else this.queue.push({ k, ...w });
      }
      this.queue.sort((a, b) => a.d - b.d);
    }

    const budget = force ? Infinity : MAX_BUILDS_PER_FRAME;
    for (let i = 0; i < budget && this.queue.length; i++) {
      const job = this.queue.shift();
      if (this.tiles.has(job.k)) continue;
      const mesh = this.take();
      this.fill(mesh, job.tx, job.tz);
      mesh.count = Math.round(PER_TILE * this.density(job.d));
      this.scene.add(mesh);
      this.tiles.set(job.k, { mesh });
    }
  }
}
