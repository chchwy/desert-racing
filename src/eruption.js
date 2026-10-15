import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { VOLCANO } from './lava.js';
import { puffTexture } from './plume.js';

// Eruptions of the volcano level's crater. Every 9–15 s the crater blows: an ash column
// shoots up, and lava bombs arc out of it. Most land on the cone; some are aimed at
// where the bike is heading. Between eruptions the crater keeps lobbing a bomb every
// second or so at the ground around the bike (never closer than SHOWER_MIN to its
// path), so lava keeps falling nearby. A bomb leaves a smoke trail through `Dust` and
// splashes into a glowing splat that cools away.
// `update` reports a new eruption and whether a bomb hit the bike.

const MAX = 160;
const G = 20;
const SHOWER_MIN = 25; // metres: shower bombs land at least this far from the bike's path
const SHOWER_MAX = 110;
const SPLAT_LIFE = 3;
const COLUMN = 220;

const bombGeo = new THREE.IcosahedronGeometry(1, 1);
const bombMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 1.3, 0.25) });

const tmp = new THREE.Vector3();

export class Eruption {
  constructor(scene, dust) {
    this.dust = dust;
    this.origin = new THREE.Vector3(VOLCANO.x, heightAt(VOLCANO.x, VOLCANO.z) + 20, VOLCANO.z);
    this.next = 3 + Math.random() * 2;
    this.shower = 1;
    this.t = 0; // seconds since the last eruption started
    this.pending = []; // { at, pos, vel, size }

    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.state = new Uint8Array(MAX); // 0 free, 1 flying, 2 splat
    this.age = new Float32Array(MAX);
    this.trail = new Float32Array(MAX);
    this.cursor = 0;

    this.mesh = new THREE.InstancedMesh(bombGeo, bombMat, MAX);
    this.mesh.frustumCulled = false;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, zero);
    scene.add(this.mesh);

    // A glow sprite on every bomb so it still reads from kilometres away.
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.glowSize = new Float32Array(MAX);
    glowGeo.setAttribute('aSize', new THREE.BufferAttribute(this.glowSize, 1).setUsage(THREE.DynamicDrawUsage));
    this.glowGeo = glowGeo;
    this.uniforms = { uScale: { value: 500 }, uMap: { value: puffTexture() }, uT: { value: 1e4 } };
    this.glow = new THREE.Points(
      glowGeo,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          attribute float aSize;
          uniform float uScale;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize > 0.0 ? max(aSize * uScale / -mv.z, 7.0) : 0.0;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D uMap;
          void main() {
            float a = texture2D(uMap, gl_PointCoord).a;
            gl_FragColor = vec4(vec3(2.4, 0.8, 0.2) * a, a);
          }
        `,
      }),
    );
    this.glow.frustumCulled = false;
    scene.add(this.glow);

    // The eruption column: puffs launched over the first seconds, each rising and
    // widening once, so the column climbs out of the crater instead of fading in.
    const seed = new Float32Array(COLUMN * 3);
    for (let i = 0; i < COLUMN; i++) {
      seed[i * 3] = Math.random() * 5; // launch delay (s)
      seed[i * 3 + 1] = Math.random() * Math.PI * 2;
      seed[i * 3 + 2] = Math.random();
    }
    const colGeo = new THREE.BufferGeometry();
    colGeo.setAttribute('position', new THREE.BufferAttribute(seed, 3));
    this.column = new THREE.Points(
      colGeo,
      new THREE.ShaderMaterial({
        uniforms: {
          ...this.uniforms,
          uOrigin: { value: this.origin },
          uSmoke: { value: new THREE.Color(0x2e2826) },
          uGlow: { value: new THREE.Color(0xff6a20) },
        },
        transparent: true,
        depthWrite: false,
        fog: false,
        vertexShader: /* glsl */ `
          uniform float uT;
          uniform float uScale;
          uniform vec3 uOrigin;
          varying float vAge;
          varying float vFade;
          void main() {
            float life = 16.0 + position.z * 6.0;
            float age = (uT - position.x) / life;
            vAge = age;
            vFade = (age > 0.0 && age < 1.0) ? smoothstep(0.0, 0.03, age) * (1.0 - smoothstep(0.55, 1.0, age)) : 0.0;
            float up = (700.0 + position.z * 500.0) * sqrt(max(age, 0.0));
            float reach = (40.0 + 260.0 * age) * position.z;
            vec3 p = uOrigin + vec3(cos(position.y) * reach + 260.0 * age * age, up, sin(position.y) * reach + 90.0 * age * age);
            vec4 mv = viewMatrix * vec4(p, 1.0);
            gl_PointSize = vFade > 0.0 ? mix(160.0, 700.0, age) * uScale / max(-mv.z, 1.0) : 0.0;
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
            float a = texture2D(uMap, gl_PointCoord).a * vFade * 0.85;
            if (a < 0.01) discard;
            gl_FragColor = vec4(mix(uGlow * 1.6, uSmoke, smoothstep(0.0, 0.25, vAge)), a);
          }
        `,
      }),
    );
    this.column.frustumCulled = false;
    scene.add(this.column);
  }

  setViewportHeight(h) {
    this.uniforms.uScale.value = h * 0.6;
  }

  get active() {
    return this.t < 25;
  }

  erupt(bikePos, bikeVel) {
    this.t = 0;
    this.next = 9 + Math.random() * 6;
    const o = this.origin;
    // Wide bombs: steep arcs that land on the cone and around its foot.
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = 0.95 + Math.random() * 0.45;
      const sp = 50 + Math.random() * 75;
      this.pending.push({
        at: Math.random() * 4,
        pos: o.clone(),
        vel: new THREE.Vector3(Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp),
        size: 2 + Math.random() * 3,
      });
    }
    // Aimed bombs: ballistic shots at points around where the bike will be.
    for (let i = 0; i < 12; i++) {
      this.aim(bikePos, bikeVel, 0.5 + Math.random() * 4, i < 3 ? 0 : 20, i < 3 ? 18 : 110);
    }
  }

  // One ballistic bomb from the crater at a point rMin..rMax from where the bike will
  // be when it lands, launched `at` seconds into the current eruption clock.
  aim(bikePos, bikeVel, at, rMin, rMax) {
    const o = this.origin;
    const T = 6 + Math.random() * 3;
    const lead = at - this.t + T;
    const r = rMin + Math.random() * (rMax - rMin);
    const a = Math.random() * Math.PI * 2;
    const tx = bikePos.x + bikeVel.x * lead * 0.8 + Math.cos(a) * r;
    const tz = bikePos.z + bikeVel.z * lead * 0.8 + Math.sin(a) * r;
    const ty = heightAt(tx, tz);
    this.pending.push({
      at,
      pos: o.clone(),
      vel: new THREE.Vector3((tx - o.x) / T, (ty - o.y) / T + 0.5 * G * T, (tz - o.z) / T),
      size: 2 + Math.random() * 2.5,
    });
  }

  launch(b) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX;
    this.pos[i * 3] = b.pos.x;
    this.pos[i * 3 + 1] = b.pos.y;
    this.pos[i * 3 + 2] = b.pos.z;
    this.vel[i * 3] = b.vel.x;
    this.vel[i * 3 + 1] = b.vel.y;
    this.vel[i * 3 + 2] = b.vel.z;
    this.size[i] = b.size;
    this.state[i] = 1;
    this.age[i] = 0;
  }

  splash(i, camPos) {
    const k = i * 3;
    const x = this.pos[k];
    const y = this.pos[k + 1];
    const z = this.pos[k + 2];
    if (Math.hypot(x - camPos.x, z - camPos.z) > 900) return;
    const s = this.size[i];
    for (let n = 0; n < 18; n++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 9;
      this.dust.emit(x, y + 0.5, z, Math.cos(a) * sp, 2 + Math.random() * 7, Math.sin(a) * sp, s * (0.8 + Math.random()), 1.5 + Math.random() * 1.5);
    }
  }

  // Returns { erupted, hit }. `hit` only counts when `vulnerable`.
  update(dt, time, bikePos, bikeVel, camPos, vulnerable) {
    const out = { erupted: false, hit: false, near: Infinity };
    this.t += dt;
    this.next -= dt;
    if (this.next <= 0) {
      this.erupt(bikePos, bikeVel);
      out.erupted = true;
    }
    this.shower -= dt;
    if (this.shower <= 0) {
      this.shower = 0.5 + Math.random() * 0.7;
      this.aim(bikePos, bikeVel, this.t, SHOWER_MIN, SHOWER_MAX);
    }
    this.uniforms.uT.value = this.t;

    for (let j = this.pending.length - 1; j >= 0; j--) {
      if (this.pending[j].at <= this.t) {
        this.launch(this.pending[j]);
        this.pending.splice(j, 1);
      }
    }

    for (let i = 0; i < MAX; i++) {
      const k = i * 3;
      const st = this.state[i];
      if (st === 0) {
        this.glowSize[i] = 0;
        continue;
      }
      this.age[i] += dt;
      const s = this.size[i];
      if (st === 1) {
        this.vel[k + 1] -= G * dt;
        this.pos[k] += this.vel[k] * dt;
        this.pos[k + 1] += this.vel[k + 1] * dt;
        this.pos[k + 2] += this.vel[k + 2] * dt;
        tmp.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]);
        const d = tmp.distanceTo(bikePos);
        if (vulnerable && d < s + 2.5) out.hit = true;
        const gy = heightAt(this.pos[k], this.pos[k + 2]);
        if (this.pos[k + 1] - s * 0.4 < gy && this.vel[k + 1] < 0) {
          this.pos[k + 1] = gy;
          this.state[i] = 2;
          this.age[i] = 0;
          this.splash(i, camPos);
          const flat = Math.hypot(this.pos[k] - bikePos.x, this.pos[k + 2] - bikePos.z);
          if (vulnerable && flat < s * 1.5 + 3 && bikePos.y - gy < 6) out.hit = true;
          out.near = Math.min(out.near, flat);
        } else if (tmp.distanceTo(camPos) < 700) {
          // smoke trail, a few puffs a second per bomb
          this.trail[i] += dt * 22;
          while (this.trail[i] >= 1) {
            this.trail[i] -= 1;
            this.dust.emit(this.pos[k], this.pos[k + 1], this.pos[k + 2], 0, 0.5, 0, s * 1.4, 1.4);
          }
        }
        this.q.setFromAxisAngle(tmp.set(0.3, 1, 0.2).normalize(), this.age[i] * 3);
        this.s.setScalar(s);
        this.glowSize[i] = s * 6;
      } else {
        const t = this.age[i] / SPLAT_LIFE;
        if (t >= 1) {
          this.state[i] = 0;
          this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
          this.glowSize[i] = 0;
          continue;
        }
        this.q.identity();
        const w = s * (1.4 + t * 0.8) * (1 - t * t);
        this.s.set(w, s * 0.25 * (1 - t), w);
        this.glowSize[i] = s * 6 * (1 - t);
      }
      this.m.compose(tmp.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]), this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.glowGeo.attributes.position.needsUpdate = true;
    this.glowGeo.attributes.aSize.needsUpdate = true;
    return out;
  }
}
