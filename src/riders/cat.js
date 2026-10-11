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
const windUniforms = {
  uTime: { value: 0 },
  uWind: { value: 0 },
  uLean: { value: 0 },
};

// aWind.x = tail (0 at the root, 1 at the curl tip), aWind.y = ear tip.
// Weights are in the mesh's own space: face +Z, tail -Z and toward +X, ears +Y on the head.
const WIND_HEADER = /* glsl */ `
attribute vec2 aWind;
uniform float uTime;
uniform float uWind;
uniform float uLean;
vec3 vWind;
void computeWind(vec3 p) {
  float tail = aWind.x;
  float ear = aWind.y;
  float tip = tail * tail;
  float wag = sin(uTime * (6.2 + uWind * 10.0) + tail * 7.0);
  float wag2 = sin(uTime * (11.5 + uWind * 6.0) - tail * 5.0);
  vec3 d = vec3(
    wag * tail * (0.022 + uWind * 0.085) - uLean * tip * 0.14,
    wag2 * tip * (0.016 + uWind * 0.055) + uWind * tip * 0.035,
    wag * tip * 0.035 - uWind * tip * 0.18
  );
  float ephase = p.x > -0.06 ? 0.0 : 2.2;
  float eflap = sin(uTime * (7.4 + uWind * 8.0) + ephase);
  float eside = p.x > -0.06 ? 1.0 : -1.0;
  d.x += eflap * ear * (0.012 + uWind * 0.032) * eside;
  d.y += eflap * ear * (0.008 + uWind * 0.012);
  d.z -= ear * (0.014 + uWind * 0.048) * (0.7 + 0.3 * eflap);
  vWind = d;
}
`;

function ramp(v, edge0, edge1) {
  const t = THREE.MathUtils.clamp((v - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Tail curl sits behind the hips on +X. Ear tips are the high points on the head.
function paintWind(geometry) {
  const pos = geometry.attributes.position;
  const wind = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const curl = ramp(z, -0.08, -0.24) * ramp(x, 0.06, 0.18) * ramp(y, -0.06, 0.1);
    const tip = ramp(z, -0.32, -0.48) * ramp(x, 0.12, 0.24) * ramp(y, -0.22, -0.02);
    const region = Math.max(curl, tip);
    const along = Math.hypot(x - 0.14, y, z + 0.18);
    wind[i * 2] = region * ramp(along, 0.05, 0.32);
    wind[i * 2 + 1] = ramp(y, 0.3, 0.4) * ramp(z, 0.05, 0.18);
  }
  geometry.setAttribute('aWind', new THREE.BufferAttribute(wind, 2));
}

function bindWind(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.uniforms.uLean = windUniforms.uLean;
    shader.vertexShader = WIND_HEADER + shader.vertexShader
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        computeWind(position);
        objectNormal = normalize(objectNormal + vWind * 2.5);`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed += vWind;`,
      );
  };
  const prev = material.customProgramCacheKey;
  material.customProgramCacheKey = function catWindKey() {
    return (prev ? prev.call(this) : '') + 'cat-wind-1';
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
      paintWind(o.geometry);
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
      bindWind(depth);
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
