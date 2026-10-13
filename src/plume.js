import * as THREE from 'three';

// A smoke column from a fixed vent: big soft puffs rise, widen and darken, lit orange
// near the source. Used for the volcano crater (huge, seen from kilometres away) and
// the lava pool (small, with embers). Puff ages are offset so the column is always full.

export function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Plume {
  // o: { x, y, z, count, life, rise, spread, size0, size1, smoke, glow, opacity, wind }
  constructor(scene, o) {
    const n = o.count;
    const seed = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      seed[i * 3] = Math.random(); // age offset
      seed[i * 3 + 1] = Math.random() * Math.PI * 2; // direction
      seed[i * 3 + 2] = Math.random(); // spread and speed jitter
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(seed, 3));
    this.uniforms = {
      uTime: { value: 0 },
      uScale: { value: 400 },
      uMap: { value: puffTexture() },
      uSmoke: { value: new THREE.Color(o.smoke) },
      uGlow: { value: new THREE.Color(o.glow) },
      uOrigin: { value: new THREE.Vector3(o.x, o.y, o.z) },
      uWind: { value: new THREE.Vector2(...(o.wind ?? [0, 0])) },
    };
    const f = (v) => v.toFixed(4);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uScale;
        uniform vec3 uOrigin;
        uniform vec2 uWind;
        varying float vAge;
        varying float vFade;
        void main() {
          float age = fract(uTime / ${f(o.life)} + position.x);
          float jitter = position.z;
          vec3 p = uOrigin;
          float up = age * ${f(o.rise)} * ${f(o.life)} * (0.8 + 0.4 * jitter);
          float reach = ${f(o.spread)} * (0.3 + age) * jitter;
          p += vec3(cos(position.y) * reach + uWind.x * age * age, up, sin(position.y) * reach + uWind.y * age * age);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vAge = age;
          vFade = smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(0.6, 1.0, age));
          gl_PointSize = mix(${f(o.size0)}, ${f(o.size1)}, age) * uScale / max(-mv.z, 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform vec3 uSmoke;
        uniform vec3 uGlow;
        varying float vAge;
        varying float vFade;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a * vFade * ${f(o.opacity)};
          if (a < 0.01) discard;
          vec3 col = mix(uGlow, uSmoke, smoothstep(0.0, 0.3, vAge));
          gl_FragColor = vec4(col, a);
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

  update(time) {
    this.uniforms.uTime.value = time;
  }
}
