import * as THREE from 'three';
import { LEVEL } from './levels.js';

export const SUN_DIR = new THREE.Vector3(-0.5, 0.5, 0.7).normalize();
export const HAZE_COLOR = new THREE.Color(LEVEL.haze);

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
    vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // pin to far plane
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHaze;
  uniform float uTime;
  uniform float uCover; // extra cloud cover, 0 = clear desert sky
  uniform float uSun;   // sun disc and glow strength
  uniform vec3 uCloud;  // cloud tint, white by default
  uniform float uCloudSpeed;
  uniform float uHazeTop; // how high the horizon haze climbs before the sky shows
  uniform float uNight;   // 0 day .. 1 night (daynight.js)
  varying vec3 vDir;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) { s += noise(p) * a; p = p * 2.02 + 3.1; a *= 0.5; }
    return s;
  }

  void main() {
    vec3 d = normalize(vDir);
    float y = d.y;

    // sky gradient
    vec3 col = mix(uHaze, uMid, smoothstep(0.0, uHazeTop, y));
    col = mix(col, uZenith, smoothstep(uHazeTop * 0.8, 0.8 + uHazeTop * 0.2, y));

    // sun
    float sd = max(dot(d, uSunDir), 0.0);
    float sunUp = uSun * (1.0 - uNight);
    col += vec3(1.0, 0.92, 0.8) * pow(sd, 600.0) * 30.0 * sunUp;
    col += vec3(1.0, 0.9, 0.75) * pow(sd, 12.0) * 0.35 * sunUp;

    // Night: stars on a fixed grid and a moon across the sky from the sun.
    if (uNight > 0.0 && y > 0.0) {
      vec2 g = floor(vec2(atan(d.z, d.x), asin(y)) * 260.0);
      float star = step(0.9965, hash(g)) * (0.5 + 0.5 * hash(g + 7.0));
      col += vec3(star) * smoothstep(0.03, 0.25, y) * uNight * 1.6;
      vec3 moonDir = normalize(vec3(-uSunDir.x, uSunDir.y, -uSunDir.z));
      float md = dot(d, moonDir);
      col += vec3(0.95, 0.97, 1.0) * (smoothstep(0.99955, 0.9997, md) * 2.2 + pow(max(md, 0.0), 80.0) * 0.25) * uNight;
    }

    // clouds on a flat layer
    if (y > 0.0) {
      vec2 uv = d.xz / (y + 0.08) * 1.4 + vec2(uTime * 0.012, uTime * 0.004) * uCloudSpeed;
      float n = fbm(uv);
      float n2 = fbm(uv * 2.7 + 5.0);
      float cover = smoothstep(0.48 - uCover, 0.78 - uCover * 0.5, n * 0.8 + n2 * 0.3);
      float shade = smoothstep(0.4, 0.9, fbm(uv + uSunDir.xz * 0.08));
      vec3 cloudCol = mix(vec3(1.05, 1.05, 1.08), vec3(0.72, 0.78, 0.88), shade * 0.7);
      cloudCol = cloudCol * uCloud + vec3(1.0, 0.95, 0.85) * pow(sd, 6.0) * 0.6;
      cloudCol *= 1.0 - uNight * 0.85;
      float fade = smoothstep(0.02 + uHazeTop * 0.6, 0.22 + uHazeTop, y);
      col = mix(col, cloudCol, cover * fade * 0.95);
    }

    // horizon haze
    col = mix(col, uHaze, 1.0 - smoothstep(-0.02, 0.09, y));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export function createSky() {
  const mat = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uSunDir: { value: SUN_DIR },
      uZenith: { value: new THREE.Color(LEVEL.sky.zenith) },
      uMid: { value: new THREE.Color(LEVEL.sky.mid) },
      uHaze: { value: HAZE_COLOR },
      uTime: { value: 0 },
      uCover: { value: LEVEL.sky.cover },
      uSun: { value: LEVEL.sky.sun },
      uCloud: { value: new THREE.Color(LEVEL.sky.cloud ?? 0xffffff) },
      uCloudSpeed: { value: LEVEL.sky.cloudSpeed ?? 1 },
      uHazeTop: { value: LEVEL.sky.hazeTop ?? 0.18 },
      uNight: { value: 0 },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}
