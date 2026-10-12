import * as THREE from 'three';
import { fbm, valueNoise } from './noise.js';
import { LEVEL } from './levels.js';
import { buildChunkProps as buildDesertProps, pyramidFace } from './props.js';
import { buildJungleProps } from './jungle.js';
import { buildGrasslandProps } from './grassland.js';
import { buildSnowProps } from './snow.js';
import { buildChunkCoins, collectChunkCoins, updateChunkCoins, coinsNear, COIN_R } from './coins.js';

export const CHUNK_SIZE = 200;
const CHUNK_SEGMENTS = 64;
const VIEW_RADIUS = 4; // chunks around the player
const MAX_BUILDS_PER_FRAME = 2;

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

// The level is fixed for the page, so every importer gets the same field.
export const heightAt = { desert: duneHeight, rainforest: jungleHeight, grassland: plainsHeight, snow: snowHeight }[LEVEL.id];

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

// Steeper slopes take the shade color, flats and crests the light one.
function groundColor(x, z, nrm, c) {
  const { base, crest, shade, steep = [3, 0.2, 0.7] } = LEVEL.ground;
  const slope = 1 - nrm.y;
  const tint = fbm(x * 0.01 + 50, z * 0.01, 2);
  c.copy(base).lerp(crest, THREE.MathUtils.clamp(0.6 - slope * 4 + (tint - 0.5), 0, 1));
  const [gain, offset, most] = steep;
  return c.lerp(shade, THREE.MathUtils.clamp(slope * gain - offset, 0, most));
}

const DESERT = LEVEL.id === 'desert';
const buildChunkProps = {
  desert: buildDesertProps,
  rainforest: buildJungleProps,
  grassland: buildGrasslandProps,
  snow: buildSnowProps,
}[LEVEL.id];
const RIPPLE_TILE = DESERT ? 9 : 6; // metres per ground texture tile

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
      normalMap: DESERT ? createNormalMap(rippleHeight, 2.2) : createNormalMap(litterHeight, 6),
      normalScale: new THREE.Vector2(LEVEL.ground.normalScale, LEVEL.ground.normalScale),
    });
    this.material.normalMap.anisotropy = renderer.capabilities.getMaxAnisotropy();
    this.lastCenter = null;
    // Breakable props that have been smashed, as `chunkKey:id`, so they stay gone
    // when their chunk streams out and back in.
    this.broken = new Set();
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
        groundColor(x, z, nrm, c);
        colors[k * 3] = c.r;
        colors[k * 3 + 1] = c.g;
        colors[k * 3 + 2] = c.b;
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
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeTangents();
    geo.computeBoundingSphere();

    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const props = buildChunkProps(cx, cz, CHUNK_SIZE, heightAt);
    props.breakables ??= [];
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

  // Sand plus the pyramid face, when the stone is higher. outN receives the support normal.
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
          const face = pyramidFace(slope, x, z);
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
      this.job = { cx: position.x, cz: position.z, ring: 0, pos: new Float32Array(size), nrm: new Float32Array(size), col: new Float32Array(size) };
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
        groundColor(x, z, n, c);
        job.col[k] = c.r; job.col[k + 1] = c.g; job.col[k + 2] = c.b;
      }
    }
    job.ring = end;
    if (job.ring < BACKDROP_RINGS) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(job.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(job.nrm, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(job.col, 3));
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
