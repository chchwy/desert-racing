import * as THREE from 'three';
import { SEAT, ball, buildAnimalRider, cone, limb } from './animals.js';

// The riders the player picks from at the start. Kept apart from SPECIES, whose fur
// colors also paint the swarm.

const SPECIES = {
  dog: { fur: 0xb5793f, belly: 0xf3e2c8, ears: 'flop', inner: 0x8a5528, tail: 'long', snout: 1.25, nose: 0x1d1512 },
  bear: { fur: 0x7a5034, belly: 0xb88a63, ears: 'round', inner: 0xb88a63, tail: 'puff', snout: 1, head: 1.12, nose: 0x1d1512 },
  panda: { fur: 0xf7f7f4, belly: 0xf7f7f4, limbs: 0x1f1f22, ears: 'round', ear: 0x1f1f22, inner: 0x1f1f22, tail: 'puff', snout: 0.9, head: 1.15, nose: 0x1f1f22, patches: 0x1f1f22 },
  horse: { fur: 0x8b5a33, belly: 0xa77349, muzzle: 0x6e4527, ears: 'pointy', inner: 0x5b3a22, tail: 'hair', mane: 0x2b1d14, long: true, nose: 0x2b1d14 },
  zebra: { fur: 0xf4f3ee, belly: 0xf4f3ee, muzzle: 0x2a2a2e, ears: 'pointy', inner: 0x2a2a2e, tail: 'hair', mane: 0x1c1c20, long: true, nose: 0x111114, stripes: 0x1c1c20, headStripes: true },
  antelope: { fur: 0xc98d4e, belly: 0xf6eee2, ears: 'tall', inner: 0xf6eee2, tail: 'puff', snout: 1.5, nose: 0x231a17, horns: 0x3a2e24 },
  whiteCat: { fur: 0xf6f4f0, belly: 0xffffff, ears: 'pointy', inner: 0xf2a9b9, tail: 'long', snout: 0.5, nose: 0xe88a9c },
  blackCat: { fur: 0x26262b, belly: 0x34343a, ears: 'pointy', inner: 0x6a4a52, tail: 'long', snout: 0.5, nose: 0x6a4a52 },
  frog: { fur: 0x5cae46, belly: 0xd8ec9e, ears: 'none', tail: 'none', snout: 0.3, head: 1.05, flat: true, nose: 0x5cae46, topEyes: true },
};

const GOLD = 0xf0b429;
const HAT = 0x1d1b22;

function face(parent, z, y, r) {
  for (const sx of [-1, 1]) {
    ball(parent, 0xffffff, [sx * r * 0.35, y, z], r * 0.2);
    ball(parent, 0x111114, [sx * r * 0.35, y + 0.005, z + r * 0.15], r * 0.11);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(r * 0.25, r * 0.04, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0x3a1a14 }));
  smile.position.set(0, y - r * 0.3, z);
  smile.rotation.z = Math.PI;
  parent.add(smile);
}

function topHat(parent, y) {
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 20), new THREE.MeshStandardMaterial({ color: HAT, roughness: 0.6 }));
  brim.position.y = y;
  brim.castShadow = true;
  parent.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.28, 20), brim.material);
  crown.position.y = y + 0.15;
  crown.castShadow = true;
  parent.add(crown);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.152, 0.05, 20), new THREE.MeshStandardMaterial({ color: 0xc8303a }));
  band.position.y = y + 0.05;
  parent.add(band);
}

// Arms reach for the front of the hull, legs fold forward, like the animals.
function armsAndLegs(rider, body, arm, leg, from) {
  for (const sx of [-1, 1]) {
    limb(body, arm, [sx * from, 0.64, 0.2], [sx * 0.3, 0.42, 0.82], 0.07);
    ball(body, arm, [sx * 0.3, 0.41, 0.86], 0.09);
    limb(rider, leg, [sx * 0.16, 0.18, -0.02], [sx * 0.3, 0.22, 0.4], 0.1);
    limb(rider, leg, [sx * 0.3, 0.22, 0.4], [sx * 0.38, -0.15, 0.46], 0.08);
    ball(rider, leg, [sx * 0.38, -0.2, 0.52], [0.1, 0.07, 0.14]);
  }
}

function bobbing(rider, body, head) {
  const seed = Math.random() * 10;
  rider.userData.animate = (time, s) => {
    const stream = THREE.MathUtils.clamp(s.speed / 48, 0, 1);
    body.rotation.x = 0.06 + stream * 0.14;
    head.rotation.set(stream * 0.08, Math.sin(time * 0.7 + seed) * 0.12 * (1 - stream), -s.lean * 0.3);
    head.position.y = head.userData.y + Math.sin(time * 2.4 + seed) * 0.015;
  };
}

// 仙人掌先生: a green column in a clay pot, ribbed and spined, with a flower on top.
function buildCactusMister(parent) {
  const rider = new THREE.Group();
  rider.position.copy(SEAT);
  parent.add(rider);
  const body = new THREE.Group();
  rider.add(body);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.3, 20), new THREE.MeshStandardMaterial({ color: 0xc0643c, roughness: 0.9 }));
  pot.position.y = 0.15;
  pot.castShadow = true;
  body.add(pot);

  const head = new THREE.Group();
  head.userData.y = 0;
  body.add(head);
  const green = 0x3f9a45;
  limb(head, green, [0, 0.2, 0], [0, 1.25, 0.08], 0.26);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    ball(head, 0x2f7d36, [Math.sin(a) * 0.235, 0.72, 0.04 + Math.cos(a) * 0.235], [0.04, 0.42, 0.04]);
  }
  const rng = (i) => Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
  for (let i = 0; i < 40; i++) {
    const a = rng(i) * Math.PI * 2;
    const y = 0.35 + rng(i + 100) * 0.85;
    const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const p = out.clone().multiplyScalar(0.27);
    const m = cone(head, 0xfff6d8, [p.x, y, p.z + 0.04], 0.012, 0.09);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), out);
  }
  face(head, 0.3, 0.98, 0.3);
  // Cactus arms: out to the side, then up.
  for (const sx of [-1, 1]) {
    limb(head, green, [sx * 0.2, 0.62, 0.08], [sx * 0.46, 0.62, 0.12], 0.09);
    limb(head, green, [sx * 0.46, 0.62, 0.12], [sx * 0.48, 0.95, 0.14], 0.09);
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    ball(head, 0xff6f9a, [Math.sin(a) * 0.08, 1.5, 0.08 + Math.cos(a) * 0.08], [0.07, 0.03, 0.07]);
  }
  ball(head, 0xffd84a, [0, 1.52, 0.08], 0.045);

  const seed = Math.random() * 10;
  rider.userData.animate = (time, s) => {
    const stream = THREE.MathUtils.clamp(s.speed / 48, 0, 1);
    head.rotation.set(0.05 + stream * 0.25, Math.sin(time * 0.8 + seed) * 0.1 * (1 - stream), -s.lean * 0.3);
  };
  return rider;
}

// 硬幣先生: a big gold coin standing on the seat, face forward, in a top hat.
function buildCoinMister(parent) {
  const rider = new THREE.Group();
  rider.position.copy(SEAT);
  parent.add(rider);
  const body = new THREE.Group();
  rider.add(body);
  const head = new THREE.Group();
  head.position.y = 0.82;
  head.userData.y = 0.82;
  rider.add(head);

  const gold = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.6, roughness: 0.35, emissive: 0x6a4300, emissiveIntensity: 0.4 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.14, 40), gold);
  disc.rotation.x = Math.PI / 2;
  disc.castShadow = true;
  head.add(disc);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.035, 8, 40), new THREE.MeshStandardMaterial({ color: 0xffd76a, metalness: 0.6, roughness: 0.3 }));
  rim.position.z = 0.075;
  head.add(rim);
  face(head, 0.08, 0.06, 0.5);
  topHat(head, 0.5);

  armsAndLegs(rider, body, GOLD, 0x7a5a20, 0.3);
  bobbing(rider, body, head);
  return rider;
}

export const ROSTER = [
  { id: 'cactus', name: '仙人掌先生', icon: '🌵', build: buildCactusMister },
  { id: 'coin', name: '硬幣先生', icon: '🪙', build: buildCoinMister },
  { id: 'dog', name: '狗', icon: '🐶' },
  { id: 'bear', name: '熊', icon: '🐻' },
  { id: 'panda', name: '熊貓', icon: '🐼' },
  { id: 'horse', name: '馬', icon: '🐴' },
  { id: 'zebra', name: '斑馬', icon: '🦓' },
  { id: 'antelope', name: '羚羊', icon: '🦌' },
  { id: 'whiteCat', name: '白貓', icon: '🐱' },
  { id: 'blackCat', name: '黑貓', icon: '🐈‍⬛' },
  { id: 'frog', name: '青蛙', icon: '🐸' },
].map((r) => ({ ...r, build: r.build ?? buildAnimalRider(SPECIES[r.id]) }));
