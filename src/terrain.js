import * as THREE from 'three';
import { fbm, valueNoise } from './noise.js';
import { LEVEL } from './levels.js';
import { roadMask, onRoad, HAS_ROAD } from './road.js';
import { lavaAt, VOLCANO } from './lava.js';
import { buildChunkProps as buildDesertProps, pyramidFace } from './props.js';
import { buildJungleProps } from './jungle.js';
import { buildGrasslandProps } from './grassland.js';
import { buildSnowProps } from './snow.js';
import { buildVolcanoProps } from './volcano.js';
import { buildReefProps } from './reef.js';
import { buildJailProps } from './jail.js';
import { buildPenaltyProps } from './penalty.js';
import { addCacti, setWithered } from './cactus.js';
import { addOutside, density } from './outside.js';
import { buildChunkCoins, collectChunkCoins, updateChunkCoins, coinsNear, COIN_R } from './coins.js';

export const CHUNK_SIZE = 200;
const CHUNK_SEGMENTS = 64;
const VIEW_RADIUS = 4; // chunks around the player
// One per frame: a chunk costs 8–20 ms, and even at top speed a new row of chunks is
// needed only every few seconds.
const MAX_BUILDS_PER_FRAME = 1;

const smooth = (t) => t * t * (3 - 2 * t);

// Dune height field. Asymmetric ridges (gentle windward side, steep lee side)
// laid along a domain-warped wind direction, on top of broad rolling swells.
function duneHeight(x, z) {
  const wx = x + (fbm(x * 0.0025, z * 0.0025, 3) - 0.5) * 170;
  const wz = z + (fbm(x * 0.0025 + 31.7, z * 0.0025 + 11.3, 3) - 0.5) * 170;

  const w = (wx * 0.8 + wz * 0.6) / 115;
  const s = w - Math.floor(w);
  const ridge = s < 0.66 ? smooth(s / 0.66) : smooth(1 - (s - 0.66) / 0.34);
  const ridgeAmp = 5 + fbm(x * 0.003 + 7.3, z * 0.003 + 3.1, 2) * 18;

  const swell = fbm(x * 0.0011, z * 0.0011, 3) * 45;
  const bumps = (fbm(x * 0.018, z * 0.018, 2) - 0.5) * 1.6;
  return ridge * ridgeAmp + swell + bumps;
}

// Jungle floor. Rounded ridged hills over broad swells, with root-and-moss lumps.
function jungleHeight(x, z) {
  const wx = x + (fbm(x * 0.002 + 4.1, z * 0.002, 3) - 0.5) * 120;
  const wz = z + (fbm(x * 0.002, z * 0.002 + 8.7, 3) - 0.5) * 120;
  const r = 1 - Math.abs(fbm(wx * 0.0042, wz * 0.0042, 3) * 2 - 1);
  const hills = r * r * 26;
  const swell = fbm(x * 0.0012 + 3.3, z * 0.0012 + 1.9, 3) * 50;
  const lumps = (fbm(x * 0.03, z * 0.03, 2) - 0.5) * 1.4;
  return hills + swell + lumps;
}

// Prairie. Long low swells with a gentle roll on top, easy to ride flat out.
function plainsHeight(x, z) {
  const swell = fbm(x * 0.0011 + 9.1, z * 0.0011 + 2.7, 3) * 40;
  const roll = fbm(x * 0.005 + 1.3, z * 0.005 + 6.1, 3) * 9;
  const lumps = (fbm(x * 0.04, z * 0.04, 2) - 0.5) * 0.6;
  return swell + roll + lumps;
}

// Snow mountains. Sharp ridged peaks rise out of a broad valley; the start sits on
// the valley floor, and the ridges climb in from about 250 m out.
function snowHeight(x, z) {
  const wx = x + (fbm(x * 0.0007 + 2.2, z * 0.0007, 3) - 0.5) * 500;
  const wz = z + (fbm(x * 0.0007, z * 0.0007 + 6.6, 3) - 0.5) * 500;
  const ridge = 1 - Math.abs(fbm(wx * 0.0009, wz * 0.0009, 4) * 2 - 1);
  const fine = 1 - Math.abs(fbm(wx * 0.004 + 9.1, wz * 0.004 + 3.3, 3) * 2 - 1);
  const range = smooth(THREE.MathUtils.clamp((fbm(x * 0.0005 + 5.1, z * 0.0005 + 5.7, 3) - 0.3) / 0.4, 0, 1));
  const valley = smooth(THREE.MathUtils.clamp((Math.hypot(x, z) - 250) / 650, 0, 1));
  const peaks = (ridge ** 3 * 300 + fine * fine * 22) * (0.2 + 0.8 * range) * valley;
  const floor = fbm(x * 0.003 + 1.7, z * 0.003 + 4.4, 3) * 18;
  const lumps = (fbm(x * 0.03, z * 0.03, 2) - 0.5) * 0.8;
  return peaks + floor + lumps;
}

// Volcano. A big cone with a lava-filled crater stands about 1.5 km out (lava.js); around
// the start is a rugged basalt plain cut by glowing lava channels.
function volcanoHeight(x, z) {
  const ridge = 1 - Math.abs(fbm(x * 0.006 + 2.9, z * 0.006 + 5.3, 3) * 2 - 1);
  const rugged = fbm(x * 0.004 + 6.1, z * 0.004 + 0.7, 4) * 20 + ridge * ridge * 7;
  const swell = fbm(x * 0.0012 + 3.7, z * 0.0012 + 9.2, 3) * 30;
  const r = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
  const { radius: R, height: H, crater: CR, craterDepth: CD } = VOLCANO;
  let cone = 0;
  if (r < R) {
    const rim = H * (1 - CR / R) ** 1.8;
    cone = r > CR ? H * (1 - r / R) ** 1.8 : rim - CD * (1 - (r / CR) ** 2);
  }
  cone *= 1 - roadMask(x, z); // the road cuts straight through the cone
  const plain = (rugged + swell) * (1 - smooth(THREE.MathUtils.clamp(1 - r / R, 0, 1)) * 0.7);
  const lumps = (fbm(x * 0.035, z * 0.035, 2) - 0.5) * 1.2;
  return plain + cone + lumps - lavaAt(x, z) * 4;
}

// Seabed. Broad slopes and swells stepped into reef terraces, and in some regions
// seamount ridges tall enough to break the surface (LEVEL.sea) as islands. Long winding
// trenches drop TRENCH_DEPTH down steep walls to a ledge, then an abyss slot falls
// ABYSS_DEPTH more, past where the light and the fog reach. The start and the shipwreck
// sit on calm sand, and no trench crosses them.
const TRENCH_DEPTH = 100;
const ABYSS_DEPTH = 200;

function terrace(h, step) {
  const k = h / step;
  const f = k - Math.floor(k);
  return (Math.floor(k) + smooth(smooth(f))) * step;
}

function seabedHeight(x, z) {
  const calm = smooth(THREE.MathUtils.clamp((Math.hypot(x, z) - 50) / 100, 0, 1))
    * smooth(THREE.MathUtils.clamp((Math.hypot(x - 149, z - 118) - 70) / 120, 0, 1))
    * (1 - roadMask(x, z)); // no trench or seamount on the road
  const shelf = (fbm(x * 0.0007 + 8.1, z * 0.0007 + 2.2, 3) - 0.5) * 110;
  const swell = fbm(x * 0.003 + 4.4, z * 0.003 + 0.6, 3) * 16;
  const region = smooth(THREE.MathUtils.clamp((fbm(x * 0.0006 + 3.3, z * 0.0006 + 7.1, 2) - 0.45) / 0.2, 0, 1));
  const ridge = 1 - Math.abs(fbm(x * 0.0028 + 1.9, z * 0.0028 + 6.4, 3) * 2 - 1);
  const seamount = ridge ** 3 * 220 * region;
  const k = smooth(THREE.MathUtils.clamp((fbm(x * 0.005 + 21.7, z * 0.005 + 13.9, 2) - 0.66) / 0.1, 0, 1));
  const knoll = Math.sqrt(k) * 125;
  let h = shelf + swell + (seamount + knoll) * calm;
  h += (terrace(h, 7) - h) * 0.55 * calm;

  // Trenches follow the zero line of a warped noise field: the outer wall, then the
  // abyss down its middle.
  const wx = x + (fbm(x * 0.0012 + 5.5, z * 0.0012, 3) - 0.5) * 400;
  const wz = z + (fbm(x * 0.0012, z * 0.0012 + 2.8, 3) - 0.5) * 400;
  const c = Math.abs(fbm(wx * 0.0011 + 9.9, wz * 0.0011 + 3.7, 3) - 0.5);
  const cut = smooth(THREE.MathUtils.clamp((0.085 - c) / 0.06, 0, 1));
  const abyss = smooth(THREE.MathUtils.clamp((0.04 - c) / 0.03, 0, 1));
  h -= (cut * TRENCH_DEPTH + abyss * ABYSS_DEPTH) * calm;

  const sand = (fbm(x * 0.02, z * 0.02, 2) - 0.5) * 1.6;
  return h + sand * (1 - cut * 0.7);
}

// The level is fixed for the page, so every importer gets the same field.
export const heightAt = {
  desert: duneHeight,
  rainforest: jungleHeight,
  grassland: plainsHeight,
  snow: snowHeight,
  volcano: volcanoHeight,
  ocean: seabedHeight,
  jail: (x, z) => (fbm(x * 0.01, z * 0.01, 2) - 0.5) * 0.6, // a flat yard
  penalty: () => 0, // a concrete floor
}[LEVEL.id];

// Ground shader extras, by level. Lava glows through the terrain material: aLava per
// vertex, an animated crust in the fragment shader, and enough emissive to clear the
// bloom threshold. Underwater, caustics ripple across the lit ground. Both read the
// world xz of the vertex (chunks and the backdrop are built in world space).
export const groundUniforms = { uTime: { value: 0 } };

const GROUND_NOISE = /* glsl */ `
uniform float uTime;
varying float vLava;
varying vec2 vGroundXZ;
varying float vGroundY;
float groundHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float groundNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(groundHash(i), groundHash(i + vec2(1, 0)), u.x), mix(groundHash(i + vec2(0, 1)), groundHash(i + vec2(1, 1)), u.x), u.y);
}
`;

const LAVA_GLOW = /* glsl */ `
{
  vec2 q = vGroundXZ * 0.06;
  float flow = groundNoise(q + vec2(uTime * 0.07, uTime * 0.04)) * 0.6 + groundNoise(q * 2.7 - vec2(uTime * 0.05, 0.0)) * 0.4;
  float crust = smoothstep(0.62, 0.78, flow); // darker plates drifting on the melt
  float heat = smoothstep(0.15, 0.85, vLava);
  totalEmissiveRadiance += vec3(1.0, 0.3, 0.04) * heat * mix(3.2, 0.9, crust);
}
`;

// Water caustics: an iterated interference pattern (the well-known "tileable water
// caustic" loop), periodic in 2π so the 11 m tiles meet without seams.
const CAUSTICS = /* glsl */ `
{
  const float TAU = 6.2831853;
  vec2 p = mod(vGroundXZ * (TAU / 11.0), TAU) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float t = uTime * 0.45 * (1.0 - 3.5 / float(n + 1));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  float web = clamp(pow(abs(c), 8.0), 0.0, 2.0) * smoothstep(SEA - 200.0, SEA - 60.0, vGroundY) * step(vGroundY, SEA); // light fades with depth
  reflectedLight.directDiffuse *= 1.0 + web * 1.4;
  reflectedLight.indirectDiffuse *= 1.0 + web * 0.35;
}
`;

function patchGround(material) {
  if (!LEVEL.lava && !LEVEL.caustics) return;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = groundUniforms.uTime;
    shader.vertexShader = `attribute float aLava;
varying float vLava;
varying vec2 vGroundXZ;
varying float vGroundY;
` + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vLava = aLava;
        vGroundXZ = position.xz;
        vGroundY = position.y;`);
    let fs = GROUND_NOISE + shader.fragmentShader;
    if (LEVEL.lava) fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>${LAVA_GLOW}`);
    if (LEVEL.caustics) fs = `const float SEA = ${(LEVEL.sea ?? 0).toFixed(1)};\n` + fs.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>${CAUSTICS}`);
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => `terrain-ground-${LEVEL.id}`;
}

const LAVA = !!LEVEL.lava;

export function normalAt(x, z, target = new THREE.Vector3(), eps = 1.0) {
  const hx = heightAt(x + eps, z) - heightAt(x - eps, z);
  const hz = heightAt(x, z + eps) - heightAt(x, z - eps);
  return target.set(-hx, 2 * eps, -hz).normalize();
}

const TAU = Math.PI * 2;

// Wind ripples, like the dunes in miniature.
function rippleHeight(u, v) {
  const phase =
    11 * u +
    0.45 * Math.sin(TAU * (2 * v + u)) +
    0.2 * Math.sin(TAU * (5 * v - 2 * u)) +
    0.08 * Math.sin(TAU * (13 * v + 3 * u));
  const p = phase - Math.floor(phase);
  const r = p < 0.7 ? smooth(p / 0.7) : smooth(1 - (p - 0.7) / 0.3);
  const fine = 0.12 * Math.sin(TAU * (37 * u + 4 * Math.sin(TAU * 3 * v)));
  return r + fine;
}

// Leaf litter and moss clumps: tileable value noise (lattice wraps at the period).
function litterHeight(u, v) {
  const tile = (f, p) => {
    const x = u * p;
    const y = v * p;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const g = (a, b) => valueNoise(((a % p) + p) % p, ((b % p) + p) % p);
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const top = g(ix, iy) + (g(ix + 1, iy) - g(ix, iy)) * sx;
    const bot = g(ix, iy + 1) + (g(ix + 1, iy + 1) - g(ix, iy + 1)) * sx;
    return (top + (bot - top) * sy) * f;
  };
  return tile(0.7, 8) + tile(0.35, 23) + tile(0.18, 61);
}

// Tileable normal map from a height function on the unit square, generated once on a canvas.
function createNormalMap(heightFn, strength, size = 512) {
  const h = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      h[j * size + i] = heightFn(i / size, j / size);
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const l = h[j * size + ((i - 1 + size) % size)];
      const r = h[j * size + ((i + 1) % size)];
      const d = h[((j - 1 + size) % size) * size + i];
      const u = h[((j + 1) % size) * size + i];
      let nx = (l - r) * strength;
      let ny = (d - u) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const k = (j * size + i) * 4;
      img.data[k] = (nx * 0.5 + 0.5) * 255;
      img.data[k + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[k + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// Hide a breakable instance and drop its colliders from the chunk.
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
function breakProp(props, b) {
  if (b.broken) return;
  b.broken = true;
  b.mesh.setMatrixAt(b.index, ZERO);
  b.mesh.instanceMatrix.needsUpdate = true;
  props.colliders = props.colliders.filter((c) => !b.colliders.includes(c));
}

// Empty the road: hide every prop piece that reaches onto it and drop its colliders,
// slopes, hazards and breakables. A piece reaches the road when its bounding sphere does.
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
function clearRoad(props) {
  props.group.updateMatrixWorld(true);
  const hide = [];
  props.group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const r0 = g.boundingSphere.radius;
    if (o.isInstancedMesh) {
      let changed = false;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, _m);
        _m.premultiply(o.matrixWorld).decompose(_p, _q, _s);
        if (onRoad(_p.x, _p.z, r0 * Math.max(_s.x, _s.z) * 0.8)) {
          o.setMatrixAt(i, ZERO);
          changed = true;
        }
      }
      if (changed) o.instanceMatrix.needsUpdate = true;
    } else {
      o.getWorldPosition(_p);
      o.getWorldScale(_s);
      if (onRoad(_p.x, _p.z, r0 * Math.max(_s.x, _s.z) * 0.8)) hide.push(o);
    }
  });
  for (const o of hide) o.visible = false;
  props.colliders = props.colliders.filter((c) => !onRoad(c.x, c.z, c.r));
  if (props.slopes) props.slopes = props.slopes.filter((sl) => !onRoad(sl.x, sl.z, (sl.plinthSide ?? sl.side ?? 40) * 0.75));
  if (props.hazards) props.hazards = props.hazards.filter((h) => !onRoad(h.x, h.z, h.r));
  for (const b of props.breakables) if (onRoad(b.x, b.z, 2)) breakProp(props, b);
  if (props.vent && onRoad(props.vent.x ?? 149, props.vent.z ?? 118, props.vent.r ?? 30)) props.vent = null;
}

// Steeper slopes take the shade color, flats and crests the light one.
function groundColor(x, z, nrm, c, lava = LAVA ? lavaAt(x, z) : 0, y = 0) {
  const { base, crest, shade, steep = [3, 0.2, 0.7] } = LEVEL.ground;
  const slope = 1 - nrm.y;
  const tint = fbm(x * 0.01 + 50, z * 0.01, 2);
  c.copy(base).lerp(crest, THREE.MathUtils.clamp(0.6 - slope * 4 + (tint - 0.5), 0, 1));
  const [gain, offset, most] = steep;
  c.lerp(shade, THREE.MathUtils.clamp(slope * gain - offset, 0, most));
  if (lava > 0) c.lerp(LEVEL.ground.lava, lava);
  // Underwater, the deep floor fades toward dark blue, and islands dry out above the surface.
  const { deep, island } = LEVEL.ground;
  if (deep) c.lerp(deep.color, THREE.MathUtils.clamp((deep.from - y) / deep.span, 0, deep.most));
  if (island) c.lerp(island, THREE.MathUtils.clamp((y - LEVEL.sea - 2) / 10, 0, 1) * Math.max(0.9 - slope * 3, 0));
  return c;
}

const buildChunkProps = {
  desert: buildDesertProps,
  rainforest: buildJungleProps,
  grassland: buildGrasslandProps,
  snow: buildSnowProps,
  volcano: buildVolcanoProps,
  ocean: buildReefProps,
  jail: buildJailProps,
  penalty: buildPenaltyProps,
}[LEVEL.id];
const RIPPLE_TILE = LEVEL.ground.ripple ? 9 : 6; // metres per ground texture tile

export class Terrain {
  constructor(scene, renderer) {
    this.scene = scene;
    this.chunks = new Map();
    this.queue = [];
    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: LEVEL.ground.roughness,
      metalness: 0,
      normalMap: LEVEL.ground.ripple ? createNormalMap(rippleHeight, 2.2) : createNormalMap(litterHeight, 6),
      normalScale: new THREE.Vector2(LEVEL.ground.normalScale, LEVEL.ground.normalScale),
    });
    this.material.normalMap.anisotropy = renderer.capabilities.getMaxAnisotropy();
    patchGround(this.material);
    this.lastCenter = null;
    // Breakable props that have been smashed, as `chunkKey:id`, so they stay gone
    // when their chunk streams out and back in.
    this.broken = new Set();
    // Cacti that have been hit, by id, so they stay yellow when their chunk streams back.
    this.withered = new Set();
  }

  key(cx, cz) {
    return cx + ',' + cz;
  }

  buildChunk(cx, cz) {
    const n = CHUNK_SEGMENTS + 1;
    const step = CHUNK_SIZE / CHUNK_SEGMENTS;
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const positions = new Float32Array(n * n * 3);
    const normals = new Float32Array(n * n * 3);
    const colors = new Float32Array(n * n * 3);
    const uvs = new Float32Array(n * n * 2);
    const lava = LAVA || LEVEL.caustics ? new Float32Array(n * n) : null;
    const nrm = new THREE.Vector3();
    const c = new THREE.Color();

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const x = x0 + i * step;
        const z = z0 + j * step;
        const y = heightAt(x, z);
        positions[k * 3] = x;
        positions[k * 3 + 1] = y;
        positions[k * 3 + 2] = z;
        normalAt(x, z, nrm, step * 0.5);
        normals[k * 3] = nrm.x;
        normals[k * 3 + 1] = nrm.y;
        normals[k * 3 + 2] = nrm.z;
        const lv = LAVA ? lavaAt(x, z) : 0;
        groundColor(x, z, nrm, c, lv, y);
        colors[k * 3] = c.r;
        colors[k * 3 + 1] = c.g;
        colors[k * 3 + 2] = c.b;
        if (lava) lava[k] = lv;
        uvs[k * 2] = x / RIPPLE_TILE;
        uvs[k * 2 + 1] = z / RIPPLE_TILE;
      }
    }

    const indices = new Uint32Array(CHUNK_SEGMENTS * CHUNK_SEGMENTS * 6);
    let p = 0;
    for (let j = 0; j < CHUNK_SEGMENTS; j++) {
      for (let i = 0; i < CHUNK_SEGMENTS; i++) {
        const a = j * n + i;
        const b = a + 1;
        const d = a + n;
        const e = d + 1;
        indices[p++] = a; indices[p++] = d; indices[p++] = b;
        indices[p++] = b; indices[p++] = d; indices[p++] = e;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    if (lava) geo.setAttribute('aLava', new THREE.BufferAttribute(lava, 1));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeTangents();
    geo.computeBoundingSphere();

    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const props = buildChunkProps(cx, cz, CHUNK_SIZE, heightAt);
    props.breakables ??= [];
    if (HAS_ROAD) clearRoad(props);
    if (LEVEL.outside) addOutside(props, cx, cz, CHUNK_SIZE, heightAt);
    if (LEVEL.cacti) {
      props.cacti = LEVEL.outside
        ? addCacti(props, cx, cz, CHUNK_SIZE, heightAt, (x, z) => density(x, z) > 0, 'p')
        : addCacti(props, cx, cz, CHUNK_SIZE, heightAt);
      for (const c of props.cacti) if (this.withered.has(c.id)) setWithered(c, true);
    }
    const key = this.key(cx, cz);
    for (const b of props.breakables) {
      if (this.broken.has(key + ':' + b.id)) breakProp(props, b);
    }
    this.scene.add(props.group);
    const coins = buildChunkCoins(cx, cz, CHUNK_SIZE, heightAt, props.colliders);
    this.scene.add(coins.group);

    return { mesh, props, coins };
  }

  disposeChunk(chunk) {
    this.scene.remove(chunk.mesh);
    chunk.mesh.geometry.dispose();
    this.scene.remove(chunk.props.group);
    // Instanced props own their per-instance buffers.
    chunk.props.group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    this.scene.remove(chunk.coins.group);
  }

  updateCoins(time) {
    for (const chunk of this.chunks.values()) updateChunkCoins(chunk.coins.list, time);
  }

  collectCoins(prev, pos) {
    let gained = 0;
    for (const chunk of this.chunks.values()) gained += collectChunkCoins(chunk.coins.list, prev, pos);
    return gained;
  }

  update(position, force = false) {
    const cx = Math.floor(position.x / CHUNK_SIZE);
    const cz = Math.floor(position.z / CHUNK_SIZE);
    const centerKey = this.key(cx, cz);

    if (centerKey !== this.lastCenter || force) {
      this.lastCenter = centerKey;
      const wanted = new Set();
      const pending = [];
      for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
        for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
          if (dx * dx + dz * dz > (VIEW_RADIUS + 0.5) ** 2) continue;
          const k = this.key(cx + dx, cz + dz);
          wanted.add(k);
          if (!this.chunks.has(k)) pending.push({ cx: cx + dx, cz: cz + dz, d: dx * dx + dz * dz, k });
        }
      }
      // A coin wider than the view lives in a far chunk. Keep that chunk while its disc
      // reaches the player, or the mesh never loads and then pops out from underneath.
      const coinReach = (VIEW_RADIUS + 0.5) * CHUNK_SIZE + COIN_R;
      for (const spot of coinsNear(position.x, position.z, coinReach)) {
        const sx = Math.floor(spot.x / CHUNK_SIZE);
        const sz = Math.floor(spot.z / CHUNK_SIZE);
        const sk = this.key(sx, sz);
        if (wanted.has(sk)) continue;
        wanted.add(sk);
        if (!this.chunks.has(sk)) {
          const cdx = sx - cx;
          const cdz = sz - cz;
          pending.push({ cx: sx, cz: sz, d: cdx * cdx + cdz * cdz, k: sk });
        }
      }
      for (const [k, chunk] of this.chunks) {
        if (!wanted.has(k)) {
          this.disposeChunk(chunk);
          this.chunks.delete(k);
        }
      }
      pending.sort((a, b) => a.d - b.d);
      this.queue = pending;
    }

    const budget = force ? Infinity : MAX_BUILDS_PER_FRAME;
    for (let i = 0; i < budget && this.queue.length; i++) {
      const job = this.queue.shift();
      if (!this.chunks.has(job.k)) this.chunks.set(job.k, this.buildChunk(job.cx, job.cz));
    }
  }

  // Sand plus the pyramid face (or a slope record's own faceAt, like the lava pool's
  // causeway), when the stone is higher. outN receives the support normal.
  floorAt(x, z, outN) {
    let y = heightAt(x, z);
    if (outN) normalAt(x, z, outN, 1.5);
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.chunks.get(this.key(cx + dx, cz + dz));
        if (!chunk) continue;
        for (const slope of chunk.props.slopes) {
          const face = slope.faceAt ? slope.faceAt(x, z) : pyramidFace(slope, x, z);
          if (!face || face.y <= y) continue;
          y = face.y;
          if (outN) outN.set(face.nx, face.ny, face.nz);
        }
      }
    }
    return y;
  }

  // Breakable props whose collider the bike's path from prev to next runs into, in the
  // 3x3 chunks around next. Each one is hidden, loses its colliders, and is returned
  // so the caller can play the break. Call it before the collision push.
  smash(prev, next) {
    const hits = [];
    const cx = Math.floor(next.x / CHUNK_SIZE);
    const cz = Math.floor(next.z / CHUNK_SIZE);
    const sx = next.x - prev.x;
    const sz = next.z - prev.z;
    const len2 = sx * sx + sz * sz;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = this.key(cx + dx, cz + dz);
        const chunk = this.chunks.get(key);
        if (!chunk || !chunk.props.breakables.length) continue;
        for (const c of chunk.props.colliders) {
          const b = c.breakable;
          if (!b || next.y > c.top + 0.5) continue;
          // Closest point on the path to the collider axis.
          const t = len2 > 1e-9 ? THREE.MathUtils.clamp(((c.x - prev.x) * sx + (c.z - prev.z) * sz) / len2, 0, 1) : 0;
          const px = prev.x + sx * t - c.x;
          const pz = prev.z + sz * t - c.z;
          const reach = c.r + 1.6; // the bike's 1.3 m padding, and a little more
          if (px * px + pz * pz > reach * reach) continue;
          if (hits.includes(b)) continue;
          hits.push(b);
          this.broken.add(key + ':' + b.id);
        }
        for (const b of hits) if (chunk.props.breakables.includes(b)) breakProp(chunk.props, b);
      }
    }
    return hits;
  }

  // Breaks and returns the first unbroken breakable in (x, z)'s chunk that accept()
  // takes and a rider at (x, z) touches, or null.
  breakAt(x, z, accept) {
    const key = this.key(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    const props = this.chunks.get(key)?.props;
    if (!props) return null;
    for (const b of props.breakables) {
      if (b.broken || !accept(b) || (x - b.x) ** 2 + (z - b.z) ** 2 > (b.w + 1.3) ** 2) continue;
      this.broken.add(key + ':' + b.id);
      breakProp(props, b);
      return b;
    }
    return null;
  }

  wither(c) {
    this.withered.add(c.id);
    setWithered(c, true);
  }

  // Withers the green cacti a rider at (x, z) is touching; true if there was one.
  witherAt(x, z) {
    const cacti = this.chunks.get(this.key(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)))?.props.cacti;
    if (!cacti) return false;
    let hit = false;
    for (const c of cacti) {
      if (c.withered || (x - c.x) ** 2 + (z - c.z) ** 2 > c.r * c.r) continue;
      this.wither(c);
      hit = true;
    }
    return hit;
  }

  witherIds(ids) {
    for (const id of ids) this.withered.add(id);
    for (const chunk of this.chunks.values()) {
      for (const c of chunk.props.cacti ?? []) if (this.withered.has(c.id)) setWithered(c, true);
    }
  }

  reviveCacti() {
    this.withered.clear();
    for (const chunk of this.chunks.values()) {
      for (const c of chunk.props.cacti ?? []) if (c.withered) setWithered(c, false);
    }
  }

  // The cacti the bike's path from prev to next touches, in the 3x3 chunks around next.
  cactiTouching(prev, next) {
    const hits = [];
    const cx = Math.floor(next.x / CHUNK_SIZE);
    const cz = Math.floor(next.z / CHUNK_SIZE);
    const sx = next.x - prev.x;
    const sz = next.z - prev.z;
    const len2 = sx * sx + sz * sz;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cacti = this.chunks.get(this.key(cx + dx, cz + dz))?.props.cacti;
        if (!cacti) continue;
        for (const c of cacti) {
          if (next.y > c.top) continue;
          const t = len2 > 1e-9 ? THREE.MathUtils.clamp(((c.x - prev.x) * sx + (c.z - prev.z) * sz) / len2, 0, 1) : 0;
          const reach = c.r + 1.3; // the bike's padding
          if ((prev.x + sx * t - c.x) ** 2 + (prev.z + sz * t - c.z) ** 2 < reach * reach) hits.push(c);
        }
      }
    }
    return hits;
  }

  // True when a point touches a hazard (the seabed's glowing life) in the 3x3 chunks
  // around it. pad is how far the bike reaches past its center.
  hazardHit(p, pad = 1) {
    const cx = Math.floor(p.x / CHUNK_SIZE);
    const cz = Math.floor(p.z / CHUNK_SIZE);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const hazards = this.chunks.get(this.key(cx + dx, cz + dz))?.props.hazards;
        if (!hazards) continue;
        for (const h of hazards) {
          if (p.y > h.top + pad) continue;
          if ((p.x - h.x) ** 2 + (p.z - h.z) ** 2 < (h.r + pad) ** 2) return true;
        }
      }
    }
    return false;
  }

  // The closest unbroken breakable (an ice spire) within range of a point, or null.
  nearestBreakable(p, range) {
    let best = null;
    let bestD2 = range * range;
    for (const chunk of this.chunks.values()) {
      for (const b of chunk.props.breakables) {
        if (b.broken) continue;
        const d2 = (b.x - p.x) ** 2 + (b.z - p.z) ** 2;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = b;
        }
      }
    }
    return best;
  }

  // Colliders from props in the 3x3 chunks around a point.
  collidersNear(x, z) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const out = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.chunks.get(this.key(cx + dx, cz + dz));
        if (chunk) out.push(...chunk.props.colliders);
      }
    }
    return out;
  }
}

// Far mountains for the snow level: a low-res ring of the same height field from just
// inside the streamed chunks out to 6 km, rebuilt when the bike has moved far enough.
// It sits a few metres low so the detailed chunks cover it where the two overlap.
// A rebuild costs ~25 ms, so it fills a few rings per frame and swaps in when done.
const BACKDROP_INNER = 700;
const BACKDROP_OUTER = 6000;
const BACKDROP_ANGLES = 160;
const BACKDROP_RINGS = 56;
const BACKDROP_SINK = 8;
const BACKDROP_STEP = 150;
const BACKDROP_RINGS_PER_FRAME = 8;

function backdropIndex() {
  const na = BACKDROP_ANGLES;
  const idx = [];
  for (let r = 0; r < BACKDROP_RINGS - 1; r++) {
    for (let a = 0; a < na; a++) {
      const i0 = r * na + a;
      const i1 = r * na + ((a + 1) % na);
      const i2 = i0 + na;
      const i3 = i1 + na;
      idx.push(i0, i1, i2, i1, i3, i2);
    }
  }
  return idx;
}

export class Backdrop {
  constructor(scene) {
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    patchGround(this.material);
    this.index = backdropIndex();
    this.mesh = null;
    this.scene = scene;
    this.center = null;
    this.job = null;
    this.n = new THREE.Vector3();
    this.c = new THREE.Color();
  }

  update(position, force = false) {
    const moved = !this.center || Math.hypot(position.x - this.center.x, position.z - this.center.z) >= BACKDROP_STEP;
    if (moved && !this.job) {
      this.center = { x: position.x, z: position.z };
      const size = BACKDROP_ANGLES * BACKDROP_RINGS * 3;
      this.job = {
        cx: position.x, cz: position.z, ring: 0,
        pos: new Float32Array(size), nrm: new Float32Array(size), col: new Float32Array(size),
        lava: new Float32Array(size / 3),
      };
    }
    if (!this.job) return;
    const job = this.job;
    const end = force ? BACKDROP_RINGS : Math.min(BACKDROP_RINGS, job.ring + BACKDROP_RINGS_PER_FRAME);
    const na = BACKDROP_ANGLES;
    const { n, c } = this;
    for (let r = job.ring; r < end; r++) {
      // Rings spread out with distance: fine near the chunks, coarse at the horizon.
      const t = r / (BACKDROP_RINGS - 1);
      const rad = BACKDROP_INNER * (BACKDROP_OUTER / BACKDROP_INNER) ** t;
      const eps = Math.max(4, rad * 0.01);
      for (let a = 0; a < na; a++) {
        const ang = (a / na) * Math.PI * 2;
        const x = job.cx + Math.cos(ang) * rad;
        const z = job.cz + Math.sin(ang) * rad;
        const k = (r * na + a) * 3;
        job.pos[k] = x;
        job.pos[k + 1] = heightAt(x, z) - BACKDROP_SINK;
        job.pos[k + 2] = z;
        normalAt(x, z, n, eps);
        job.nrm[k] = n.x; job.nrm[k + 1] = n.y; job.nrm[k + 2] = n.z;
        const lv = LAVA ? lavaAt(x, z) : 0;
        groundColor(x, z, n, c, lv);
        job.col[k] = c.r; job.col[k + 1] = c.g; job.col[k + 2] = c.b;
        job.lava[k / 3] = lv;
      }
    }
    job.ring = end;
    if (job.ring < BACKDROP_RINGS) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(job.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(job.nrm, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(job.col, 3));
    geo.setAttribute('aLava', new THREE.BufferAttribute(job.lava, 1));
    geo.setIndex(this.index);
    geo.computeBoundingSphere();
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.geometry = geo;
    } else {
      this.mesh = new THREE.Mesh(geo, this.material);
      this.scene.add(this.mesh);
    }
    this.job = null;
  }
}
