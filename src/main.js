import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';

import { Terrain, Backdrop, heightAt, groundUniforms } from './terrain.js';
import { VOLCANO, lavaAt } from './lava.js';
import { Eruption } from './eruption.js';
import { Plume } from './plume.js';
import { FishSchools } from './fish.js';
import { swellUniforms } from './reef.js';
import { Sea } from './sea.js';
import { Rivals } from './rivals.js';
import { crash } from './sound.js';
import { IceFinder, CoinFinder, TeamFinder } from './finder.js';
import { CoinRain } from './coinrain.js';
import { Swarm } from './swarm.js';
import { TEAM_COLOR, FRIEND, FOE } from './teams.js';
import { formatCoinCount, coinCount, setCoins } from './coins.js';
import { War, JAIL } from './war.js';
import { Weapons, AIR, GUN } from './weapons.js';
import { penSlot } from './jail.js';
import { OFF, DRIVE, PARKED } from './swarm.js';
import { createSky, SUN_DIR, HAZE_COLOR } from './sky.js';
import { Bike } from './bike.js';
import { Dust, Ribbon, SpeedLines } from './effects.js';
import { Input, Player } from './player.js';
import { ChaseCamera } from './camera.js';
import { LEVEL, LEVELS, LEVEL_ORDER, switchLevel } from './levels.js';
import { Grass } from './grass.js';
import { Weather } from './weather.js';
import { Shatter } from './shatter.js';
import { ice } from './snow.js';

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

const bike = new Bike({ flag: TEAM_COLOR[FRIEND] }); // the player's team flies red
scene.add(bike.root);

// Tall grass streams around the bike on the prairie only.
const grass = LEVEL.id === 'grassland' ? new Grass(scene) : null;
grass?.update(player.pos, player.pos, 0, true);

// Far peaks past the streamed chunks, and weather particles around the camera.
const backdrop = LEVEL.backdrop ? new Backdrop(scene) : null;
backdrop?.update(player.pos, true);
const weather = (LEVEL.weather ?? []).map((w) => new Weather(scene, w));
const shatter = LEVEL.id === 'snow' ? new Shatter(scene, ice) : null;
// Snow: an alarm and an arrow lead the bike to the nearest unbroken ice crystal.
const finder = LEVEL.id === 'snow' ? new IceFinder(scene, terrain, document.querySelector('.reticle .tag')) : null;
// Every level: a yellow arrow to the nearest big coin until it is collected.
const coinFinder = new CoinFinder(scene);

// Seabed: schools of fish around the bike, and the water surface overhead.
const fish = LEVEL.id === 'ocean' ? new FishSchools(scene) : null;
const sea = LEVEL.sea != null ? new Sea(scene, { sky, hemi, sun, weather, sunDir: SUN_DIR }) : null;

// Volcano: an ash column over the crater, seen from kilometres away, and a smaller
// smoking, ember-lit plume over the lava pool ahead of the start.
const plumes = [];
if (LEVEL.id === 'volcano') {
  const craterY = heightAt(VOLCANO.x, VOLCANO.z);
  plumes.push(new Plume(scene, {
    x: VOLCANO.x, y: craterY + 10, z: VOLCANO.z, count: 260, life: 26, rise: 22, spread: 140,
    size0: 90, size1: 420, smoke: 0x3c3532, glow: 0xff6a2a, opacity: 0.75, wind: [320, 120],
  }));
  const vent = terrain.chunks.get('0,0')?.props.vent;
  if (vent) {
    plumes.push(new Plume(scene, {
      x: vent.plume.x, y: vent.plume.y, z: vent.plume.z, count: 90, life: 7, rise: 5, spread: 9,
      size0: 4, size1: 22, smoke: 0x4a403c, glow: 0xff7a30, opacity: 0.5, wind: [8, 3],
    }));
  }
}

const dust = new Dust(scene);
// Small coins raining around the big discs.
const coinRain = new CoinRain(scene, terrain);
// Animal rivals on hover-bikes, racing in a pack around the player.
const rivals = new Rivals(scene, terrain, player, dust);
const eruption = LEVEL.id === 'volcano' ? new Eruption(scene, dust) : null;
const lavaVent = LEVEL.id === 'volcano' ? terrain.chunks.get('0,0')?.props.vent : null;
const trails = [new Ribbon(scene), new Ribbon(scene)];
const speedLines = new SpeedLines(scene);

const input = new Input();
const chase = new ChaseCamera(camera, canvas);

// demo mode (?demo): auto-drive for screenshots / attract mode
const params = new URLSearchParams(location.search);
// A swarm of animal bikers around the player: 994 by default, ?swarm=N for 0..10000.
// The two teams come out even: with the player and the rivals, 994 makes 500 a side.
const swarmCount = THREE.MathUtils.clamp(Number(params.get('swarm') ?? 994) || 0, 0, 10000);
const riders = 1 + rivals.list.length + swarmCount;
const redOutside = 1 + rivals.list.filter((r) => r.team === FRIEND).length;
const swarmFriends = THREE.MathUtils.clamp(Math.floor(riders / 2) - redOutside, 0, swarmCount);
const swarm = new Swarm(scene, swarmCount, player, coinRain, swarmFriends);
// Red arrow to the nearest friend, black arrow to the nearest foe.
const teamFinder = new TeamFinder(scene, [swarm, rivals]);

// ------------------------------------------------------------------- war ----
// Every rider has a stage (war.js): the level it rides in, or the jail. Shot by the
// other team, it moves on to the next level, and from the last one into jail. Only the
// riders whose stage is this page's level are on screen; the rest fight off screen.
const STAGE = LEVEL.id === 'jail' ? JAIL : LEVEL_ORDER.indexOf(LEVEL.id);
const IN_JAIL = STAGE === JAIL;
const war = new War(rivals.list.map((r) => r.team), swarmCount, swarmFriends);
war.stage[0] = STAGE; // the page you are on is where you are, picker included
setCoins(war.coins);
swarm.idBase = war.swarmBase;
const weapons = new Weapons(scene);
if (!IN_JAIL) {
  swarm.weapons = weapons;
  rivals.weapons = weapons;
}
const penFill = { [FRIEND]: 0, [FOE]: 0 };
function placeRider(id) {
  const st = war.stage[id];
  if (id >= war.swarmBase) {
    const i = id - war.swarmBase;
    if (IN_JAIL) {
      const team = war.team[id];
      if (st === JAIL) swarm.setState(i, PARKED, penSlot(team, penFill[team]++));
      else swarm.setState(i, OFF);
    } else {
      swarm.setState(i, st === STAGE ? DRIVE : OFF);
    }
  } else if (id >= war.rivalBase) {
    rivals.setActive(id - war.rivalBase, !IN_JAIL && st === STAGE);
  }
}
for (let id = 1; id < war.n; id++) placeRider(id);
war.onMove((id) => {
  if (id !== 0) placeRider(id);
});
war.save();

const SHIELD = 10000; // coins that absorb one hit
const PROTECT = 6; // seconds of spawn protection after arriving on a level
const GUN_COOLDOWN = 0.45;
let protect = PROTECT;
let leaving = 0; // counts down to the level change after a hit
let gunIn = 0;
const playerTarget = { id: 0, team: FRIEND, x: 0, y: 0, z: 0, gone: false };

function goToStage(stage) {
  war.coins = coinCount();
  war.save();
  switchLevel(stage >= JAIL ? 'jail' : LEVEL_ORDER[stage]);
}
const demo = params.has('demo');
const usePost = !params.has('nopost');
if (demo) {
  const keys = input.keys;
  input.down = (...codes) =>
    codes.some((c) => {
      if (c === 'KeyW') return true;
      if (c === 'KeyE') return Math.sin(timer.getElapsed() * 0.4) > 0.6;
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
  for (const p of plumes) p.setViewportHeight(h * renderer.getPixelRatio());
  eruption?.setViewportHeight(h * renderer.getPixelRatio());
  for (const w of weather) w.setViewportHeight(h * renderer.getPixelRatio());
}
addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------- HUD ----
document.title = LEVEL.title;
document.body.style.background = LEVEL.page;
document.body.dataset.level = LEVEL.id;
document.getElementById('eyebrow').textContent = LEVEL.eyebrow;
document.getElementById('headline').textContent = LEVEL.headline;
document.getElementById('sub').textContent = LEVEL.sub;

// Level picker: buttons, or the number keys. Picking reloads the page on that level.
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
  const i = e.code.startsWith('Digit') ? Number(e.code.slice(5)) - 1 : -1;
  if (i >= 0 && i < LEVEL_ORDER.length) switchLevel(LEVEL_ORDER[i]);
});

const hud = {
  speed: document.getElementById('speed'),
  gap: document.getElementById('gap'),
  state: document.getElementById('state'),
  energy: document.getElementById('energy'),
  fps: document.getElementById('fps'),
  kills: document.getElementById('kills'),
  caught: document.getElementById('caught'),
  allies: document.getElementById('allies'),
  coins: document.getElementById('coins'),
  coinCount: document.getElementById('coin-count'),
  alert: document.getElementById('alert'),
  burn: document.getElementById('burn'),
};

// A big centered line: eruption warnings and the death message.
let alertTimer = 0;
function showAlert(text, seconds, kind) {
  hud.alert.textContent = text;
  hud.alert.className = `alert show ${kind}`;
  alertTimer = seconds;
}

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

// A cloud of snow and ice dust where a crystal broke.
const smashAhead = new THREE.Vector3();
function frostBurst(spire) {
  const n = Math.round(THREE.MathUtils.clamp(spire.h * 1.5, 16, 50));
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * spire.w * 1.5;
    const sp = 2 + Math.random() * 7;
    dust.emit(
      spire.x + Math.cos(a) * r,
      spire.baseY + 1 + Math.random() * spire.h * 0.8,
      spire.z + Math.sin(a) * r,
      Math.cos(a) * sp + player.vel.x * 0.25,
      1 + Math.random() * 4,
      Math.sin(a) * sp + player.vel.z * 0.25,
      1.5 + Math.random() * 2,
      1.2 + Math.random() * 1.4,
    );
  }
}

// Volcano: touching lava, or a lava bomb, ends the run, and so does the seabed's glowing
// life. The bike burns up, the screen flashes, and after a moment it respawns at the start.
const DEATH_TIME = 1.6;
const GRACE = 2.5; // seconds after a respawn before bombs count
let deadTimer = 0;
let grace = GRACE;
function inLava() {
  if (!LEVEL.lava || player.gap > 2.5) return false;
  if (lavaVent?.onDeck(player.pos.x, player.pos.z)) return false;
  if (lavaAt(player.pos.x, player.pos.z) > 0.5) return true;
  return !!lavaVent && Math.hypot(player.pos.x - lavaVent.x, player.pos.z - lavaVent.z) < lavaVent.r * 0.95;
}
function die(text) {
  deadTimer = DEATH_TIME;
  showAlert(text, DEATH_TIME, 'death');
  hud.burn.classList.remove('flash');
  void hud.burn.offsetWidth;
  hud.burn.classList.add('flash');
  bike.root.visible = false;
  player.landImpact = 1;
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 2 + Math.random() * 8;
    dust.emit(player.pos.x, player.pos.y, player.pos.z, Math.cos(a) * sp + player.vel.x * 0.3, 2 + Math.random() * 8, Math.sin(a) * sp + player.vel.z * 0.3, 2 + Math.random() * 2.5, 1.5 + Math.random() * 1.5);
  }
  player.vel.set(0, 0, 0);
}
// Shot by the other team: 10,000 coins take the hit and are gone; without them you
// move on to the next level, or from the last one into jail.
let shownWinner = false;
function playerShot(kind) {
  if (leaving > 0 || protect > 0 || deadTimer > 0) return;
  const what = kind === AIR ? '空氣砲' : '機關槍';
  player.landImpact = 1;
  if (coinCount() >= SHIELD) {
    setCoins(0);
    hud.coins.textContent = formatCoinCount();
    showAlert(`被${what}擊中！一萬枚硬幣擋下了`, 2.2, 'warn');
    protect = 2;
    return;
  }
  const to = war.hit(0);
  hud.burn.classList.remove('flash');
  void hud.burn.offsetWidth;
  hud.burn.classList.add('flash');
  showAlert(to >= JAIL ? `被${what}擊中！關進監牢` : `被${what}擊中！前往第 ${to + 1} 關 ${LEVELS[LEVEL_ORDER[to]].name}`, 2, 'death');
  leaving = 1.6;
}

function respawn() {
  player.reset();
  player.yaw = 0.9;
  player.landImpact = 0;
  bike.root.visible = true;
  chase.initialized = false;
  chase.heading = player.yaw;
  grace = GRACE;
  rivals.regroup();
}

function frame(timestamp) {
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 1 / 20);
  const time = timer.getElapsed();

  input.poll();

  if (input.hit('KeyC')) chase.cycle();
  // Backspace (pad Menu) resets, or starts a new war once one is won; R and T fire.
  // L3 / R3 step through the level picker.
  if (input.hit('PadLevelBack') || input.hit('PadLevelForward')) {
    const step = input.hit('PadLevelBack') ? -1 : 1;
    const at = Math.max(LEVEL_ORDER.indexOf(LEVEL.id), 0);
    switchLevel(LEVEL_ORDER[(at + step + LEVEL_ORDER.length) % LEVEL_ORDER.length]);
  }
  if (input.hit('Backspace') && deadTimer <= 0 && !shownWinner) {
    player.reset();
    rivals.regroup();
  }
  const dead = deadTimer > 0;
  if (dead) {
    deadTimer -= dt;
    if (deadTimer <= 0) respawn();
  }
  grace = Math.max(grace - dt, 0);

  prevPos.copy(player.pos);
  // Ice crystals in the bike's path this frame shatter instead of stopping it.
  smashAhead.copy(player.pos).addScaledVector(player.vel, dt);
  for (const spire of terrain.smash(player.pos, smashAhead)) {
    shatter?.burst(spire, player.vel);
    frostBurst(spire);
    player.vel.multiplyScalar(0.88);
    player.landImpact = Math.max(player.landImpact, 0.8);
  }
  // two physics substeps for stable hovering at high speed
  const colliders = terrain.collidersNear(player.pos.x, player.pos.z);
  for (let i = 0; i < 2 && !dead; i++) {
    player.update(dt / 2, input, colliders, (x, z, n) => terrain.floorAt(x, z, n));
    if (i === 0) input.pressed.delete('Space');
  }
  // A hard hit into a solid is a crash.
  if (player.bump > 8) crash(0.3 + player.bump / 30);
  player.bump = 0;
  rivals.update(dt, time, camera.position, !dead);
  if (!dead && inLava()) die('墜入熔岩');
  if (!dead && LEVEL.sea != null && terrain.hazardHit(player.pos)) die('碰到發光生物');
  terrain.update(player.pos);
  const gained = terrain.collectCoins(prevPos, player.pos) + coinRain.update(dt, time, player, !dead);
  swarm.update(dt, time, camera.position, !dead);
  if (gained) {
    hud.coins.textContent = formatCoinCount();
    hud.coinCount.classList.remove('pop');
    void hud.coinCount.offsetWidth;
    hud.coinCount.classList.add('pop');
  }
  terrain.updateCoins(time);

  // Weapons: R (or B) fires the air cannon, one ring out at a time; T a burst of four.
  protect = Math.max(protect - dt, 0);
  gunIn -= dt;
  const armed = !dead && !IN_JAIL && leaving <= 0 && war.winner == null;
  const muzzleY = player.pos.y + 1.2;
  if (armed && (input.hit('KeyR') || input.hit('KeyB'))) weapons.fire(AIR, 0, FRIEND, player.pos.x, muzzleY, player.pos.z, player.yaw);
  if (armed && input.hit('KeyT') && gunIn <= 0) {
    weapons.fire(GUN, 0, FRIEND, player.pos.x, muzzleY, player.pos.z, player.yaw);
    gunIn = GUN_COOLDOWN;
  }
  // N: with a full 10,000 coins, spend them to move on to the next level yourself.
  if (armed && input.hit('KeyN') && coinCount() >= SHIELD && STAGE < LEVEL_ORDER.length - 1) {
    setCoins(coinCount() - SHIELD);
    war.stage[0] = STAGE + 1;
    showAlert(`前往第 ${STAGE + 2} 關 ${LEVELS[LEVEL_ORDER[STAGE + 1]].name}`, 2, 'warn');
    leaving = 1.2;
  }
  weapons.targets.length = 0;
  if (armed && protect <= 0) {
    playerTarget.x = player.pos.x;
    playerTarget.y = player.pos.y;
    playerTarget.z = player.pos.z;
    playerTarget.gone = false;
    weapons.targets.push(playerTarget);
  }
  rivals.targets(weapons.targets);
  swarm.targets(weapons.targets);
  weapons.update(dt, camera.position, (t, kind, shooter) => {
    if (t.id === 0) {
      playerShot(kind);
      return;
    }
    if (shooter === 0) war.kills++;
    for (let n = 0; n < 14; n++) {
      const a = Math.random() * Math.PI * 2;
      dust.emit(t.x, t.y + 1, t.z, Math.cos(a) * 6, 2 + Math.random() * 5, Math.sin(a) * 6, 1.6 + Math.random() * 1.5, 1 + Math.random());
    }
    war.hit(t.id);
  });
  war.update(dt, STAGE);
  if (leaving > 0) {
    leaving -= dt;
    if (leaving <= 0) goToStage(war.stage[0]);
  }
  if (war.winner != null && !shownWinner) {
    shownWinner = true;
    showAlert(`${war.winner === FRIEND ? '紅隊' : '藍隊'}獲勝！ 按 Enter（手把 Menu）重新開始`, 1e9, war.winner === FRIEND ? 'warn' : 'death');
  }
  if (shownWinner && (input.hit('Enter') || input.hit('Backspace'))) {
    war.reset();
    setCoins(0);
    if (LEVEL.id === 'desert') location.reload();
    else switchLevel('desert');
  }

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
  shatter?.update(dt);
  finder?.update(dt, time, player, !dead);
  coinFinder.update(time, player, !dead && !IN_JAIL);
  teamFinder.update(time, player, !dead && !IN_JAIL);
  speedLines.update(dt, player.pos, player.yaw, player.speed);

  grass?.update(player.pos, camera.position, time);
  backdrop?.update(player.pos);
  for (const w of weather) w.update(time, camera.position);
  for (const p of plumes) p.update(time);
  if (eruption) {
    const e = eruption.update(dt, time, player.pos, player.vel, camera.position, !dead && grace <= 0);
    const d = Math.hypot(player.pos.x - VOLCANO.x, player.pos.z - VOLCANO.z);
    if (e.erupted) {
      if (deadTimer <= 0) showAlert('火山爆發！', 3, 'warn');
      player.landImpact = Math.max(player.landImpact, THREE.MathUtils.clamp(1.2 - d / 3000, 0.15, 0.9));
    }
    // the ground keeps rumbling while the column climbs
    if (eruption.t < 6 && !dead) player.landImpact = Math.max(player.landImpact, 0.25 * (1 - eruption.t / 6));
    if (e.near < 60 && !dead) player.landImpact = Math.max(player.landImpact, 0.6 * (1 - e.near / 60));
    if (e.hit && deadTimer <= 0) die('被火山彈擊中');
  }
  if (alertTimer > 0) {
    alertTimer -= dt;
    if (alertTimer <= 0) hud.alert.classList.remove('show');
  }
  groundUniforms.uTime.value = time;
  swellUniforms.uTime.value = time;
  fish?.update(dt, time, player.pos, player.yaw);

  sea?.update(time, camera);
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
    // 擊破: foes you shot; 捕獲: foes in jail; 夥伴: friends still free.
    const c = war.counts();
    hud.kills.textContent = war.kills;
    hud.caught.textContent = c[FOE].jailed;
    hud.allies.textContent = c[FRIEND].free;
    hud.coins.textContent = formatCoinCount();
    hud.fps.textContent = `${Math.round(fpsFrames / fpsAcc)} fps · ${chase.modeName}`;
    fpsAcc = 0;
    fpsFrames = 0;
  }
  requestAnimationFrame(frame);
}

window.__game = { player, terrain, chase, camera, renderer, input, eruption, rivals, coinRain, swarm, war, weapons };
requestAnimationFrame(frame);
