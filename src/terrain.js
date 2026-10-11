import * as THREE from 'three';
import { fbm } from './noise.js';
import { buildChunkProps } from './props.js';

export const CHUNK_SIZE = 200;
const CHUNK_SEGMENTS = 64;
const VIEW_RADIUS = 4; // chunks around the player
const MAX_BUILDS_PER_FRAME = 2;

const smooth = (t) => t * t * (3 - 2 * t);

// Dune height field. Asymmetric ridges (gentle windward side, steep lee side)
// laid along a domain-warped wind direction, on top of broad rolling swells.
export function heightAt(x, z) {
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

export function normalAt(x, z, target = new THREE.Vector3(), eps = 1.0) {
  const hx = heightAt(x + eps, z) - heightAt(x - eps, z);
  const hz = heightAt(x, z + eps) - heightAt(x, z - eps);
  return target.set(-hx, 2 * eps, -hz).normalize();
}

// Tileable wind-ripple normal map, generated once on a canvas.
function createRippleNormalMap(size = 512) {
  const TAU = Math.PI * 2;
  const h = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u = i / size;
      const v = j / size;
      const phase =
        11 * u +
        0.45 * Math.sin(TAU * (2 * v + u)) +
        0.2 * Math.sin(TAU * (5 * v - 2 * u)) +
        0.08 * Math.sin(TAU * (13 * v + 3 * u));
      const p = phase - Math.floor(phase);
      // asymmetric ripple profile, like the dunes in miniature
      const r = p < 0.7 ? smooth(p / 0.7) : smooth(1 - (p - 0.7) / 0.3);
      const fine = 0.12 * Math.sin(TAU * (37 * u + 4 * Math.sin(TAU * 3 * v)));
      h[j * size + i] = r + fine;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const strength = 2.2;
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

const RIPPLE_TILE = 9; // metres per ripple texture tile

export class Terrain {
  constructor(scene, renderer) {
    this.scene = scene;
    this.chunks = new Map();
    this.queue = [];
    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.93,
      metalness: 0,
      normalMap: createRippleNormalMap(),
      normalScale: new THREE.Vector2(0.28, 0.28),
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
    const base = new THREE.Color().setRGB(0.87, 0.72, 0.5, THREE.SRGBColorSpace);
    const crest = new THREE.Color().setRGB(0.93, 0.81, 0.62, THREE.SRGBColorSpace);
    const shade = new THREE.Color().setRGB(0.78, 0.6, 0.4, THREE.SRGBColorSpace);
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

    return { mesh, props };
  }

  disposeChunk(chunk) {
    this.scene.remove(chunk.mesh);
    chunk.mesh.geometry.dispose();
    this.scene.remove(chunk.props.group);
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
