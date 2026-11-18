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
import { crash, chime, sob } from './sound.js';
import { IceFinder, CoinFinder, TeamFinder } from './finder.js';
import { CoinRain } from './coinrain.js';
import { Swarm } from './swarm.js';
import { TEAM_COLOR, FRIEND, FOE } from './teams.js';
import { formatCoinCount, coinCount, setCoins, addCoins, coinExit } from './coins.js';
import { ExitGate } from './exit.js';
import { War, JAIL, PENALTY } from './war.js';
import { Weapons, AIR, GUN } from './weapons.js';
import { penBounds, PENS, JailCoins, RouteOverlay, ARENA } from './jail.js';
import { Tears } from './tears.js';
import { RoomZones, BUILDING, MACHINES, ROOMS, ROOM, glassMat } from './penalty.js';
import { density } from './outside.js';
import { OFF, DRIVE } from './swarm.js';
import { createSky, SUN_DIR, HAZE_COLOR } from './sky.js';
import { Bike } from './bike.js';
import { Chooser } from './chooser.js';
import { clock, Nightfall, skipToMorning } from './daynight.js';
import { Ghosts } from './ghosts.js';
import { House, drawClock } from './house.js';
import { setWindowGlow } from './houses.js';
import { InteriorWorld, INTERIOR_Y } from './interior.js';
import { TntField, REACH as TNT_REACH } from './tnt.js';
import { PrivateRain } from './privaterain.js';
import { Dust, Ribbon, SpeedLines } from './effects.js';
import { Input, Player } from './player.js';
import { ChaseCamera } from './camera.js';
import { LEVEL, LEVELS, LEVEL_ORDER, PICKER, switchLevel } from './levels.js';
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
const nightfall = new Nightfall({ renderer, sun, hemi, sky, fog: scene.fog });

const terrain = new Terrain(scene, renderer);
const player = new Player();
terrain.update(player.pos, true);

const chooser = new Chooser();
const bike = new Bike({ rider: chooser.current.build, flag: TEAM_COLOR[FRIEND], spikes: true }); // the player's team flies red; only the player has spikes
scene.add(bike.root);
// Only horse, zebra and antelope boost to 300 km/h and lift into low flight.
player.flyer = !!chooser.current.fast;
chooser.onPreview = (r) => {
  bike.setRider(r.build);
  player.flyer = !!r.fast;
};

// Tall grass streams around the bike on the prairie only.
const grass = LEVEL.id === 'grassland' ? new Grass(scene) : null;
grass?.update(player.pos, player.pos, 0, true);

// Far peaks past the streamed chunks, and weather particles around the camera.
const backdrop = LEVEL.backdrop ? new Backdrop(scene) : null;
backdrop?.update(player.pos, true);
const weather = (LEVEL.weather ?? []).map((w) => new Weather(scene, w));
const glassShards = glassMat.clone();
glassShards.opacity = 0.6;
const shatter = LEVEL.id === 'snow' ? new Shatter(scene, ice) : LEVEL.id === 'penalty' ? new Shatter(scene, glassShards) : null;
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
// A swarm of animal bikers around the player: 494 by default, ?swarm=N for 0..10000.
// The two teams come out even: with the player and the rivals, 494 makes 250 a side.
const swarmCount = THREE.MathUtils.clamp(Number(params.get('swarm') ?? 494) || 0, 0, 10000);
const riders = 1 + rivals.list.length + swarmCount;
const redOutside = 1 + rivals.list.filter((r) => r.team === FRIEND).length;
const swarmFriends = THREE.MathUtils.clamp(Math.floor(riders / 2) - redOutside, 0, swarmCount);
const swarm = new Swarm(scene, swarmCount, player, coinRain, swarmFriends);
// Red arrow to the nearest friend, black arrow to the nearest foe.
const teamFinder = new TeamFinder(scene, [swarm, rivals]);

// ------------------------------------------------------------------- war ----
// Every rider has a stage (war.js): the level it rides in, the jail, or the penalty
// jail. Shot by the other team, it moves on to the next level, and from the last one
// into jail. Only the riders whose stage is this page's level are on screen; the rest
// play on off screen. Everyone keeps the same rules, locked up or not.
const STAGE = LEVEL.id === 'jail' ? JAIL : LEVEL.id === 'penalty' ? PENALTY : LEVEL_ORDER.indexOf(LEVEL.id);
const IN_JAIL = STAGE === JAIL;
const IN_PENALTY = STAGE === PENALTY;
const LOCKED = IN_JAIL || IN_PENALTY;
const war = new War(rivals.list.map((r) => r.team), swarmCount, swarmFriends);
war.stage[0] = STAGE; // the page you are on is where you are, picker included
setCoins(war.coins);
swarm.idBase = war.swarmBase;
const weapons = new Weapons(scene);
swarm.weapons = weapons;
rivals.weapons = weapons;

// Locked up, riders are boxed: their team's pen in the jail, a room of their own in the
// penalty jail (the player's is room 0). Broken doors join rooms (zones).
const zones = IN_PENALTY ? new RoomZones() : null;
const roomOf = (id) => 1 + (id * 7919) % (ROOMS * ROOMS - 1);
function boxFor(id) {
  if (IN_JAIL) return penBounds(war.team[id], 3);
  return zones.box(roomOf(id));
}
function placeRider(id) {
  const st = war.stage[id];
  if (id >= war.swarmBase) {
    const i = id - war.swarmBase;
    if (st !== STAGE) {
      swarm.setState(i, OFF);
    } else {
      swarm.setState(i, DRIVE);
      if (LOCKED) swarm.confine(i, boxFor(id));
    }
  } else if (id >= war.rivalBase) {
    rivals.setActive(id - war.rivalBase, !LOCKED && st === STAGE);
  }
}
for (let id = 1; id < war.n; id++) placeRider(id);
war.onMove((id) => {
  if (id !== 0) placeRider(id);
});
war.save();

const SHIELD = 10000; // coins that absorb one hit
// The spikes on the back of the player's bike: a rider that runs into them pays
// SPIKE_FINE to the player, or starts over on the first level without it. The swarm and
// the rivals keep no coins, so for now they always start over. Racing levels only.
const SPIKE_FINE = 35000000;
const SPIKE_BACK = [1.2, 5]; // metres behind the player's center
const SPIKE_SIDE = 1.9; // metres either side
function spiked(x, z, f) {
  const dx = x - player.pos.x;
  const dz = z - player.pos.z;
  const back = -(dx * f.x + dz * f.z);
  const side = Math.abs(dx * f.z - dz * f.x);
  return back > SPIKE_BACK[0] && back < SPIKE_BACK[1] && side < SPIKE_SIDE;
}
function prick(id) {
  crash(1);
  if (war.stage[id] === 0) placeRider(id); // already on the first level: back to a start spot
  else war.send(id, 0);
  showAlert('被尖刺刺到！沒有 3,500 萬，重新開始', 1.5, 'warn');
}
// Riding as 仙人掌先生, any rider that bumps the bike pays CACTUS_FINE to the player, at
// most once every CACTUS_GAP seconds per rider. Riders keep no coins, so the player gets
// it all. A rider on the back spikes is pricked instead. In the desert the bump also
// sticks one spine in the rider, counted like the cacti (war.pricks); the thirtieth
// starts it over. The cactus dries yellow and greens again over about 30 seconds.
const CACTUS_FINE = 300000;
const CACTUS_REACH = 2.8; // metres between centers
const CACTUS_GAP = 3;
const cactusFined = new Map(); // rider id -> time of its last fine
function cactusBump(id, x, z, time) {
  if (Math.hypot(x - player.pos.x, z - player.pos.z) > CACTUS_REACH) return;
  if (time - (cactusFined.get(id) ?? -Infinity) < CACTUS_GAP) return;
  cactusFined.set(id, time);
  addCoins(CACTUS_FINE);
  bike.rider.userData.hit?.();
  if (LEVEL.id === 'desert' && ++war.pricks[id] >= SPINES_FULL) {
    war.pricks[id] = 0;
    placeRider(id);
  }
  showAlert(LEVEL.id === 'desert' ? '撞到仙人掌先生！罰 30 萬枚，插一根刺' : '撞到仙人掌先生！罰 30 萬枚', 1.5, 'warn');
}
// In jail, coins are thrown into the pens from outside and pile up where they land; in
// the penalty jail they drop from a machine over every room. Pick up BAIL of them to
// get out: from the jail back to the first level, from the penalty jail back to the
// jail. Locked up, over JAIL_TOP is speeding: a speeder pays FINE coins (into debt if
// it does not have them; the count can go negative), and a speeder in the jail goes to
// the huge coin jail. In the coin jail the fine is only PENALTY_FINE.
const BAIL = IN_PENALTY ? 300 : 30; // coins picked up; the coin jail rains so hard it takes more
const JAIL_TOP = 200 / 3.6; // 200 km/h: the limit
const FINE = IN_PENALTY ? 100 : 10000;
const FINE_GAP = 5; // seconds between two fines
let fineIn = 0;
// The secret route out of the pen: with SEE_ROUTE coins a rider sees it and the hidden
// gate in the fence lets it through; without them the gate stays shut. Its big coins are
// worth ROUTE_COIN each. Reaching the arena at its end ends the war on the spot: the team
// with more riders free wins, but only if the finisher holds WIN_COINS; short of that it
// is a draw. Then the losers turn up in the arena crying, for the winners to shoot at.
const SEE_ROUTE = 140000;
const WIN_COINS = 200000;
const DRAW = 2; // war.winner for a draw
const ARENA_CROWD = 40; // riders of each team brought into the arena
let arenaOn = false;
let tearIn = 0;
let sobIn = 0;
const tears = IN_JAIL ? new Tears(scene) : null;
const arenaBox = { x0: ARENA.x0 + 4, x1: ARENA.x1 - 4, z0: ARENA.z0 + 4, z1: ARENA.z1 - 4 };
const ROUTE_COIN = 10000;
let finishNote = '';
let restartIn = 0;
let bailing = 0;
let bailPicked = 0;
const reticleTag = document.querySelector('.reticle .tag');
let jailCoins = null;
if (IN_JAIL) {
  // Coins come in fast, and big ones often.
  const pour = { rate: 25, bigShare: 0.3, superMin: 10, superSpan: 5 };
  jailCoins = new JailCoins(scene, heightAt, { bounds: penBounds(FRIEND, 4), lobFrom: PENS[FRIEND], ...pour });
  const blueCoins = new JailCoins(scene, heightAt, { bounds: penBounds(FOE, 4), lobFrom: PENS[FOE], ...pour });
  swarm.coinSources = [{ box: penBounds(FRIEND, 0), src: jailCoins }, { box: penBounds(FOE, 0), src: blueCoins }];
  swarm.extraCoins = [blueCoins]; // updated with nobody to pick them but the swarm
} else if (IN_PENALTY) {
  // Busy machines: big coins and 10,000-coin super coins are common.
  // The coin jail: fountains spray big coins only (worth 1,000 or 10,000), and a
  // 100,000 super coin drops every few seconds. Every coin counts 1 toward bail.
  jailCoins = new JailCoins(scene, heightAt, {
    bounds: BUILDING, machines: MACHINES, fountain: 38, rate: 70, mix: [0, 0.7, 0.3], pieces: true,
    superR: 5, superMin: 3, superSpan: 3, superWorth: 100000,
  });
  swarm.coinSources = [{ box: BUILDING, src: jailCoins }];
}
const route = IN_JAIL ? new RouteOverlay(scene, heightAt) : null;
// Outside the coin jail it rains coins, thick where the creepers and coins lie thick.
if (IN_PENALTY) coinRain.zone = (pos) => density(pos.x, pos.z);
if (LOCKED) {
  coinRain.mesh.visible = IN_PENALTY;
  swarm.speedCap = JAIL_TOP;
  // Same rules for the swarm: thirty coins buy their way out, and a speeder in the jail
  // goes to the penalty jail.
  // Jail is jail: nobody buys their way out of it. Thirty coins in the coin jail only
  // buy the way back to the jail.
  swarm.onBail = IN_PENALTY ? (i) => war.send(war.swarmBase + i, JAIL) : null;
  swarm.onSpeed = null; // a fine is all speeding costs now, and the swarm keeps no coins
}
const PROTECT = 6; // seconds of spawn protection after arriving on a level
const GUN_COOLDOWN = 0.45;
let protect = PROTECT;
let leaving = 0; // counts down to the level change after a hit
let gunIn = 0;
const playerTarget = { id: 0, team: FRIEND, x: 0, y: 0, z: 0, gone: false };
const FAR_AWAY = new THREE.Vector3(1e6, 0, 1e6); // nobody near enough to pick up

// Bring a crowd of both teams into the arena: the losers crying, the winners free to
// shoot at them. It is a show after the war is over; nobody's stage changes.
function startArena(winner) {
  arenaOn = true;
  const taken = { [FRIEND]: 0, [FOE]: 0 };
  for (let i = 0; i < swarm.n; i++) {
    const team = swarm.team[i];
    if (taken[team] >= ARENA_CROWD) continue;
    taken[team]++;
    swarm.setState(i, DRIVE);
    swarm.confine(i, arenaBox);
    swarm.crying[i] = team === winner ? 0 : 1;
  }
  swarm.onBail = null;
  swarm.onSpeed = null;
}

// Closing or reloading the page keeps the coins picked up since the last level change.
window.addEventListener('pagehide', () => {
  war.coins = coinCount();
  war.save();
});

function goToStage(stage) {
  war.coins = coinCount();
  war.save();
  switchLevel(stage === PENALTY ? 'penalty' : stage === JAIL ? 'jail' : LEVEL_ORDER[stage]);
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
PICKER.forEach((id, i) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = `${i + 1} ${LEVELS[id].name}`;
  if (id === LEVEL.id) btn.classList.add('active');
  btn.addEventListener('click', () => switchLevel(id));
  picker.appendChild(btn);
});
addEventListener('keydown', (e) => {
  const i = e.code.startsWith('Digit') ? Number(e.code.slice(5)) - 1 : -1;
  if (i >= 0 && i < PICKER.length && !chooser.open) switchLevel(PICKER[i]);
});

const hud = {
  speed: document.getElementById('speed'),
  gap: document.getElementById('gap'),
  state: document.getElementById('state'),
  energy: document.getElementById('energy'),
  hunger: document.getElementById('hunger'),
  hungerBar: document.getElementById('hunger').closest('.hunger'),
  fps: document.getElementById('fps'),
  kills: document.getElementById('kills'),
  caught: document.getElementById('caught'),
  allies: document.getElementById('allies'),
  spines: document.getElementById('spines'),
  coins: document.getElementById('coins'),
  nono: document.getElementById('nono'),
  coinCount: document.getElementById('coin-count'),
  clock: document.getElementById('clock'),
  clockFace: document.getElementById('clock-face').getContext('2d'),
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

// A crystal, glass panel or door broke. In the coin jail that joins two rooms (or a
// room and the open floor), and the riders boxed in them get the joined box.
function broke(spire, vel) {
  shatter?.burst(spire, vel);
  frostBurst(spire);
  if (!spire.door || !zones) return;
  zones.join(spire.door.rooms[0], spire.door.rooms[1]);
  crash(0.9 / (1 + Math.hypot(spire.x - camera.position.x, spire.z - camera.position.z) / 40));
  for (let i = 0; i < swarm.n; i++) {
    if (swarm.state[i] !== DRIVE) continue;
    const room = roomOf(war.swarmBase + i);
    if (zones.find(room) === zones.find(spire.door.rooms[0])) swarm.box[i] = zones.box(room);
  }
}

// Outside the coin jail. A creeper blows you back to the desert, a villager costs
// VILLAGER_FINE and a black spider SPIDER_FINE; coins add what they say.
const VILLAGER_FINE = 300;
const SPIDER_FINE = 200;
function boom(b) {
  for (let i = 0; i < 50; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 4 + Math.random() * 14;
    dust.emit(b.x, b.baseY + 1 + Math.random() * 2, b.z, Math.cos(a) * sp, 3 + Math.random() * 10, Math.sin(a) * sp, 2.5 + Math.random() * 3, 1.2 + Math.random() * 1.2);
  }
  crash(1 / (1 + Math.hypot(b.x - camera.position.x, b.z - camera.position.z) / 30));
}
function metOutside(b) {
  if (b.coin) {
    addCoins(b.coin);
    chime();
    return;
  }
  if (b.mob === 'creeper') {
    boom(b);
    if (leaving > 0) return;
    player.vel.y += 14;
    player.landImpact = 1;
    hud.burn.classList.remove('flash');
    void hud.burn.offsetWidth;
    hud.burn.classList.add('flash');
    showAlert('苦力怕爆炸！炸回第一關沙漠', 2, 'death');
    war.send(0, 0);
    leaving = 1.6;
    return;
  }
  const fine = b.mob === 'villager' ? VILLAGER_FINE : SPIDER_FINE;
  setCoins(coinCount() - fine);
  crash(0.5);
  player.landImpact = Math.max(player.landImpact, 0.6);
  showAlert(`撞到${b.mob === 'villager' ? '麥塊人' : '黑蜘蛛'}！罰 ${fine} 枚`, 1.6, 'warn');
}

// The other riders in the coin jail play by the same rules: now and then one rams a
// wall of the room it is in (WALL_EVERY seconds apart on average, each), and outside a
// creeper blows it back to the desert.
const WALL_EVERY = 30;
const ramAt = new THREE.Vector3();
const STILL = new THREE.Vector3();
let wallIn = 2;
function penaltyRiders(dt) {
  const boxed = [];
  for (let i = 0; i < swarm.n; i++) {
    if (swarm.state[i] !== DRIVE) continue;
    const x = swarm.x[i];
    const z = swarm.z[i];
    if (x < BUILDING.x0 || x > BUILDING.x1 || z < BUILDING.z0 || z > BUILDING.z1) {
      const b = terrain.breakAt(x, z, (r) => r.mob === 'creeper');
      if (b) {
        boom(b);
        war.send(war.swarmBase + i, 0);
      }
    } else {
      boxed.push(i);
    }
  }
  wallIn -= dt;
  if (wallIn > 0 || !boxed.length) return;
  wallIn = WALL_EVERY / boxed.length;
  const i = boxed[Math.floor(Math.random() * boxed.length)];
  // The middle of one of the four walls of the room the rider is in, a little off center.
  const cx = Math.round(swarm.x[i] / ROOM) * ROOM;
  const cz = Math.round(swarm.z[i] / ROOM) * ROOM;
  const side = Math.floor(Math.random() * 4);
  const along = (Math.random() * 2 - 1) * 40;
  const half = ROOM / 2;
  const wx = side === 0 ? cx + half : side === 1 ? cx - half : cx + along;
  const wz = side === 2 ? cz + half : side === 3 ? cz - half : cz + along;
  ramAt.set(wx, heightAt(wx, wz) + 1, wz);
  for (const spire of terrain.smash(ramAt, ramAt)) broke(spire, STILL);
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
// Grassland trees: with one dead ahead the screen blinks red under a huge black NO;
// hitting one flips the bike, the rider nearest you takes every coin you have, and you
// start over.
const TREES = LEVEL.id === 'grassland';
const TREE_WARN = 18; // metres ahead at a crawl; more at speed
const TREE_HIT = 1.45; // metres past a trunk's radius that count as hitting it
let flipped = false;
function treeAhead(colliders) {
  const f = player.forward;
  const reach = Math.max(TREE_WARN, player.speed * 1.6);
  for (const c of colliders) {
    if (!c.tree) continue;
    const dx = c.x - player.pos.x;
    const dz = c.z - player.pos.z;
    const ahead = dx * f.x + dz * f.z;
    if (ahead > 0 && ahead < reach && Math.abs(dx * f.z - dz * f.x) < c.r + 1.6) return true;
  }
  return false;
}
function treeHit(colliders) {
  return colliders.some((c) => c.tree && player.pos.y < c.top && Math.hypot(c.x - player.pos.x, c.z - player.pos.z) < c.r + TREE_HIT);
}
// The rider closest to you, of either team: { team } or null.
function riderBeside() {
  let best = null;
  for (const team of [FRIEND, FOE]) {
    for (const g of [swarm, rivals]) {
      const c = g.nearest(team, player.pos, 400, 0);
      if (c && (!best || c.d < best.d)) best = { ...c, team };
    }
  }
  return best;
}
function crashIntoTree() {
  const lost = coinCount();
  const by = riderBeside();
  const who = by ? `旁邊的${by.team === FRIEND ? '紅隊' : '藍隊'}車手` : '路過的車手';
  if (lost > 0) {
    setCoins(0);
    hud.coins.textContent = formatCoinCount();
  }
  flipped = true;
  const text = lost > 0 ? `撞到樹，翻車了！${formatCoinCount(lost)} 枚硬幣全被${who}拿走` : '撞到樹，翻車了！重新開始';
  die(text);
  showAlert(text, DEATH_TIME + 1.5, 'death result'); // the long line wraps
  crash(1);
}
const GRACE = 2.5; // seconds after a respawn before bombs count
let deadTimer = 0;
let grace = GRACE;
function inLava() {
  if (!LEVEL.lava || player.gap > 2.5 || bomber()) return false;
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
  bike.root.visible = flipped; // a flipped bike stays in sight, upside down
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
  if (LOCKED) return; // locked up already: a shot only shakes you
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

// A green cactus sticks a spine on the bike, costs CACTUS_HIT coins and withers; a yellow
// one, hit before by you or anyone else, gives nothing. The spine that fills the bike
// locks you in the jail, with every cactus green again. 仙人掌先生 is a cactus himself, so
// cacti leave him alone. The other riders count theirs in war.pricks: outside the coin
// jail a spine sends one back to the jail, and the one that fills it to the desert.
const SPINES_FULL = 30;
const CACTUS_HIT = 300;
function prickRider(id) {
  const full = ++war.pricks[id] >= SPINES_FULL;
  if (full) war.pricks[id] = 0;
  war.send(id, full ? 0 : JAIL);
}
bike.setSpines(war.spines.length);
hud.spines.textContent = war.spines.length;
hud.spines.parentElement.hidden = !LEVEL.cacti;
terrain.witherIds(war.spines);
function stickSpines(touching) {
  if (chooser.current.cactus) return;
  for (const c of touching) {
    if (c.withered || leaving > 0 || deadTimer > 0) continue;
    terrain.wither(c);
    war.spines.push(c.id);
    crash(0.2);
    setCoins(coinCount() - CACTUS_HIT);
    if (war.spines.length >= SPINES_FULL) {
      war.spines = [];
      terrain.reviveCacti();
      war.send(0, JAIL);
      showAlert(`車上插滿 ${SPINES_FULL} 根刺！關進監牢`, 2, 'death');
      leaving = 1.6;
    } else {
      showAlert(`撞到仙人掌！罰 ${CACTUS_HIT} 枚（${war.spines.length} / ${SPINES_FULL} 根刺）`, 1.5, 'warn');
    }
    bike.setSpines(war.spines.length);
    hud.spines.textContent = war.spines.length;
    war.save();
  }
}

function respawn() {
  player.reset();
  player.yaw = 0.9;
  player.landImpact = 0;
  bike.root.visible = true;
  flipped = false;
  chase.initialized = false;
  chase.heading = player.yaw;
  grace = GRACE;
  rivals.regroup();
}

const SLOW_MO = 0.25;

// L (pad Guide) pauses and resumes: the world stands still, the last frame stays up.
let paused = false;
const exitGate = coinExit ? new ExitGate(scene, coinExit, heightAt) : null;

// Every house (both the player's own house and scattered houses) can be entered day or
// night: driving through the front door teleports into a huge unique interior with
// corridors, beds along the way, and a kitchen with a cooking chef robot.
const HOUSE_AT = 50000;
const HOUSE_PAY = 30000;
const SLEEP_TIME = 10;
const BED_PARK_TIME = 2.0;
const HOUSE_AHEAD = 45;
const HOUSE_DROP = 600; // metres away before the player's house moves up ahead again
const HUNGER_DECAY = 1 / 210; // ~3.5 minutes from full red to empty
const STARVE_FINE = 300;
const HOUSE_KEY = 'desert-racing-house';
const house = new House(scene);
const interior = new InteriorWorld(scene);
const ghosts = new Ghosts(scene);
const home = { owned: false, slept: null, early: null };
try {
  Object.assign(home, JSON.parse(localStorage.getItem(HOUSE_KEY)) ?? {});
} catch {
  // no storage: start without a house
}
function saveHome() {
  try {
    localStorage.setItem(HOUSE_KEY, JSON.stringify(home));
  } catch {
    // the house lasts until the page reloads
  }
}
let sleeping = 0; // seconds left asleep; 0 awake
let indoors = false;
let hunger = 1; // 1 = full red (very full), 0 = hungry
let hungryNag = 0;
let lastMealTag = '';
const mealPeriod = (h) => (h >= 6 && h < 9 ? '早上' : h >= 11.5 && h < 14 ? '中午' : h >= 17.5 && h < 20.5 ? '晚上' : null);
let doorCooldown = 0;
let bedParkTimer = 0;
let activeBed = null;
let kitchenNoteTimer = 0;
let outdoorReturn = { x: 0, z: 0, yaw: 0 };
const bedLook = new THREE.Vector3();

// The rectangle the house has to stay in: the player's pen or room, or null.
function houseBounds() {
  const p = player.pos;
  if (IN_JAIL) {
    const b = penBounds(war.team[0], 9);
    return p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1 ? b : null;
  }
  if (IN_PENALTY && p.x > BUILDING.x0 && p.x < BUILDING.x1 && p.z > BUILDING.z0 && p.z < BUILDING.z1) {
    const cx = Math.round(p.x / ROOM) * ROOM;
    const cz = Math.round(p.z / ROOM) * ROOM;
    const h = ROOM / 2 - 9;
    return { x0: cx - h, x1: cx + h, z0: cz - h, z1: cz + h };
  }
  return null;
}
function placeHouse() {
  const b = houseBounds();
  const ahead = b ? 25 : HOUSE_AHEAD;
  let x = player.pos.x + player.forward.x * ahead;
  let z = player.pos.z + player.forward.z * ahead;
  if (b) {
    x = THREE.MathUtils.clamp(x, b.x0, b.x1);
    z = THREE.MathUtils.clamp(z, b.z0, b.z1);
  }
  // On the highest of its corners, so no sand shows through the floor; the plinth hides the gap on the low side.
  let y = terrain.floorAt(x, z);
  for (const [dx, dz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) y = Math.max(y, terrain.floorAt(x + dx, z + dz));
  house.place(x, Math.min(y, terrain.floorAt(x, z) + 1.5), z, player.pos.x, player.pos.z);
}

function enterHouse(seed, retX = player.pos.x, retZ = player.pos.z, retYaw = player.yaw) {
  indoors = true;
  sleeping = 0;
  bedParkTimer = 0;
  activeBed = null;
  kitchenNoteTimer = 0;
  outdoorReturn = { x: retX, z: retZ, yaw: retYaw };
  interior.build(seed);
  interior.setVisible(true);
  player.reset();
  player.pos.set(0, INTERIOR_Y + 0.9, 2);
  player.yaw = Math.PI; // face -Z into the mansion
  chase.initialized = false;
  chase.heading = player.yaw;
  showAlert('進來房子了！自己開進去探索房間吧', 2.4, 'warn');
}

function exitHouse() {
  indoors = false;
  sleeping = 0;
  bedParkTimer = 0;
  if (activeBed) activeBed.sleepSign.visible = false;
  activeBed = null;
  bike.root.visible = true;
  interior.setVisible(false);
  doorCooldown = 2.0;
  player.reset();
  player.pos.set(outdoorReturn.x, terrain.floorAt(outdoorReturn.x, outdoorReturn.z) + 1, outdoorReturn.z);
  player.yaw = outdoorReturn.yaw;
  chase.initialized = false;
  chase.heading = player.yaw;
}

function wakeUp() {
  sleeping = 0;
  bedParkTimer = 0;
  if (activeBed) activeBed.sleepSign.visible = false;
  activeBed = null;
  bike.root.visible = true;
  chase.initialized = false;
  chase.heading = player.yaw;
}

function houseStep(day, dt, time, dead) {
  doorCooldown = Math.max(doorCooldown - dt, 0);
  kitchenNoteTimer = Math.max(kitchenNoteTimer - dt, 0);

  if (indoors) {
    if (sleeping > 0) {
      bike.root.visible = false;
      if (activeBed) activeBed.sleepSign.visible = true;
      protect = Math.max(protect, 0.5);
      if (input.hit('KeyC')) {
        home.early = day.cycle;
        saveHome();
        wakeUp();
        showAlert('叭叭！被喇叭叫醒', 2, 'warn');
        return;
      }
      sleeping -= dt;
      if (sleeping <= 0) {
        skipToMorning();
        const paid = home.slept !== day.cycle;
        if (paid) {
          home.slept = day.cycle;
          saveHome();
          addCoins(HOUSE_PAY);
        }
        chime();
        wakeUp();
        showAlert(paid ? '天亮了！睡飽了，賺到 3 萬枚' : '天亮了！睡飽了', 2.5, 'warn');
      }
      return;
    }

    // Leave through the front exit portal.
    if (Math.hypot(player.pos.x - interior.exit.x, player.pos.z - interior.exit.z) < 2.8) {
      exitHouse();
      return;
    }

    // Eat in the kitchen with the chef robot.
    if (interior.kitchen && Math.hypot(player.pos.x - interior.kitchen.x, player.pos.z - interior.kitchen.z) < 6.5) {
      if (hunger < 0.99) {
        hunger = 1;
        chime();
        showAlert('吃到廚師機器人煮的飯了！好飽！', 2.6, 'warn');
      } else if (kitchenNoteTimer <= 0) {
        kitchenNoteTimer = 5;
        showAlert('這裡是廚房，現在已經很飽囉！', 2, 'warn');
      }
    }

    // Park near any bed along the route to sleep.
    const near = interior.nearestBed(player.pos);
    if (near && near.dist < 5.5 && player.speed < 4.5) {
      bedParkTimer += dt;
      if (bedParkTimer >= BED_PARK_TIME) {
        sleeping = SLEEP_TIME;
        activeBed = near.bed;
        bedParkTimer = 0;
        player.vel.set(0, 0, 0);
        showAlert('上床睡覺… 10 秒後天亮（按 C 喇叭可提早起床）', 3, 'warn');
      }
    } else {
      bedParkTimer = 0;
    }
    return;
  }

  if (!home.owned && coinCount() >= HOUSE_AT && deadTimer <= 0 && leaving <= 0) {
    home.owned = true;
    setCoins(coinCount() - HOUSE_AT);
    saveHome();
    placeHouse();
    chime();
    showAlert('花 5 萬蓋好自己的房子！隨時可以開進去', 2.5, 'warn');
  }
  const ghostTouch = ghosts.update(dt, time, day.night && !home.owned && !LOCKED, player.pos, (x, z) => terrain.floorAt(x, z));
  if (ghostTouch && deadTimer <= 0 && leaving <= 0) {
    player.vel.multiplyScalar(0.3);
    crash(0.4);
    showAlert('被幽靈嚇到了！快找房子躲進去', 1.8, 'warn');
  }
  house.showClock(home.early === day.cycle && day.night ? day.hour : null);

  if (home.owned && (!house.shown || house.distance(player.pos) > HOUSE_DROP)) placeHouse();

  if (doorCooldown > 0 || dead || leaving > 0) return;

  // Enter the player's own house through its front door.
  if (home.owned && house.shown) {
    const door = house.doorstep(4.5);
    if (Math.hypot(player.pos.x - door.x, player.pos.z - door.z) < 2.6) {
      const out = house.doorstep(7.5);
      enterHouse(101, out.x, out.z, out.yaw);
      return;
    }
  }

  // Enter any scattered house through its front door.
  for (const h of terrain.housesNear(player.pos.x, player.pos.z)) {
    const dx = Math.sin(h.yaw);
    const dz = Math.cos(h.yaw);
    if (Math.hypot(player.pos.x - (h.x + dx * 4.5), player.pos.z - (h.z + dz * 4.5)) < 2.6) {
      enterHouse(h.seed, h.x + dx * 7.5, h.z + dz * 7.5, h.yaw);
      return;
    }
  }
}

// 炸彈方塊人 walks through lava, sets 炸藥 crates down with L, and blows one up when
// any shot (or lava) reaches it: every rider within TNT_REACH pays the player TNT_FINE.
// Locked up, N blows himself up and out: from the coin jail to the jail, from the jail
// to the first level.
const TNT_FINE = 50000;
const tnt = new TntField(scene);
// 硬幣先生's own coins, falling over his head where nobody else sees them.
const privateRain = new PrivateRain(scene, (x, z) => terrain.floorAt(x, z));
const bomber = () => chooser.current.id === 'bomber';
function blowTnt(crate) {
  const { x, y, z } = crate.target;
  tnt.remove(crate);
  boom({ x, baseY: y, z });
  let caught = 0;
  const near = (rx, rz) => Math.hypot(rx - x, rz - z) < TNT_REACH;
  for (let i = 0; i < swarm.n; i++) if (swarm.state[i] === DRIVE && near(swarm.x[i], swarm.z[i])) caught++;
  rivals.list.forEach((r) => {
    if (r.active && near(r.body.pos.x, r.body.pos.z)) caught++;
  });
  if (caught) {
    addCoins(caught * TNT_FINE);
    chime();
  }
  showAlert(caught ? `炸藥爆炸！炸到 ${caught} 個人，每人罰 5 萬給你` : '炸藥爆炸！', 2, 'warn');
}
function tntStep() {
  if (!bomber()) return;
  if (input.hit('KeyL') && deadTimer <= 0 && !sleeping && leaving <= 0) {
    tnt.drop(player.pos.x, terrain.floorAt(player.pos.x, player.pos.z), player.pos.z);
  }
  if (LEVEL.lava) {
    for (const c of [...tnt.crates]) if (lavaAt(c.target.x, c.target.z) > 0.5) blowTnt(c);
  }
  if (LOCKED && input.hit('KeyN') && deadTimer <= 0 && !sleeping && leaving <= 0) {
    boom({ x: player.pos.x, baseY: player.pos.y, z: player.pos.z });
    player.vel.y += 14;
    war.send(0, IN_PENALTY ? JAIL : 0);
    showAlert(IN_PENALTY ? '自爆！炸回監牢' : '自爆！炸回第一關沙漠', 2, 'death');
    leaving = 1.6;
  }
}

// While the picker is open the world waits and the camera circles in front of the bike,
// framed to the right of the cards. Arrows or the pad step through riders, Enter or A
// confirms.
let pickSteer = 0;
function showRider(time) {
  if (input.hit('ArrowLeft') || input.hit('KeyA')) chooser.select(chooser.index - 1);
  if (input.hit('ArrowRight') || input.hit('KeyD')) chooser.select(chooser.index + 1);
  const steer = Math.sign(Math.round(input.pad.steer));
  if (steer && steer !== pickSteer) chooser.select(chooser.index - steer);
  pickSteer = steer;
  if (input.hit('Enter') || input.hit('Space')) chooser.confirm();

  // Turned toward the sun, so the rider's face is lit.
  const yaw = Math.atan2(SUN_DIR.x, SUN_DIR.z);
  bike.root.position.copy(player.pos);
  bike.root.rotation.set(0, yaw, 0);
  bike.update(0, time, { throttle: 0, boost: 0, speed: 0, lean: 0 });
  const a = yaw + 0.35 + Math.sin(time * 0.35) * 0.3;
  const p = player.pos;
  camera.position.set(p.x + Math.sin(a) * 7, p.y + 2.4, p.z + Math.cos(a) * 7);
  // Aim to the left of the bike as seen from the camera, so it sits right of the cards.
  const left = new THREE.Vector3(-Math.cos(a), 0, Math.sin(a));
  camera.lookAt(p.x + left.x * 2.4, p.y + 1.2, p.z + left.z * 2.4);
  sky.position.copy(camera.position);
  sun.position.copy(player.pos).addScaledVector(SUN_DIR, 120);
  sun.target.position.copy(player.pos);
  nightfall.reset();
  nightfall.apply(clock().dark);
  if (usePost) composer.render();
  else renderer.render(scene, camera);
}

function frame(timestamp) {
  timer.update(timestamp);
  input.poll();
  // P pauses; so does L, except for 炸彈方塊人, whose L sets down a crate.
  if (input.hit('KeyP') || (input.hit('KeyL') && !bomber())) {
    paused = !paused;
    if (paused) showAlert('暫停中 · 按 P 繼續', 1e9, 'warn');
    else hud.alert.className = 'alert';
  }
  if (paused) {
    timer.getDelta(); // drop the paused time
    input.endFrame();
    requestAnimationFrame(frame);
    return;
  }
  if (chooser.open) {
    showRider(timestamp / 1000);
    timer.getDelta();
    input.endFrame();
    requestAnimationFrame(frame);
    return;
  }
  // Holding V plays the world in slow motion; the bike still answers the controls.
  const dt = Math.min(timer.getDelta(), 1 / 20) * (input.down('KeyV') ? SLOW_MO : 1);
  const time = timer.getElapsed();

  if (input.hit('KeyC') && !sleeping) chase.cycle();
  // Backspace (pad Menu) resets, or starts a new war once one is won; R and T fire.
  // L3 / R3 step through the level picker.
  if (input.hit('PadLevelBack') || input.hit('PadLevelForward')) {
    const step = input.hit('PadLevelBack') ? -1 : 1;
    const at = Math.max(PICKER.indexOf(LEVEL.id), 0);
    switchLevel(PICKER[(at + step + PICKER.length) % PICKER.length]);
  }
  if (input.hit('Backspace') && deadTimer <= 0 && !shownWinner) {
    if (indoors) exitHouse();
    player.reset();
    rivals.regroup();
  }
  const dead = deadTimer > 0;
  if (dead) {
    deadTimer -= dt;
    if (deadTimer <= 0) respawn();
  }
  grace = Math.max(grace - dt, 0);

  const day = clock();
  if (!dead && !sleeping && leaving <= 0) {
    const meal = mealPeriod(day.hour);
    if (meal) {
      const tag = `${day.cycle}-${meal}`;
      if (lastMealTag !== tag) {
        lastMealTag = tag;
        if (hunger > 0.16) hunger = 0.16;
        hungryNag = 8;
        showAlert(`${meal}到了！肚子超餓，快進房子廚房吃東西`, 2.8, 'warn');
      }
    }
    hunger = Math.max(0, hunger - dt * (hunger <= 0.22 ? 1 / 70 : HUNGER_DECAY));
    if (hunger <= 0.22 && hunger > 0) {
      hungryNag -= dt;
      if (hungryNag <= 0) {
        hungryNag = 6;
        showAlert('快餓扁了！剩最後一點點，快進房子廚房吃東西！', 2.4, 'warn');
      }
    }
    if (hunger <= 0) {
      setCoins(coinCount() - STARVE_FINE);
      if (!IN_PENALTY && war.winner == null) {
        war.send(0, PENALTY);
        showAlert(`餓昏了！扣 ${STARVE_FINE} 枚，送進超大監牢！`, 2.2, 'death');
        leaving = 1.6;
      } else {
        showAlert(`餓昏了！扣 ${STARVE_FINE} 枚，快進房子廚房吃東西`, 2.2, 'death');
        hunger = 0.25;
      }
    }
  }

  prevPos.copy(player.pos);
  // Ice crystals in the bike's path this frame shatter instead of stopping it.
  smashAhead.copy(player.pos).addScaledVector(player.vel, dt);
  if (!indoors) {
    for (const spire of terrain.smash(player.pos, smashAhead)) {
      if (spire.mob || spire.coin) {
        metOutside(spire);
        continue;
      }
      broke(spire, player.vel);
      player.vel.multiplyScalar(0.88);
      player.landImpact = Math.max(player.landImpact, 0.8);
    }
  }
  if (!indoors && IN_PENALTY) penaltyRiders(dt);
  // two physics substeps for stable hovering at high speed
  // The hidden gate in the jail fence opens only for a rider rich enough to see the route.
  const seesRoute = coinCount() >= SEE_ROUTE;
  const colliders = indoors ? [] : terrain.collidersNear(player.pos.x, player.pos.z).filter((c) => !c.gate || !seesRoute);
  houseStep(day, dt, time, dead);
  if (!indoors) tntStep();
  if (!indoors && house.shown) colliders.push(house.collider);
  const floorFn = indoors ? () => INTERIOR_Y : (x, z, n) => terrain.floorAt(x, z, n);
  for (let i = 0; i < 2 && !dead && !sleeping; i++) {
    player.update(dt / 2, input, colliders, floorFn);
    if (indoors) interior.collide(player.pos, player.vel);
    if (i === 0) input.pressed.delete('Space');
  }
  // A hard hit into a solid is a crash.
  if (player.bump > 8) crash(0.3 + player.bump / 30);
  player.bump = 0;
  let gained = 0;
  if (indoors) {
    interior.update(time);
    if (TREES) hud.nono.classList.toggle('show', false);
  } else {
    rivals.update(dt, time, camera.position, !dead);
    if (!dead && inLava()) die('墜入熔岩');
    if (TREES) {
      if (!dead && treeHit(colliders)) crashIntoTree();
      hud.nono.classList.toggle('show', deadTimer <= 0 && treeAhead(colliders));
    }
    if (!dead && LEVEL.sea != null && terrain.hazardHit(player.pos)) die('碰到發光生物');
    if (LEVEL.cacti && !dead && war.winner == null) stickSpines(terrain.cactiTouching(prevPos, player.pos));
    terrain.update(player.pos);
    gained = terrain.collectCoins(prevPos, player.pos);
  }
  if (!IN_JAIL) gained += coinRain.update(dt, time, player, !dead);
  gained += privateRain.update(dt, time, player, !!chooser.current.coins && !dead && !sleeping);
  if (jailCoins) {
    const got = jailCoins.update(dt, time, player.pos);
    if (got.count) {
      addCoins(got.worth);
      bailPicked += got.count;
      chime();
      gained += got.count;
    }
    for (const c of swarm.extraCoins ?? []) c.update(dt, time, FAR_AWAY);
  }
  // Locked up, over 200 km/h is speeding, unless another bike just shoved you there.
  fineIn -= dt;
  player.shoved = Math.max((player.shoved ?? 0) - dt, 0);
  const over = LOCKED && player.speed > JAIL_TOP && player.shoved <= 0;
  if (over && !dead && leaving <= 0 && bailing <= 0 && war.winner == null && fineIn <= 0) {
    fineIn = FINE_GAP;
    // The fine comes off into debt if need be; in the jail you also go to the huge coin jail.
    setCoins(coinCount() - FINE);
    gained++;
    if (IN_JAIL) {
      war.send(0, PENALTY);
      showAlert(`超速！罰 ${formatCoinCount(FINE)} 枚，關進超大監牢`, 2, 'death');
      leaving = 1.6;
    } else {
      showAlert(`超速！罰 ${formatCoinCount(FINE)} 枚`, 2, 'warn');
    }
  }
  if (route && war.winner == null) {
    const r = route.update(time, player.pos, coinCount() >= SEE_ROUTE);
    if (r.coins) {
      addCoins(r.coins * ROUTE_COIN);
      chime();
      gained += r.coins;
    }
    if (r.finished) {
      // The finish settles the war: the team with more riders still free wins, if the
      // finisher holds WIN_COINS; otherwise it is a draw.
      const c = war.counts();
      const best = c[FRIEND].free >= c[FOE].free ? FRIEND : FOE;
      war.winner = coinCount() >= WIN_COINS ? best : DRAW;
      war.save();
      finishNote = '抵達終點！';
      if (war.winner !== DRAW) startArena(war.winner);
      else restartIn = 6;
    }
  }
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
  const armed = !dead && !sleeping && leaving <= 0 && (war.winner == null || arenaOn);
  const muzzleY = player.pos.y + 1.2;
  if (armed && (input.hit('KeyR') || input.hit('KeyB'))) weapons.fire(AIR, 0, FRIEND, player.pos.x, muzzleY, player.pos.z, player.yaw);
  if (armed && input.hit('KeyT') && gunIn <= 0) {
    weapons.fire(GUN, 0, FRIEND, player.pos.x, muzzleY, player.pos.z, player.yaw);
    gunIn = GUN_COOLDOWN;
  }
  // Riders that run into the player's back spikes.
  if (!LOCKED && !dead && !sleeping && war.winner == null) {
    const f = player.forward;
    for (let i = 0; i < swarm.n; i++) {
      if (swarm.state[i] === DRIVE && spiked(swarm.x[i], swarm.z[i], f)) prick(war.swarmBase + i);
    }
    rivals.list.forEach((r, i) => {
      if (r.active && spiked(r.body.pos.x, r.body.pos.z, f)) prick(war.rivalBase + i);
    });
  }
  if (chooser.current.cactus && !dead && !sleeping) {
    const f = player.forward;
    for (let i = 0; i < swarm.n; i++) {
      if (swarm.state[i] === DRIVE && (LOCKED || !spiked(swarm.x[i], swarm.z[i], f))) cactusBump(war.swarmBase + i, swarm.x[i], swarm.z[i], time);
    }
    rivals.list.forEach((r, i) => {
      if (r.active && (LOCKED || !spiked(r.body.pos.x, r.body.pos.z, f))) cactusBump(war.rivalBase + i, r.body.pos.x, r.body.pos.z, time);
    });
  }
  // The exit at the end of the big-coin trail takes the rider back a level.
  if (exitGate) {
    exitGate.update(time);
    if (armed && !LOCKED && leaving <= 0 && exitGate.reached(player.pos)) {
      war.stage[0] = STAGE - 1;
      showAlert(`出口！回到第 ${STAGE} 關 ${LEVELS[LEVEL_ORDER[STAGE - 1]].name}`, 2, 'warn');
      leaving = 1.2;
    }
  }
  // N: with a full 10,000 coins, spend them to move on to the next level yourself.
  if (armed && !LOCKED && input.hit('KeyN') && coinCount() >= SHIELD && STAGE < LEVEL_ORDER.length - 1) {
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
  tnt.targets(weapons.targets);
  if (LEVEL.cacti) {
    for (const t of weapons.targets) if (t !== playerTarget && terrain.witherAt(t.x, t.z) && IN_PENALTY) prickRider(t.id);
  }
  weapons.update(dt, camera.position, (t, kind, shooter) => {
    if (t.crate) {
      blowTnt(t.crate);
      return;
    }
    if (t.id === 0) {
      playerShot(kind);
      return;
    }
    if (shooter === 0) war.kills++;
    for (let n = 0; n < 14; n++) {
      const a = Math.random() * Math.PI * 2;
      dust.emit(t.x, t.y + 1, t.z, Math.cos(a) * 6, 2 + Math.random() * 5, Math.sin(a) * 6, 1.6 + Math.random() * 1.5, 1 + Math.random());
    }
    if (!LOCKED) war.hit(t.id); // locked up, a hit only knocks the dust off
    // A crying loser in the arena starts over somewhere else in it, still crying.
    if (arenaOn && t.group === 'swarm' && swarm.crying[t.index]) {
      swarm.confine(t.index, arenaBox);
      crash(0.6);
    }
  });
  war.update(dt, STAGE);
  if (LOCKED && war.winner == null && bailing <= 0 && leaving <= 0) {
    reticleTag.textContent = IN_JAIL ? `監牢 · 140,000 枚才看得到出口 · 超過 200 進超大監牢` : `回監牢 ${Math.min(bailPicked, BAIL)} / ${BAIL} · 超過 200 罰 100`;
    if (IN_PENALTY && bailPicked >= BAIL) {
      war.send(0, JAIL);
      showAlert(`撿到 ${BAIL} 枚硬幣！回到監牢`, 2, 'warn');
      bailing = 1.6;
    }
  }
  if (bailing > 0) {
    bailing -= dt;
    if (bailing <= 0) goToStage(war.stage[0]);
  }
  if (leaving > 0) {
    leaving -= dt;
    if (leaving <= 0) goToStage(war.stage[0]);
  }
  if (war.winner != null && !shownWinner) {
    shownWinner = true;
    const lose = war.winner === FRIEND ? '藍隊' : '紅隊';
    if (war.winner === DRAW) showAlert(`${finishNote}硬幣不到 ${formatCoinCount(WIN_COINS)}，平手！ 按 Enter（手把 Menu）重新開始`, 1e9, 'warn result');
    else showAlert(`${finishNote}${war.winner === FRIEND ? '紅隊' : '藍隊'}獲勝，${lose}輸了！ 按 Enter（手把 Menu）重新開始`, 1e9, war.winner === FRIEND ? 'warn result' : 'death result');
  }
  if (restartIn > 0) restartIn -= dt;
  // The arena: crying losers shed tears, and the nearest one sobs.
  if (arenaOn) {
    tearIn -= dt;
    sobIn -= dt;
    let nearest = Infinity;
    for (let i = 0; i < swarm.n; i++) {
      if (!swarm.crying[i] || swarm.state[i] !== DRIVE) continue;
      const d = Math.hypot(swarm.x[i] - camera.position.x, swarm.z[i] - camera.position.z);
      nearest = Math.min(nearest, d);
      if (tearIn <= 0 && d < 90) tears.cry(swarm.x[i], swarm.y[i] + 1.95, swarm.z[i], swarm.yaw[i]);
    }
    if (tearIn <= 0) tearIn = 0.12;
    if (sobIn <= 0 && nearest < 60) {
      sob(1 - nearest / 60);
      sobIn = 0.9 + Math.random() * 0.8;
    }
  }
  tears?.update(dt);
  // A draw starts over by itself; after a win the arena stays until Enter (pad Menu).
  if (shownWinner && (input.hit('Enter') || input.hit('Backspace') || (war.winner === DRAW && finishNote && restartIn <= 0))) {
    war.reset();
    setCoins(0);
    if (LEVEL.id === 'desert') location.reload();
    else switchLevel('desert');
  }

  // bike transform
  bike.root.position.copy(player.pos);
  bike.root.rotation.y = player.yaw;
  // Rolled over onto its back after a tree.
  bike.root.rotation.z = flipped ? Math.min(1, (DEATH_TIME - deadTimer) * 3) * Math.PI : 0;
  bike.tilt.rotation.set(player.pitch, 0, player.lean, 'YXZ');
  bike.tilt.position.y = -0.35 + Math.sin(time * 3.1) * 0.05 * (1 - Math.min(player.speed / 30, 1));
  bike.update(dt, time, { throttle: player.throttle, boost: player.boost, speed: player.speed, lean: player.lean });
  bike.root.updateMatrixWorld(true);

  chase.update(dt, player, time, { x: input.pad.lookX, y: input.pad.lookY }, indoors ? () => INTERIOR_Y : (x, z) => terrain.floorAt(x, z));
  // Asleep, the camera is inside, looking over the bed at the sign.
  if (sleeping && activeBed) {
    interior.bedroomView(activeBed, camera.position, bedLook);
    camera.lookAt(bedLook);
  }

  bike.tipWorldPositions(tips);
  trails.forEach((t, i) => t.update(tips[i], camera.position, 0.25 + player.throttle * 0.5 + player.boost * 0.6));
  emitDust(dt);
  dust.update(dt, indoors ? () => INTERIOR_Y : heightAt);
  shatter?.update(dt);
  finder?.update(dt, time, player, !dead && !indoors);
  coinFinder.update(time, player, !dead && !LOCKED && !indoors);
  teamFinder.update(time, player, !dead && !IN_JAIL && !indoors);
  speedLines.update(dt, player.pos, player.yaw, player.speed);

  if (!indoors) {
    grass?.update(player.pos, camera.position, time);
    backdrop?.update(player.pos);
    for (const w of weather) {
      w.points.visible = true;
      w.update(time, camera.position);
    }
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
    fish?.update(dt, time, player.pos, player.yaw);
  } else {
    for (const w of weather) w.points.visible = false;
  }
  if (alertTimer > 0) {
    alertTimer -= dt;
    if (alertTimer <= 0) hud.alert.classList.remove('show');
  }
  groundUniforms.uTime.value = time;
  swellUniforms.uTime.value = time;

  nightfall.reset();
  if (indoors) {
    sky.visible = false;
    if (sea) sea.mesh.visible = false;
    scene.fog.near = 60;
    scene.fog.far = 220;
    scene.fog.color.setHex(0x282018);
    renderer.toneMappingExposure = 1.05;
  } else {
    sky.visible = true;
    if (sea) sea.mesh.visible = true;
    sea?.update(time, camera);
    nightfall.apply(day.dark);
  }
  house.update(day.dark);
  setWindowGlow(day.dark);
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
    const m = Math.floor(day.left / 60);
    const sec = String(Math.floor(day.left % 60)).padStart(2, '0');
    drawClock(hud.clockFace, day.hour);
    const hh = Math.floor(day.hour);
    const mm = String(Math.floor((day.hour % 1) * 60)).padStart(2, '0');
    hud.clock.textContent = `${day.night ? '🌙 晚上' : '☀️ 白天'} ${hh}:${mm} · ${m}:${sec} 後${day.night ? '天亮' : '天黑'}`;
    hud.energy.style.transform = `scaleX(${player.energy.toFixed(3)})`;
    hud.hunger.style.transform = `scaleX(${hunger.toFixed(3)})`;
    hud.hungerBar.classList.toggle('low', hunger <= 0.22);
  }
  if (fpsAcc > 1) {
    // 擊破: foes you shot; 捕獲: foes in jail; 夥伴: friends still free.
    const c = war.counts();
    hud.kills.textContent = war.kills;
    hud.spines.textContent = war.spines.length;
    hud.caught.textContent = c[FOE].jailed;
    hud.allies.textContent = c[FRIEND].free;
    hud.coins.textContent = formatCoinCount();
    hud.fps.textContent = `${Math.round(fpsFrames / fpsAcc)} fps · ${chase.modeName}`;
    fpsAcc = 0;
    fpsFrames = 0;
  }
  requestAnimationFrame(frame);
}

window.__game = {
  player, bike, house, interior, ghosts, setCoins, coinCount,
  getHunger: () => hunger,
  setHunger: (v) => { hunger = THREE.MathUtils.clamp(v, 0, 1); },
  isIndoors: () => indoors,
  enterHouse, exitHouse,
  terrain, chase, camera, renderer, input, eruption, rivals, coinRain, swarm, war, weapons, route, jailCoins,
};
requestAnimationFrame(frame);
