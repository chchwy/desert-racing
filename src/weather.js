import * as THREE from 'three';

// Weather particles in a box that travels with the camera: snow, ash, rising embers.
// Particles wrap around the box in the shader, so the CPU only moves one offset uniform
// per frame. `fall` is metres per second downward; a negative value rises.

const BOX = 70; // metres across, centered on the camera
const HEIGHT = 40;

const DEFAULTS = {
  count: 6000,
  fall: 1.6, // base fall speed, plus up to `fallSpread`
  fallSpread: 1.4,
  drift: 0.9, // steady sideways drift along +x
  size: 0.06, // metres, plus up to `sizeSpread`
  sizeSpread: 0.05,
  color: 0xffffff,
  opacity: 0.85,
  additive: false,
  flicker: 0, // 0..1, embers pulse
};

function flakeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class Weather {
  constructor(scene, options = {}) {
    const o = { ...DEFAULTS, ...options };
    const COUNT = o.count;
    const seed = new Float32Array(COUNT * 3);
    const phase = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      seed[i * 3] = Math.random() * BOX;
      seed[i * 3 + 1] = Math.random() * HEIGHT;
      seed[i * 3 + 2] = Math.random() * BOX;
      phase[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(seed, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.uniforms = {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uMap: { value: flakeTexture() },
      uScale: { value: 400 },
      uColor: { value: new THREE.Color(o.color) },
    };
    const f = (v) => v.toFixed(4);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: false,
      vertexShader: /* glsl */ `
        attribute float aPhase;
        uniform float uTime;
        uniform vec3 uCam;
        uniform float uScale;
        varying float vFade;
        void main() {
          float fall = ${f(o.fall)} + aPhase * ${f(o.fallSpread)};
          vec3 p = position;
          p.y -= uTime * fall;
          p.x += sin(uTime * 0.7 + aPhase * 40.0) * 0.8 + uTime * ${f(o.drift)};
          p.z += cos(uTime * 0.5 + aPhase * 23.0) * 0.6;
          // Wrap into the box around the camera.
          vec3 lo = uCam - vec3(${BOX / 2}.0, ${HEIGHT / 2}.0, ${BOX / 2}.0);
          vec3 size = vec3(${BOX}.0, ${HEIGHT}.0, ${BOX}.0);
          p = lo + mod(p - lo, size);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          vFade = smoothstep(${BOX / 2}.0, ${BOX / 2 - 10}.0, length(p.xz - uCam.xz)) * smoothstep(0.5, 2.0, d);
          vFade *= 1.0 - ${f(o.flicker)} * (0.5 + 0.5 * sin(uTime * 9.0 + aPhase * 77.0));
          gl_PointSize = (${f(o.size)} + aPhase * ${f(o.sizeSpread)}) * uScale / max(d, 0.1);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform vec3 uColor;
        varying float vFade;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a * vFade * ${f(o.opacity)};
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  setViewportHeight(h) {
    this.uniforms.uScale.value = h * 0.6;
  }

  update(time, camPos) {
    this.uniforms.uTime.value = time;
    this.uniforms.uCam.value.copy(camPos);
  }
}
