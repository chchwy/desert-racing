import * as THREE from 'three';
import { fbm, valueNoise } from './noise.js';
import { LEVEL } from './levels.js';
import { buildChunkProps as buildDesertProps, pyramidFace } from './props.js';
import { buildJungleProps } from './jungle.js';
import { buildGrasslandProps } from './grassland.js';
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

// The level is fixed for the page, so every importer gets the same field.
export const heightAt = { desert: duneHeight, rainforest: jungleHeight, grassland: plainsHeight }[LEVEL.id];

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

const DESERT = LEVEL.id === 'desert';
const buildChunkProps = { desert: buildDesertProps, rainforest: buildJungleProps, grassland: buildGrasslandProps }[LEVEL.id];
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
    const { base, crest, shade } = LEVEL.ground;
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
        // steeper slopes slightly darker/redder, flats & crests lighter
        const slope = 1 - nrm.y;
        const tint = fbm(x * 0.01 + 50, z * 0.01, 2);
        c.copy(base).lerp(crest, THREE.MathUtils.clamp(0.6 - slope * 4 + (tint - 0.5), 0, 1));
        c.lerp(shade, THREE.MathUtils.clamp(slope * 3 - 0.2, 0, 0.7));
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
