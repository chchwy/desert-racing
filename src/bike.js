import * as THREE from 'three';
import { buildCatRider } from './riders/cat.js';

// Local space: +Z forward, +Y up, +X left.

const hullMat = new THREE.MeshPhysicalMaterial({
  color: 0x0c0c12,
  metalness: 0.55,
  roughness: 0.28,
  clearcoat: 1,
  clearcoatRoughness: 0.15,
});
const trimMat = new THREE.MeshStandardMaterial({ color: 0x1b1b24, metalness: 0.8, roughness: 0.35 });
const veinMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 0.35, 2.6) });
const NOZZLE_COLOR = new THREE.Color(1.6, 2.6, 3.3);

function mesh(geo, mat, parent, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  m.rotation.set(...r);
  m.scale.set(...s);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// Ribbed turbine housing, axis along Z (front at +Z, nozzle at -Z).
function thrusterGeometry() {
  const pts = [];
  const len = 1.7;
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let r = 0.62 + 0.06 * Math.sin(t * Math.PI);
    r += Math.max(0, Math.sin(t * Math.PI * 9)) * 0.07; // ribs
    if (t > 0.92) r -= (t - 0.92) * 2.2; // front lip curls in
    pts.push(new THREE.Vector2(r, t * len - len / 2));
  }
  pts.unshift(new THREE.Vector2(0.48, -len / 2 - 0.05)); // nozzle rim
  const geo = new THREE.LatheGeometry(pts, 40);
  geo.rotateX(Math.PI / 2); // lathe Y axis -> Z
  geo.computeVertexNormals();
  return geo;
}

const flameVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const flameFrag = /* glsl */ `
  uniform float uTime;
  uniform float uPower;
  uniform vec3 uCore;
  uniform vec3 uMid;
  uniform vec3 uTail;
  uniform float uSeed;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    float t = vUv.y; // 0 = nozzle, 1 = tip
    float facing = abs(dot(normalize(vN), normalize(vView)));
    float body = pow(facing, 1.6);
    float flicker = 0.85 + 0.15 * sin(uTime * 53.0 + t * 25.0 + uSeed)
                         * sin(uTime * 31.0 - vUv.x * 40.0 + uSeed);
    float fall = pow(1.0 - t, 1.3);
    vec3 col = mix(uCore, uMid, smoothstep(0.0, 0.35, t));
    col = mix(col, uTail, smoothstep(0.35, 0.95, t));
    float a = body * fall * flicker * uPower;
    gl_FragColor = vec4(col * a, a);
  }
`;

function flameMaterial(core, mid, tail, seed) {
  return new THREE.ShaderMaterial({
    vertexShader: flameVert,
    fragmentShader: flameFrag,
    uniforms: {
      uTime: { value: 0 },
      uPower: { value: 1 },
      uCore: { value: core },
      uMid: { value: mid },
      uTail: { value: tail },
      uSeed: { value: seed },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function flameGeometry(rBase, rTip) {
  const g = new THREE.CylinderGeometry(rTip, rBase, 1, 28, 10, true);
  g.translate(0, 0.5, 0);
  g.rotateX(-Math.PI / 2); // +Y -> -Z (exhaust points backwards)
  return g;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(200,240,255,0.8)');
  g.addColorStop(0.5, 'rgba(90,180,255,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Thruster {
  constructor(parent, x, y, z, seed, light = true) {
    this.root = new THREE.Group();
    this.root.position.set(x, y, z);
    parent.add(this.root);

    mesh(thrusterGeometry(), hullMat, this.root);
    // closed intake face: recessed fan disc with a domed hub
    mesh(new THREE.CircleGeometry(0.56, 32), trimMat, this.root, { p: [0, 0, 0.78] });
    mesh(new THREE.SphereGeometry(0.22, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), hullMat, this.root, {
      p: [0, 0, 0.78],
      r: [Math.PI / 2, 0, 0],
      s: [1, 0.7, 1],
    });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      mesh(new THREE.BoxGeometry(0.06, 0.3, 0.02), hullMat, this.root, {
        p: [Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0.79],
        r: [0, 0.5, a - Math.PI / 2],
      });
    }
    // glowing nozzle disc + rim
    this.nozzleMat = new THREE.MeshBasicMaterial({ color: NOZZLE_COLOR.clone() });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.47, 32), this.nozzleMat);
    disc.position.z = -0.86;
    disc.rotation.y = Math.PI;
    this.root.add(disc);
    mesh(new THREE.TorusGeometry(0.52, 0.05, 8, 40), trimMat, this.root, { p: [0, 0, -0.88] });
    // purple vein ring
    mesh(new THREE.TorusGeometry(0.69, 0.018, 6, 48), veinMat, this.root, { p: [0, 0, 0.2] });

    this.flameOuter = new THREE.Mesh(
      flameGeometry(0.46, 0.12),
      flameMaterial(new THREE.Color(1.4, 2.4, 3.2), new THREE.Color(0.35, 0.9, 2.4), new THREE.Color(0.9, 0.18, 1.8), seed),
    );
    this.flameInner = new THREE.Mesh(
      flameGeometry(0.3, 0.04),
      flameMaterial(new THREE.Color(3.5, 4, 4.5), new THREE.Color(1.4, 2.8, 4), new THREE.Color(0.5, 0.9, 2.2), seed + 1.7),
    );
    for (const f of [this.flameOuter, this.flameInner]) {
      f.position.z = -0.86;
      f.frustumCulled = false;
      this.root.add(f);
    }

    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: Thruster.glowTex || (Thruster.glowTex = glowTexture()),
        color: new THREE.Color(0.9, 1.3, 1.8),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.glow.position.z = -1.2;
    this.root.add(this.glow);

    // Rival bikes skip the light: a dozen extra point lights would cost every lit material.
    this.light = light ? new THREE.PointLight(0x7fd8ff, 0, 12, 2) : null;
    if (this.light) {
      this.light.position.z = -2.4;
      this.root.add(this.light);
    }

    this.tip = new THREE.Object3D();
    this.root.add(this.tip);
  }

  update(time, power, boost) {
    const len = 0.6 + power * 3.8 + boost * 3.0;
    const w = 0.9 + power * 0.25 + boost * 0.25;
    this.flameOuter.scale.set(w, w, len);
    this.flameInner.scale.set(w, w, len * 0.55);
    const p = 0.18 + power * 0.7 + boost * 0.4;
    this.flameOuter.material.uniforms.uPower.value = p;
    this.flameInner.material.uniforms.uPower.value = p;
    this.flameOuter.material.uniforms.uTime.value = time;
    this.flameInner.material.uniforms.uTime.value = time;
    const g = 0.6 + power * 1.4 + boost * 0.9 + Math.sin(time * 47) * 0.08;
    this.glow.scale.set(g, g, 1);
    this.glow.material.opacity = 0.2 + power * 0.8;
    if (this.light) this.light.intensity = 1 + power * 5 + boost * 5;
    this.nozzleMat.color.copy(NOZZLE_COLOR).multiplyScalar(0.35 + power * 0.65 + boost * 0.4);
    this.tip.position.z = -0.9 - len * 0.75;
  }
}

// The player's bike has the cat and thruster lights. Rivals pass their own rider builder,
// a vein color to tell them apart, and lights: false.
export class Bike {
  constructor({ rider = buildCatRider, veinColor = null, lights = true } = {}) {
    const veins = veinColor ? new THREE.MeshBasicMaterial({ color: veinColor }) : veinMat;
    this.root = new THREE.Group(); // position + yaw
    this.tilt = new THREE.Group(); // pitch / roll / hover bob
    this.root.add(this.tilt);
    const body = this.tilt;

    // central hull
    const capsule = (r, l) => new THREE.CapsuleGeometry(r, l, 8, 20);
    mesh(capsule(0.5, 2.0), hullMat, body, { p: [0, 0.55, 0.1], r: [Math.PI / 2, 0, 0], s: [0.85, 1, 0.7] });
    mesh(capsule(0.32, 1.1), trimMat, body, { p: [0, 0.2, 0.4], r: [Math.PI / 2, 0, 0], s: [1.2, 1, 0.6] });
    // seat spine
    mesh(new THREE.BoxGeometry(0.34, 0.12, 1.2), trimMat, body, { p: [0, 0.92, -0.35] });

    // front claws
    const claw = new THREE.ConeGeometry(0.13, 2.2, 8);
    claw.rotateX(Math.PI / 2);
    for (const [x, y, ry, rx, s] of [
      [0, 0.55, 0, 0.05, 1.25],
      [0.32, 0.4, 0.22, 0.12, 1],
      [-0.32, 0.4, -0.22, 0.12, 1],
      [0.55, 0.7, 0.4, -0.15, 0.8],
      [-0.55, 0.7, -0.4, -0.15, 0.8],
      [0.22, 0.85, 0.12, -0.25, 0.7],
      [-0.22, 0.85, -0.12, -0.25, 0.7],
    ]) {
      mesh(claw, hullMat, body, { p: [x, y, 1.9], r: [rx, ry, 0], s: [1, 1, s] });
    }
    // under-hull legs / skids
    for (const sx of [-1, 1]) {
      mesh(capsule(0.12, 0.8), hullMat, body, { p: [sx * 0.35, 0.05, 0.8], r: [0.6, 0, sx * 0.3] });
      mesh(capsule(0.1, 0.6), hullMat, body, { p: [sx * 0.45, -0.1, -0.7], r: [-0.5, 0, sx * 0.4] });
    }
    // rear blades
    const blade = new THREE.BoxGeometry(0.05, 0.5, 1.5);
    for (const sx of [-1, 1]) {
      mesh(blade, hullMat, body, { p: [sx * 0.25, 1.0, -1.25], r: [0.45, sx * 0.12, sx * 0.35] });
    }
    // purple veins along the hull
    const vein = new THREE.BoxGeometry(0.025, 0.025, 1.8);
    for (const sx of [-1, 1]) {
      mesh(vein, veins, body, { p: [sx * 0.43, 0.6, 0.15], r: [0.05, sx * 0.04, 0] });
      mesh(vein, veins, body, { p: [sx * 0.3, 0.3, 0.35], s: [1, 1, 0.6], r: [-0.1, 0, 0] });
    }
    // struts to the thrusters
    for (const sx of [-1, 1]) {
      mesh(new THREE.BoxGeometry(0.6, 0.18, 0.5), trimMat, body, { p: [sx * 0.7, 0.62, -0.3] });
    }

    this.thrusters = [new Thruster(body, 1.15, 0.7, -0.3, 0, lights), new Thruster(body, -1.15, 0.7, -0.3, 3.3, lights)];

    this.rider = rider(body);

    this.root.traverse((o) => {
      if (o.isMesh && o.material !== veinMat && o.material !== veins && !o.material.isMeshBasicMaterial && !(o.material instanceof THREE.ShaderMaterial)) {
        o.castShadow = true;
      }
    });
  }

  update(dt, time, s) {
    for (const t of this.thrusters) t.update(time, s.throttle, s.boost);
    this.rider.userData.animate?.(time, s);
  }

  tipWorldPositions(out) {
    this.thrusters.forEach((t, i) => t.tip.getWorldPosition(out[i]));
    return out;
  }

  nozzleWorldPositions(out) {
    this.thrusters.forEach((t, i) => t.root.getWorldPosition(out[i]));
    return out;
  }
}
