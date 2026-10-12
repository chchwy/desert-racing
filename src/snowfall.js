import * as THREE from 'three';

// Falling snow in a box that travels with the camera. Flakes wrap around the box in the
// shader, so the CPU only moves one offset uniform per frame.

const COUNT = 6000;
const BOX = 70; // metres across, centered on the camera
const HEIGHT = 40;

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

export class Snowfall {
  constructor(scene) {
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
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        attribute float aPhase;
        uniform float uTime;
        uniform vec3 uCam;
        uniform float uScale;
        varying float vFade;
        void main() {
          float fall = 1.6 + aPhase * 1.4;
          vec3 p = position;
          p.y -= uTime * fall;
          p.x += sin(uTime * 0.7 + aPhase * 40.0) * 0.8 + uTime * 0.9;
          p.z += cos(uTime * 0.5 + aPhase * 23.0) * 0.6;
          // Wrap into the box around the camera.
          vec3 lo = uCam - vec3(${BOX / 2}.0, ${HEIGHT / 2}.0, ${BOX / 2}.0);
          vec3 size = vec3(${BOX}.0, ${HEIGHT}.0, ${BOX}.0);
          p = lo + mod(p - lo, size);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          vFade = smoothstep(${BOX / 2}.0, ${BOX / 2 - 10}.0, length(p.xz - uCam.xz)) * smoothstep(0.5, 2.0, d);
          gl_PointSize = (0.06 + aPhase * 0.05) * uScale / max(d, 0.1);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying float vFade;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a * vFade * 0.85;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(1.0), a);
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
