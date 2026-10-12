import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import catUrl from '../assets/riders/cat.glb?url';

// Bike space is +Z forward, +Y up, +X to the rider's left.
// The generated cat faces +Z: z_posZ shows the face, z_negZ the back,
// and the side views put the head at +Z with the tail toward -Z. Belly is -Y.
const ASSET_FRONT = new THREE.Vector3(0, 0, 1);
const BIKE_FORWARD = new THREE.Vector3(0, 0, 1);

const TARGET_LENGTH = 1.9; // nose to tail tip, in bike metres
const SEAT_TOP = 0.98;
const SINK = 0.16; // tuck the haunches into the seat
const SEAT_Z = -0.12;

// Shared by the color material and the shadow depth material.
const TAIL_JOINTS = 5;
const windUniforms = {
  uTime: { value: 0 },
  uWind: { value: 0 },
  uLean: { value: 0 },
  uTailPivot: { value: Array.from({ length: TAIL_JOINTS }, () => new THREE.Vector3()) },
};

// aWind.x = tail (0 at the root under the rump, 1 at the curl tip), aWind.y = ear tip.
// The tail bends as a joint chain, rotated tip-first so each joint carries the ones past it.
// A wave runs root to tip: a slow swish at rest, a fast flutter streamed back at speed.
const WIND_HEADER = /* glsl */ `
#define TAIL_JOINTS ${TAIL_JOINTS}
attribute vec2 aWind;
uniform float uTime;
uniform float uWind;
uniform float uLean;
uniform vec3 uTailPivot[TAIL_JOINTS];
vec3 windPos;
vec3 windNormal;
mat3 tailTurn(float yaw, float pitch) {
  float cy = cos(yaw), sy = sin(yaw), cp = cos(pitch), sp = sin(pitch);
  mat3 ry = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cp, sp, 0.0, -sp, cp);
  return ry * rx;
}
void computeWind(vec3 p, vec3 n) {
  float tail = aWind.x;
  float ear = aWind.y;
  float calm = 1.0 - uWind;
  if (tail > 0.0) {
    for (int i = 0; i < TAIL_JOINTS; i++) {
      int j = TAIL_JOINTS - 1 - i;
      float fj = float(j);
      float tj = fj / float(TAIL_JOINTS);
      float k = smoothstep(tj - 0.06, tj + 0.1, tail);
      if (k <= 0.0) continue;
      float along = fj / float(TAIL_JOINTS - 1);
      float swish = sin(uTime * 2.1 - fj * 0.75) * 0.16 * calm;
      float flick = sin(uTime * 4.3 - fj * 1.3) * 0.05 * calm * along;
      float flutter = sin(uTime * (17.0 + uWind * 9.0) - fj * 1.6) * 0.07 * uWind;
      float yaw = (swish + flick + flutter) * (0.7 + 0.3 * along) + uLean * 0.09;
      float pitch = j == 0 ? 0.0 : -uWind * 0.24 + sin(uTime * 1.3 - fj) * 0.04 * calm;
      mat3 r = tailTurn(yaw * k, pitch * k);
      vec3 pivot = uTailPivot[j];
      p = pivot + r * (p - pivot);
      n = r * n;
    }
  }
  float ephase = p.x > -0.06 ? 0.0 : 2.2;
  float eflap = sin(uTime * (7.4 + uWind * 8.0) + ephase);
  float eside = p.x > -0.06 ? 1.0 : -1.0;
  vec3 d = vec3(0.0);
  d.x += eflap * ear * (0.012 + uWind * 0.032) * eside;
  d.y += eflap * ear * (0.008 + uWind * 0.012);
  d.z -= ear * (0.014 + uWind * 0.048) * (0.7 + 0.3 * eflap);
  windPos = p + d;
  windNormal = normalize(n + d * 2.5);
}
`;

function ramp(v, edge0, edge1) {
  const t = THREE.MathUtils.clamp((v - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// The tail tip is the highest point behind the hips on +X. Weights follow the surface
// from there: geodesic distance over the welded mesh runs down the curl to the root
// under the rump, so the whole tail bends and the body stays put.
const isTailRegion = (x, z) => x > 0.13 && z < -0.24;
const TAIL_LENGTH = 0.62; // surface distance from tip to root, geometry-local

function tailDistances(geometry) {
  const pos = geometry.attributes.position;
  const n = pos.count;
  const weld = new Int32Array(n);
  const seen = new Map();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(pos.getZ(i) * 1e5)}`;
    if (!seen.has(k)) seen.set(k, i);
    weld[i] = seen.get(k);
  }
  const adj = Array.from({ length: n }, () => []);
  const index = geometry.index ? geometry.index.array : Array.from({ length: n }, (_, i) => i);
  for (let t = 0; t < index.length; t += 3) {
    const a = weld[index[t]], b = weld[index[t + 1]], c = weld[index[t + 2]];
    adj[a].push(b, c); adj[b].push(a, c); adj[c].push(a, b);
  }

  const dist = new Float64Array(n).fill(Infinity);
  const settled = new Uint8Array(n);
  let tip = -1;
  for (let i = 0; i < n; i++) {
    if (!isTailRegion(pos.getX(i), pos.getZ(i))) continue;
    if (tip < 0 || pos.getY(i) > pos.getY(tip)) tip = i;
  }
  if (tip < 0) return { dist, weld, tip };
  tip = weld[tip];
  dist[tip] = 0;

  // Dijkstra on a binary heap of [distance, vertex], stopped at the tail length.
  const heap = [[0, tip]];
  const swap = (i, j) => { const t = heap[i]; heap[i] = heap[j]; heap[j] = t; };
  while (heap.length) {
    const [d, u] = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        swap(i, m); i = m;
      }
    }
    // Each vertex expands once, so the search ends however the sums round.
    if (settled[u] || d > TAIL_LENGTH) continue;
    settled[u] = 1;
    for (const v of adj[u]) {
      if (settled[v]) continue;
      const nd = d + Math.hypot(pos.getX(u) - pos.getX(v), pos.getY(u) - pos.getY(v), pos.getZ(u) - pos.getZ(v));
      if (nd >= dist[v]) continue;
      dist[v] = nd;
      heap.push([nd, v]);
      for (let i = heap.length - 1; i > 0;) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        swap(i, p); i = p;
      }
    }
  }
  return { dist, weld, tip };
}

const SPINE_SAMPLES = TAIL_JOINTS * 2;

function nearestOnSpine(spine, p, seg, near) {
  let best = Infinity, t = 0;
  for (let j = 0; j + 1 < spine.length; j++) {
    seg.set(spine[j], spine[j + 1]);
    const u = seg.closestPointToPointParameter(p, true);
    const d = seg.at(u, near).distanceToSquared(p);
    if (d < best) { best = d; t = (j + u) / (spine.length - 1); }
  }
  return { t, d: Math.sqrt(best) };
}

// Writes aWind from geometry-local positions and returns the tail joint pivots.
// The mesh is two shells that are not stitched, and the tail runs across both, so the
// surface walk from the tip only sees one of them. That walk is used to trace the
// spine (centroids of the rings of equal distance) and the tube's radius along it.
// Every vertex inside that tube, on either shell, then takes its place along the tail
// from the closest point on the spine, which also keeps each bend square to the tube.
function paintWind(geometry) {
  const pos = geometry.attributes.position;
  const wind = new Float32Array(pos.count * 2);
  const { dist, weld, tip } = tailDistances(geometry);
  const walked = (i) => THREE.MathUtils.clamp(1 - dist[weld[i]] / TAIL_LENGTH, 0, 1);

  const sums = Array.from({ length: SPINE_SAMPLES }, () => [0, 0, 0, 0]);
  for (let i = 0; i < pos.count; i++) {
    const t = walked(i);
    if (t <= 0 || weld[i] !== i) continue;
    for (let j = 0; j < SPINE_SAMPLES; j++) {
      if (Math.abs(t - j / SPINE_SAMPLES) > 0.03) continue;
      const s = sums[j];
      s[0] += pos.getX(i); s[1] += pos.getY(i); s[2] += pos.getZ(i); s[3]++;
    }
  }
  const spine = sums.map((s) => new THREE.Vector3(s[0], s[1], s[2]).divideScalar(Math.max(s[3], 1)));
  if (tip >= 0) spine.push(new THREE.Vector3().fromBufferAttribute(pos, tip));

  const p = new THREE.Vector3();
  const seg = new THREE.Line3();
  const near = new THREE.Vector3();
  // Tube radius per spine segment, from the walked part of the tail past the root.
  const radius = new Float32Array(spine.length).fill(0);
  for (let i = 0; i < pos.count; i++) {
    if (walked(i) < 0.15) continue;
    const { t, d } = nearestOnSpine(spine, p.fromBufferAttribute(pos, i), seg, near);
    const k = Math.round(t * (spine.length - 1));
    radius[k] = Math.max(radius[k], d);
  }
  for (let k = 0; k < spine.length; k++) radius[k] = radius[k] || radius[Math.max(k - 1, 0)] || 0.06;

  for (let i = 0; i < pos.count; i++) {
    const { t, d } = nearestOnSpine(spine, p.fromBufferAttribute(pos, i), seg, near);
    const r = radius[Math.round(t * (spine.length - 1))] * 1.1 + 0.004;
    // Fade to zero where the tail meets the rump so the body seam does not tear.
    wind[i * 2] = d < r ? t * ramp(t, 0, 0.14) : 0;
    wind[i * 2 + 1] = ramp(pos.getY(i), 0.3, 0.4) * ramp(pos.getZ(i), 0.05, 0.18);
  }
  geometry.setAttribute('aWind', new THREE.BufferAttribute(wind, 2));
  return Array.from({ length: TAIL_JOINTS }, (_, j) => spine[Math.min(j * 2, spine.length - 1)].clone());
}

// MeshDepthMaterial only runs beginnormal_vertex with a displacement map,
// so the shadow pass computes the wind in begin_vertex instead.
function bindWind(material, { depth = false } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.uniforms.uLean = windUniforms.uLean;
    shader.uniforms.uTailPivot = windUniforms.uTailPivot;
    let vs = WIND_HEADER + shader.vertexShader;
    if (!depth) {
      vs = vs.replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        computeWind(position, objectNormal);
        objectNormal = windNormal;`,
      );
    }
    shader.vertexShader = vs.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      ${depth ? 'computeWind(position, vec3(0.0, 1.0, 0.0));' : ''}
      transformed = windPos;`,
    );
  };
  const prev = material.customProgramCacheKey;
  material.customProgramCacheKey = function catWindKey() {
    return (prev ? prev.call(this) : '') + (depth ? 'cat-wind-2-depth' : 'cat-wind-2');
  };
}

export function buildCatRider(parent) {
  const rider = new THREE.Group();
  const baseY = SEAT_TOP - SINK;
  rider.position.set(0, baseY, SEAT_Z);
  parent.add(rider);

  const loader = new GLTFLoader();
  loader.load(catUrl, (gltf) => {
    const model = gltf.scene;
    // Identity when the measured front already matches the bike.
    model.quaternion.setFromUnitVectors(ASSET_FRONT, BIKE_FORWARD);
    model.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(TARGET_LENGTH / size.z);
    model.updateMatrixWorld(true);

    const fitted = new THREE.Box3().setFromObject(model);
    model.position.sub(fitted.getCenter(new THREE.Vector3()));
    model.updateMatrixWorld(true);
    const grounded = new THREE.Box3().setFromObject(model);
    model.position.y -= grounded.min.y;

    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      const pivots = paintWind(o.geometry);
      windUniforms.uTailPivot.value.forEach((v, j) => v.copy(pivots[j]));
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || !('metalness' in m)) continue;
        // The source render is already painted. Drop the metal map so the sun
        // doesn't turn the fur into chrome.
        m.metalness = 0;
        m.metalnessMap = null;
        m.roughness = 0.72;
        m.roughnessMap = null;
        bindWind(m);
      }
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      bindWind(depth, { depth: true });
      o.customDepthMaterial = depth;
    });

    rider.add(model);
  });

  rider.userData.animate = (time, s) => {
    const stream = THREE.MathUtils.clamp(s.speed / 48, 0, 1);
    windUniforms.uTime.value = time;
    windUniforms.uWind.value = THREE.MathUtils.clamp(stream * 0.85 + s.boost * 0.45, 0, 1);
    windUniforms.uLean.value = s.lean;
    rider.position.y = baseY + Math.sin(time * 2.3) * (0.01 + stream * 0.012);
  };

  return rider;
}
