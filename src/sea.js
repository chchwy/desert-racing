import * as THREE from 'three';
import { LEVEL } from './levels.js';

// The ocean's water surface at LEVEL.sea, and the light and fog that change with the
// camera's depth: bright teal near the surface, near black in the abyss, open air and
// a normal sky once the camera rises above the water on an island.

export const SEA_Y = LEVEL.sea ?? 0;

const SIZE = 9000;
const ABYSS_FROM = 90; // metres below the surface where the water starts to darken
const ABYSS_SPAN = 260;

const vertexShader = /* glsl */ `
  #include <fog_pars_vertex>
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uUnder;
  uniform vec3 uOver;
  uniform vec3 uSunDir;
  #include <fog_pars_fragment>
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  void main() {
    vec2 p = vWorld.xz * 0.04;
    float n = noise(p + uTime * vec2(0.09, 0.05)) * 0.6 + noise(p * 2.3 - uTime * vec2(0.05, 0.11)) * 0.4;
    vec3 col;
    float a;
    if (cameraPosition.y < vWorld.y) {
      // From below: the bright, rippling underside, with glints where the waves catch the sun.
      col = uUnder * (0.75 + 0.55 * n) + vec3(0.9, 1.0, 1.0) * pow(n, 7.0) * 1.6;
      a = 0.9;
    } else {
      // From above: deep blue water with a sun glint.
      vec3 v = normalize(cameraPosition - vWorld);
      vec3 nrm = normalize(vec3((n - 0.5) * 0.25, 1.0, (noise(p * 1.7 + 4.0) - 0.5) * 0.25));
      float glint = pow(max(dot(reflect(-v, nrm), uSunDir), 0.0), 120.0);
      float fres = pow(1.0 - max(v.y, 0.0), 3.0);
      col = mix(uOver, uOver * 1.8 + 0.08, fres) * (0.9 + 0.2 * n) + glint * 3.0;
      a = 0.86 + fres * 0.12;
    }
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export class Sea {
  constructor(scene, { sky, hemi, sun, weather, sunDir }) {
    this.scene = scene;
    this.sky = sky;
    this.hemi = hemi;
    this.sun = sun;
    this.weather = weather;
    this.hemiBase = hemi.intensity;
    this.sunBase = sun.intensity;

    const u = sky.material.uniforms;
    this.water = {
      haze: new THREE.Color(LEVEL.haze), zenith: u.uZenith.value.clone(), mid: u.uMid.value.clone(),
      near: LEVEL.fogNear, far: LEVEL.fogFar, hazeTop: u.uHazeTop.value, cloudSpeed: u.uCloudSpeed.value, cover: u.uCover.value,
    };
    const air = LEVEL.air;
    this.air = {
      haze: new THREE.Color(air.haze), zenith: new THREE.Color(air.zenith), mid: new THREE.Color(air.mid),
      near: air.fogNear, far: air.fogFar, hazeTop: 0.18, cloudSpeed: 1, cover: 0.25,
    };
    this.abyss = new THREE.Color(LEVEL.abyss);
    // The sky's haze shares HAZE_COLOR with other users; give it its own color to tint.
    u.uHaze.value = new THREE.Color();

    const geo = new THREE.PlaneGeometry(SIZE, SIZE, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 },
        uUnder: { value: new THREE.Color(LEVEL.sky.zenith) },
        uOver: { value: new THREE.Color(0x0b3a58) },
        uSunDir: { value: sunDir },
      }]),
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      fog: true,
    }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(time, camera) {
    this.mesh.position.set(camera.position.x, SEA_Y, camera.position.z);
    this.mesh.material.uniforms.uTime.value = time;

    const above = camera.position.y > SEA_Y;
    const env = above ? this.air : this.water;
    const dark = above ? 0 : THREE.MathUtils.clamp((SEA_Y - camera.position.y - ABYSS_FROM) / ABYSS_SPAN, 0, 0.94);
    const fog = this.scene.fog;
    fog.color.copy(env.haze).lerp(this.abyss, dark);
    fog.near = env.near;
    fog.far = env.far * (1 - dark * 0.45);
    const u = this.sky.material.uniforms;
    u.uHaze.value.copy(fog.color);
    u.uZenith.value.copy(env.zenith).lerp(this.abyss, dark);
    u.uMid.value.copy(env.mid).lerp(this.abyss, dark);
    u.uHazeTop.value = env.hazeTop;
    u.uCloudSpeed.value = env.cloudSpeed;
    u.uCover.value = env.cover;
    const light = 1 - dark * 0.85;
    this.hemi.intensity = this.hemiBase * light;
    this.sun.intensity = this.sunBase * light;
    for (const w of this.weather) w.points.visible = !above;
  }
}
