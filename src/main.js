import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';

import { Terrain, heightAt } from './terrain.js';
import { formatCoinCount } from './coins.js';
import { createSky, SUN_DIR, HAZE_COLOR } from './sky.js';
import { Bike } from './bike.js';
import { Dust, Ribbon, SpeedLines } from './effects.js';
import { Input, Player } from './player.js';
import { ChaseCamera } from './camera.js';
import { LEVEL, LEVELS, LEVEL_ORDER, switchLevel } from './levels.js';

// ------------------------------------------------------------- renderer ----
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(HAZE_COLOR, LEVEL.fogNear, LEVEL.fogFar);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.4, 8000);

// ----------------------------------------------------------------- light ----
const hemi = new THREE.HemisphereLight(LEVEL.hemi.sky, LEVEL.hemi.ground, LEVEL.hemi.intensity);
scene.add(hemi);
const sun = new THREE.DirectionalLight(LEVEL.sun.color, LEVEL.sun.intensity);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -30;
sun.shadow.camera.right = sun.shadow.camera.top = 30;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 300;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

// ----------------------------------------------------------------- world ----
const sky = createSky();
scene.add(sky);

const terrain = new Terrain(scene, renderer);
const player = new Player();
terrain.update(player.pos, true);

const bike = new Bike();
scene.add(bike.root);

const dust = new Dust(scene);
const trails = [new Ribbon(scene), new Ribbon(scene)];
const speedLines = new SpeedLines(scene);

const input = new Input();
const chase = new ChaseCamera(camera, canvas);

// demo mode (?demo): auto-drive for screenshots / attract mode
const params = new URLSearchParams(location.search);
const demo = params.has('demo');
const usePost = !params.has('nopost');
if (demo) {
  const keys = input.keys;
  input.down = (...codes) =>
    codes.some((c) => {
      if (c === 'KeyW') return true;
      if (c === 'ShiftLeft') return Math.sin(timer.getElapsed() * 0.4) > 0.6;
      if (c === 'KeyA') return Math.sin(timer.getElapsed() * 0.35) > 0.55;
      if (c === 'KeyD') return Math.sin(timer.getElapsed() * 0.35) < -0.7;
      return keys.has(c);
    });
}

// ---------------------------------------------------------- post-process ----
// note: an MSAA target combined with UnrealBloomPass rendered a blank frame here, so AA is done with FXAA
const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.3, 1.3);
if (!params.has('nobloom')) composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.addPass(new FXAAPass());

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  dust.setViewportHeight(h * renderer.getPixelRatio());
}
addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------- HUD ----
document.title = LEVEL.title;
document.body.style.background = LEVEL.page;
document.getElementById('eyebrow').textContent = LEVEL.eyebrow;
document.getElementById('headline').textContent = LEVEL.headline;
document.getElementById('sub').textContent = LEVEL.sub;

// Level picker: buttons, or keys 1 / 2. Picking reloads the page on that level.
const picker = document.getElementById('levels');
LEVEL_ORDER.forEach((id, i) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = `${i + 1} ${LEVELS[id].name}`;
  if (id === LEVEL.id) btn.classList.add('active');
  btn.addEventListener('click', () => switchLevel(id));
  picker.appendChild(btn);
});
addEventListener('keydown', (e) => {
  const i = ['Digit1', 'Digit2'].indexOf(e.code);
  if (i >= 0) switchLevel(LEVEL_ORDER[i]);
});

const hud = {
  speed: document.getElementById('speed'),
  gap: document.getElementById('gap'),
  state: document.getElementById('state'),
  energy: document.getElementById('energy'),
  fps: document.getElementById('fps'),
  coins: document.getElementById('coins'),
  coinCount: document.getElementById('coin-count'),
};

// ------------------------------------------------------------------ loop ----
const timer = new THREE.Timer();
timer.connect(document);
const tips = [new THREE.Vector3(), new THREE.Vector3()];
const prevPos = new THREE.Vector3();
const nozzles = [new THREE.Vector3(), new THREE.Vector3()];
let emitAcc = 0;
let fpsAcc = 0;
let fpsFrames = 0;
let hudTimer = 0;

function emitDust(dt) {
  const speed = player.speed;
  const gap = player.gap;
  if (gap > 4) return;
  const near = 1 - THREE.MathUtils.clamp((gap - 0.5) / 3.5, 0, 1);
  const rate = (15 + speed * 5 + player.boost * 120 + player.landImpact * 600) * near;
  emitAcc += rate * dt;
  const fwd = player.forward;
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  while (emitAcc >= 1) {
    emitAcc -= 1;
    const side = Math.random() < 0.5 ? -1 : 1;
    const along = -1 - Math.random() * 3;
    const x = player.pos.x + fwd.x * along + right.x * side * (0.6 + Math.random() * 1.5);
    const z = player.pos.z + fwd.z * along + right.z * side * (0.6 + Math.random() * 1.5);
    const y = heightAt(x, z) + 0.2;
    const spread = 3 + speed * 0.12;
    dust.emit(
      x,
      y,
      z,
      player.vel.x * 0.35 + right.x * side * spread * Math.random() + (Math.random() - 0.5) * 2,
      1 + Math.random() * (2 + speed * 0.06),
      player.vel.z * 0.35 + right.z * side * spread * Math.random() + (Math.random() - 0.5) * 2,
      1.2 + Math.random() * 1.6 + speed * 0.02,
      1.0 + Math.random() * 1.4,
    );
  }
}

function frame(timestamp) {
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 1 / 20);
  const time = timer.getElapsed();

  input.poll();

  if (input.hit('KeyC')) chase.cycle();
  if (input.hit('KeyR')) player.reset();

  prevPos.copy(player.pos);
  // two physics substeps for stable hovering at high speed
  const colliders = terrain.collidersNear(player.pos.x, player.pos.z);
  for (let i = 0; i < 2; i++) {
    player.update(dt / 2, input, colliders, (x, z, n) => terrain.floorAt(x, z, n));
    if (i === 0) input.pressed.delete('Space');
  }
  terrain.update(player.pos);
  const gained = terrain.collectCoins(prevPos, player.pos);
  if (gained) {
    hud.coins.textContent = formatCoinCount();
    hud.coinCount.classList.remove('pop');
    void hud.coinCount.offsetWidth;
    hud.coinCount.classList.add('pop');
  }
  terrain.updateCoins(time);

  // bike transform
  bike.root.position.copy(player.pos);
  bike.root.rotation.y = player.yaw;
  bike.tilt.rotation.set(player.pitch, 0, player.lean, 'YXZ');
  bike.tilt.position.y = -0.35 + Math.sin(time * 3.1) * 0.05 * (1 - Math.min(player.speed / 30, 1));
  bike.update(dt, time, { throttle: player.throttle, boost: player.boost, speed: player.speed, lean: player.lean });
  bike.root.updateMatrixWorld(true);

  chase.update(dt, player, time, { x: input.pad.lookX, y: input.pad.lookY }, (x, z) => terrain.floorAt(x, z));

  bike.tipWorldPositions(tips);
  trails.forEach((t, i) => t.update(tips[i], camera.position, 0.25 + player.throttle * 0.5 + player.boost * 0.6));
  emitDust(dt);
  dust.update(dt, heightAt);
  speedLines.update(dt, player.pos, player.yaw, player.speed);

  sky.position.copy(camera.position);
  sky.material.uniforms.uTime.value = time;
  sun.position.copy(player.pos).addScaledVector(SUN_DIR, 120);
  sun.target.position.copy(player.pos);

  if (usePost) composer.render();
  else renderer.render(scene, camera);
  input.endFrame();

  // HUD (throttled)
  hudTimer -= dt;
  fpsAcc += dt;
  fpsFrames++;
  if (hudTimer <= 0) {
    hudTimer = 0.08;
    hud.speed.textContent = Math.round(player.speed * 3.6);
    hud.gap.textContent = player.gap.toFixed(1);
    hud.state.textContent = player.stateLabel;
    hud.energy.style.transform = `scaleX(${player.energy.toFixed(3)})`;
  }
  if (fpsAcc > 1) {
    hud.fps.textContent = `${Math.round(fpsFrames / fpsAcc)} fps · ${chase.modeName}`;
    fpsAcc = 0;
    fpsFrames = 0;
  }
  requestAnimationFrame(frame);
}

window.__game = { player, terrain, chase, camera, renderer, input };
requestAnimationFrame(frame);
