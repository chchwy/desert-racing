import * as THREE from 'three';
import { LEVEL } from './levels.js';

// ---------------------------------------------------------------- dust ----

function puffTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // break the disc up a little so puffs read as billowing dust
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 6 + Math.random() * 14;
    const gg = ctx.createRadialGradient(x, y, 0, x, y, r);
    gg.addColorStop(0, 'rgba(0,0,0,0.35)');
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, size, size);
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class Dust {
  constructor(scene, max = 2500) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.size0 = new Float32Array(max);
    this.sizeAttr = new Float32Array(max);
    this.alphaAttr = new Float32Array(max);
    this.rot = new Float32Array(max);
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizeAttr, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphaAttr, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1));
    this.geo = geo;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: puffTexture() },
        uScale: { value: 500 },
        uColor: { value: LEVEL.dust.color.clone() },
        uShade: { value: LEVEL.dust.shade.clone() },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        attribute float aRot;
        uniform float uScale;
        varying float vAlpha;
        varying float vRot;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / -mv.z;
          vAlpha = aAlpha;
          vRot = aRot;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform vec3 uColor;
        uniform vec3 uShade;
        varying float vAlpha;
        varying float vRot;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          p = mat2(c, -s, s, c) * p + 0.5;
          float a = texture2D(uMap, p).a * vAlpha;
          if (a < 0.003) discard;
          vec3 col = mix(uShade, uColor, gl_PointCoord.y < 0.5 ? 1.0 : 0.75);
          gl_FragColor = vec4(col, a);
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, size, life) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size0[i] = size;
    this.rot[i] = Math.random() * Math.PI * 2;
  }

  update(dt, heightAt) {
    const drag = Math.exp(-1.6 * dt);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.alphaAttr[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k] *= drag;
      this.vel[k + 1] = this.vel[k + 1] * drag - 1.5 * dt;
      this.vel[k + 2] *= drag;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      const ground = heightAt(this.pos[k], this.pos[k + 2]) + 0.3;
      if (this.pos[k + 1] < ground) {
        this.pos[k + 1] = ground;
        this.vel[k + 1] = Math.abs(this.vel[k + 1]) * 0.2;
      }
      const t = 1 - this.life[i] / this.maxLife[i]; // 0..1 age
      this.sizeAttr[i] = this.size0[i] * (0.5 + t * 2.2);
      this.alphaAttr[i] = Math.min(t * 8, 1) * (1 - t) * (1 - t) * 0.38;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  setViewportHeight(h) {
    this.material.uniforms.uScale.value = h * 0.9;
  }
}

// --------------------------------------------------------- ribbon trail ----

export class Ribbon {
  constructor(scene, { points = 26, width = 0.32, color = new THREE.Color(1.3, 0.22, 2.4) } = {}) {
    this.n = points;
    this.width = width;
    this.trail = Array.from({ length: points }, () => new THREE.Vector3());
    this.initialized = false;

    const pos = new Float32Array(points * 2 * 3);
    const uv = new Float32Array(points * 2 * 2);
    for (let i = 0; i < points; i++) {
      const t = i / (points - 1);
      uv[i * 4] = t;
      uv[i * 4 + 1] = 0;
      uv[i * 4 + 2] = t;
      uv[i * 4 + 3] = 1;
    }
    const idx = [];
    for (let i = 0; i < points - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(idx);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color }, uIntensity: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vNear;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNear = smoothstep(4.0, 11.0, -mv.z); // fade out as it nears the lens
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uIntensity;
        varying vec2 vUv;
        varying float vNear;
        void main() {
          float edge = 1.0 - pow(abs(vUv.y * 2.0 - 1.0), 2.0);
          float fade = pow(1.0 - vUv.x, 1.6);
          float a = edge * fade * uIntensity * vNear;
          vec3 col = mix(vec3(1.2, 1.8, 2.6), uColor, smoothstep(0.0, 0.2, vUv.x));
          gl_FragColor = vec4(col * a, a);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(head, cameraPos, intensity) {
    if (!this.initialized) {
      for (const p of this.trail) p.copy(head);
      this.initialized = true;
    }
    for (let i = this.n - 1; i > 0; i--) this.trail[i].copy(this.trail[i - 1]);
    this.trail[0].copy(head);
    this.material.uniforms.uIntensity.value = intensity;

    const pos = this.geo.attributes.position.array;
    const dir = new THREE.Vector3();
    const toCam = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (let i = 0; i < this.n; i++) {
      const p = this.trail[i];
      const q = this.trail[Math.min(i + 1, this.n - 1)];
      const o = this.trail[Math.max(i - 1, 0)];
      dir.subVectors(o, q);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      toCam.subVectors(cameraPos, p);
      side.crossVectors(dir, toCam).normalize();
      const w = this.width * (1 + (i / this.n) * 0.8);
      pos[i * 6] = p.x + side.x * w;
      pos[i * 6 + 1] = p.y + side.y * w;
      pos[i * 6 + 2] = p.z + side.z * w;
      pos[i * 6 + 3] = p.x - side.x * w;
      pos[i * 6 + 4] = p.y - side.y * w;
      pos[i * 6 + 5] = p.z - side.z * w;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

// ---------------------------------------------------------- speed lines ----

export class SpeedLines {
  constructor(scene, count = 140) {
    this.count = count;
    this.local = [];
    for (let i = 0; i < count; i++) this.local.push(this.spawn(new THREE.Vector3(), true));
    const pos = new Float32Array(count * 6);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.lines = new THREE.LineSegments(this.geo, this.material);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }

  spawn(v, anywhere = false) {
    const a = Math.random() * Math.PI * 2;
    const r = 3 + Math.random() * 14;
    return v.set(Math.cos(a) * r, 1.5 + Math.sin(a) * r * 0.6 + 4, anywhere ? -20 + Math.random() * 90 : 50 + Math.random() * 30);
  }

  update(dt, origin, yaw, speed) {
    const pos = this.geo.attributes.position.array;
    const len = speed * 0.07;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    for (let i = 0; i < this.count; i++) {
      const l = this.local[i];
      l.z -= speed * dt * 1.4;
      if (l.z < -25) this.spawn(l);
      const wx = origin.x + l.x * cy + l.z * sy;
      const wz = origin.z - l.x * sy + l.z * cy;
      const wy = origin.y + l.y;
      pos[i * 6] = wx;
      pos[i * 6 + 1] = wy;
      pos[i * 6 + 2] = wz;
      pos[i * 6 + 3] = wx + sy * len;
      pos[i * 6 + 4] = wy;
      pos[i * 6 + 5] = wz + cy * len;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.material.opacity = THREE.MathUtils.clamp((speed - 35) / 50, 0, 0.35);
  }
}
