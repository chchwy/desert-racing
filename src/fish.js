import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { LEVEL } from './levels.js';

const SEA_TOP = (LEVEL.sea ?? Infinity) - 4; // schools stay under the surface

// Schools of fish around the bike. Each school wanders as a group a few metres above
// the seabed; its fish hold loose offsets around the school's centre, swim with a tail
// wiggle in the vertex shader, and scatter away from the bike when it comes close.
// Schools that fall far behind are respawned ahead.

const SCHOOLS = 7;
const PER_SCHOOL = 36;
const FAR = 150;
const FLEE = 10;

const srgb = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
const TONES = [srgb(1.0, 0.82, 0.2), srgb(0.3, 0.6, 1.0), srgb(0.82, 0.86, 0.9), srgb(1.0, 0.5, 0.2), srgb(0.5, 0.95, 0.85)];

// Nose along +z, tail fin at -z.
function fishGeometry() {
  const nose = [0, 0, 0.5];
  const top = [0, 0.17, 0.05];
  const bot = [0, -0.14, 0.05];
  const left = [-0.08, 0, 0.05];
  const right = [0.08, 0, 0.05];
  const tail = [0, 0, -0.32];
  const finTop = [0, 0.2, -0.56];
  const finBot = [0, -0.2, -0.56];
  const tris = [
    nose, top, right, nose, right, bot, nose, bot, left, nose, left, top,
    tail, right, top, tail, bot, right, tail, left, bot, tail, top, left,
    tail, finTop, finBot, tail, finBot, finTop,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  g.computeVertexNormals();
  return g;
}

export class FishSchools {
  constructor(scene) {
    this.uniforms = { uTime: { value: 0 } };
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide, flatShading: true });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float phase = float(gl_InstanceID) * 1.7;
          float back = clamp(0.5 - position.z, 0.0, 1.1);
          transformed.x += sin(uTime * 11.0 + phase - position.z * 5.0) * 0.07 * back;
        }`);
    };
    mat.customProgramCacheKey = () => 'reef-fish-1';
    const n = SCHOOLS * PER_SCHOOL;
    this.mesh = new THREE.InstancedMesh(fishGeometry(), mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    this.schools = [];
    this.fish = [];
    const c = new THREE.Color();
    for (let s = 0; s < SCHOOLS; s++) {
      const tone = TONES[s % TONES.length];
      const school = { x: 0, y: 0, z: 0, heading: 0, turn: 0, speed: 0, depth: 0, size: 0 };
      this.schools.push(school);
      for (let k = 0; k < PER_SCHOOL; k++) {
        const i = s * PER_SCHOOL + k;
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * 5;
        this.fish.push({
          school,
          ox: Math.cos(a) * r,
          oy: (Math.random() - 0.5) * 3,
          oz: Math.sin(a) * r * 1.6,
          orbit: (Math.random() - 0.5) * 0.6,
          scale: 0.7 + Math.random() * 0.6,
          flee: new THREE.Vector3(),
          pos: new THREE.Vector3(),
        });
        this.mesh.setColorAt(i, c.copy(tone).offsetHSL((Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.5) * 0.12));
      }
    }
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.s = new THREE.Vector3();
    this.started = false;
  }

  respawn(school, bike, heading, near = false) {
    const a = heading + (Math.random() - 0.5) * (near ? Math.PI * 2 : 1.6);
    const d = near ? 20 + Math.random() * 70 : 70 + Math.random() * 60;
    school.x = bike.x + Math.sin(a) * d;
    school.z = bike.z + Math.cos(a) * d;
    school.depth = 2 + Math.random() * 6;
    school.y = Math.min(heightAt(school.x, school.z) + school.depth, SEA_TOP);
    school.heading = Math.random() * Math.PI * 2;
    school.turn = 0;
    school.speed = 3 + Math.random() * 4;
    school.size = 0.6 + Math.random() * 0.7;
  }

  update(dt, time, bike, bikeHeading) {
    this.uniforms.uTime.value = time;
    if (!this.started) {
      this.started = true;
      for (const s of this.schools) this.respawn(s, bike, bikeHeading, true);
    }
    for (const s of this.schools) {
      if (Math.hypot(s.x - bike.x, s.z - bike.z) > FAR) this.respawn(s, bike, bikeHeading);
      s.turn = THREE.MathUtils.clamp(s.turn + (Math.random() - 0.5) * dt * 1.5, -0.5, 0.5);
      s.heading += s.turn * dt;
      s.x += Math.sin(s.heading) * s.speed * dt;
      s.z += Math.cos(s.heading) * s.speed * dt;
      s.y = THREE.MathUtils.damp(s.y, Math.min(heightAt(s.x, s.z) + s.depth, SEA_TOP), 1.5, dt);
    }
    this.fish.forEach((f, i) => {
      const s = f.school;
      const ang = s.heading + time * f.orbit;
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      f.pos.set(s.x + f.ox * c + f.oz * sn, s.y + f.oy + Math.sin(time * 1.3 + i) * 0.3, s.z - f.ox * sn + f.oz * c);
      // Scatter away from the bike, and drift back once it has passed.
      const dx = f.pos.x + f.flee.x - bike.x;
      const dy = f.pos.y + f.flee.y - bike.y;
      const dz = f.pos.z + f.flee.z - bike.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < FLEE && d > 0.01) {
        const push = (FLEE - d) * 4 * dt;
        f.flee.x += (dx / d) * push;
        f.flee.y += (dy / d) * push * 0.5;
        f.flee.z += (dz / d) * push;
      } else {
        f.flee.multiplyScalar(Math.exp(-0.6 * dt));
      }
      f.pos.add(f.flee);
      const floor = heightAt(f.pos.x, f.pos.z) + 0.5;
      if (f.pos.y < floor) f.pos.y = floor;
      const sc = f.scale * s.size;
      this.q.setFromEuler(this.e.set(0, s.heading, 0));
      this.mesh.setMatrixAt(i, this.m.compose(f.pos, this.q, this.s.set(sc, sc, sc)));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
