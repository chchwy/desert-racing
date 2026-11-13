import * as THREE from 'three';
import { SEAT, ball, buildAnimalRider, cone, limb } from './animals.js';

// The riders the player picks from at the start. Kept apart from SPECIES, whose fur
// colors also paint the swarm.

const SPECIES = {
  dog: { fur: 0xb5793f, belly: 0xf3e2c8, ears: 'flop', inner: 0x8a5528, tail: 'long', snout: 1.25, nose: 0x1d1512 },
  bear: { fur: 0x7a5034, belly: 0xb88a63, ears: 'round', inner: 0xb88a63, tail: 'puff', snout: 1, head: 1.12, nose: 0x1d1512 },
  panda: { fur: 0xf7f7f4, belly: 0xf7f7f4, limbs: 0x1f1f22, ears: 'round', ear: 0x1f1f22, inner: 0x1f1f22, tail: 'puff', snout: 0.9, head: 1.15, nose: 0x1f1f22, patches: 0x1f1f22 },
  antelope: { fur: 0xc98d4e, belly: 0xf6eee2, ears: 'tall', inner: 0xf6eee2, tail: 'puff', snout: 1.5, nose: 0x231a17, horns: 0x3a2e24 },
  whiteCat: { fur: 0xf6f4f0, belly: 0xffffff, ears: 'pointy', inner: 0xf2a9b9, tail: 'long', snout: 0.5, nose: 0xe88a9c },
  blackCat: { fur: 0x26262b, belly: 0x34343a, ears: 'pointy', inner: 0x6a4a52, tail: 'long', snout: 0.5, nose: 0x6a4a52 },
  frog: { fur: 0x5cae46, belly: 0xd8ec9e, ears: 'none', tail: 'none', snout: 0.3, head: 1.05, flat: true, nose: 0x5cae46, topEyes: true },
};

const GOLD = 0xf0b429;
const Y = new THREE.Vector3(0, 1, 0);
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

const RIB = 0x2f7d36;
const DRY = 0xc9a94a;
const DRY_RIB = 0xa8883a;
const DRY_TIME = 30;

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
    ball(head, RIB, [Math.sin(a) * 0.235, 0.72, 0.04 + Math.cos(a) * 0.235], [0.04, 0.42, 0.04]);
  }
  // Spines all the way round, front, back and sides, leaving the face clear.
  const rng = (i) => Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
  const spine = (x, y, z, out) => {
    const m = cone(head, 0xfff6d8, [x, y, z], 0.012, 0.1);
    m.quaternion.setFromUnitVectors(Y, out);
  };
  for (let i = 0; i < 110; i++) {
    const a = rng(i) * Math.PI * 2;
    const y = 0.3 + rng(i + 100) * 0.95;
    if (Math.cos(a) > 0.6 && y > 0.75 && y < 1.15) continue;
    const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    spine(out.x * 0.27, y, 0.04 + out.z * 0.27, out);
  }
  face(head, 0.3, 0.98, 0.3);
  // Cactus arms: out to the side, then up, spined too.
  for (const sx of [-1, 1]) {
    limb(head, green, [sx * 0.2, 0.62, 0.08], [sx * 0.46, 0.62, 0.12], 0.09);
    limb(head, green, [sx * 0.46, 0.62, 0.12], [sx * 0.48, 0.95, 0.14], 0.09);
    for (let k = 0; k < 14; k++) {
      const a = rng(k + sx * 50 + 300) * Math.PI * 2;
      const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      spine(sx * 0.47 + out.x * 0.1, 0.6 + (k / 14) * 0.4, 0.13 + out.z * 0.1, out);
    }
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    ball(head, 0xff6f9a, [Math.sin(a) * 0.08, 1.5, 0.08 + Math.cos(a) * 0.08], [0.07, 0.03, 0.07]);
  }
  ball(head, 0xffd84a, [0, 1.52, 0.08], 0.045);

  // A bump dries the green parts yellow; they green again over DRY_TIME seconds.
  const greens = [];
  head.traverse((o) => {
    if (!o.isMesh) return;
    const hex = o.material.color.getHex();
    if (hex !== green && hex !== RIB) return;
    o.material = o.material.clone();
    greens.push({ color: o.material.color, from: new THREE.Color(hex), to: new THREE.Color(hex === green ? DRY : DRY_RIB) });
  });
  let dry = 0;
  let last = null;
  rider.userData.hit = () => {
    dry = 1;
  };

  const seed = Math.random() * 10;
  rider.userData.animate = (time, s) => {
    const stream = THREE.MathUtils.clamp(s.speed / 48, 0, 1);
    head.rotation.set(0.05 + stream * 0.25, Math.sin(time * 0.8 + seed) * 0.1 * (1 - stream), -s.lean * 0.3);
    if (last !== null) dry = Math.max(dry - (time - last) / DRY_TIME, 0);
    last = time;
    for (const g of greens) g.color.lerpColors(g.from, g.to, Math.min(dry * 1.5, 1));
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

const HORSES = {
  horse: { coat: 0x8b5a33, muzzle: 0x5e3b22, mane: 0x2b1d14, hoof: 0x2a221c },
  zebra: { coat: 0xf2f1ec, muzzle: 0x26262a, mane: 0x1c1c20, hoof: 0x1c1c20, stripes: 0x1c1c20 },
};


// A hoof: a short dark cylinder on the end of a leg, pointing along the leg.
function hoof(parent, color, at, toward) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.1, 14), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
  m.position.set(...at);
  m.quaternion.setFromUnitVectors(Y, new THREE.Vector3(...toward).sub(new THREE.Vector3(...at)).normalize());
  m.castShadow = true;
  parent.add(m);
}

// Thin dark bands around a segment, for the zebra.
function bands(parent, color, a, b, r, n) {
  const va = new THREE.Vector3(...a);
  const d = new THREE.Vector3(...b).sub(va);
  const q = new THREE.Quaternion().setFromUnitVectors(Y, d.clone().normalize());
  for (let i = 1; i <= n; i++) {
    const p = va.clone().addScaledVector(d, i / (n + 1));
    const m = ball(parent, color, p.toArray(), [r * 1.06, 0.022, r * 1.06]);
    m.quaternion.copy(q);
  }
}

// Horse and zebra: an arched neck carrying a long face that hangs nose-down, eyes on
// the sides, a mane down the neck, and legs that taper into hooves.
function buildHorse(spec) {
  return (parent) => {
    const rider = new THREE.Group();
    rider.position.copy(SEAT);
    parent.add(rider);
    const { coat, mane, stripes } = spec;
    const body = new THREE.Group();
    rider.add(body);

    limb(body, coat, [0, 0.22, -0.12], [0, 0.62, 0.16], 0.26);
    limb(body, coat, [0, 0.58, 0.14], [0, 0.86, 0.26], 0.16);
    limb(body, coat, [0, 0.84, 0.25], [0, 1.08, 0.33], 0.125);
    if (stripes) {
      bands(body, stripes, [0, 0.22, -0.12], [0, 0.62, 0.16], 0.26, 4);
      bands(body, stripes, [0, 0.58, 0.14], [0, 1.08, 0.33], 0.15, 4);
    }
    for (let k = 0; k < 8; k++) {
      const t = k / 7;
      ball(body, mane, [0, 1.2 - t * 0.55, 0.26 - t * 0.28], [0.045, 0.1, 0.09]);
    }

    // Forelegs reach for the front of the hull; hind legs fold forward.
    for (const sx of [-1, 1]) {
      limb(body, coat, [sx * 0.2, 0.6, 0.18], [sx * 0.27, 0.5, 0.52], 0.075);
      limb(body, coat, [sx * 0.27, 0.5, 0.52], [sx * 0.3, 0.43, 0.78], 0.052);
      hoof(body, spec.hoof, [sx * 0.305, 0.425, 0.82], [sx * 0.31, 0.42, 0.9]);
      limb(rider, coat, [sx * 0.16, 0.2, -0.02], [sx * 0.3, 0.24, 0.4], 0.12);
      limb(rider, coat, [sx * 0.3, 0.24, 0.4], [sx * 0.35, -0.1, 0.46], 0.055);
      hoof(rider, spec.hoof, [sx * 0.355, -0.15, 0.465], [sx * 0.36, -0.3, 0.47]);
      if (stripes) {
        bands(body, stripes, [sx * 0.2, 0.6, 0.18], [sx * 0.3, 0.43, 0.78], 0.06, 4);
        bands(rider, stripes, [sx * 0.3, 0.24, 0.4], [sx * 0.35, -0.1, 0.46], 0.055, 3);
      }
    }

    // The head hangs nose-down from the top of the neck.
    const head = new THREE.Group();
    head.position.set(0, 1.12, 0.36);
    head.rotation.x = 0.75;
    rider.add(head);
    ball(head, coat, [0, 0, 0], [0.14, 0.15, 0.18]);
    limb(head, coat, [0, -0.01, 0.06], [0, -0.03, 0.34], 0.1);
    ball(head, spec.muzzle, [0, -0.04, 0.4], [0.1, 0.095, 0.1]);
    for (const sx of [-1, 1]) {
      ball(head, 0x0e0a08, [sx * 0.045, -0.02, 0.49], [0.022, 0.03, 0.012]);
      ball(head, 0x120c0a, [sx * 0.128, 0.04, 0.05], 0.034);
      ball(head, 0xffffff, [sx * 0.15, 0.055, 0.07], 0.009);
      cone(head, coat, [sx * 0.07, 0.17, -0.06], 0.04, 0.15, [-0.5, 0, -sx * 0.25]);
    }
    ball(head, mane, [0, 0.13, 0.04], [0.06, 0.05, 0.08]);
    if (stripes) {
      for (const z of [0.12, 0.2, 0.28]) ball(head, stripes, [0, 0.03 - z * 0.08, z], [0.103, 0.02, 0.03]);
      for (const sx of [-1, 1]) ball(head, stripes, [sx * 0.1, 0.06, -0.06], [0.06, 0.018, 0.1]);
    }

    // A hair tail in three strands.
    const tail = new THREE.Group();
    tail.position.set(0, 0.28, -0.38);
    rider.add(tail);
    for (const sx of [-1, 0, 1]) limb(tail, mane, [0, 0, 0], [sx * 0.06, -0.32, -0.42], 0.055);

    const seed = Math.random() * 10;
    rider.userData.animate = (time, s) => {
      const stream = THREE.MathUtils.clamp(s.speed / 48, 0, 1);
      body.rotation.x = 0.06 + stream * 0.12;
      head.position.y = 1.12 - stream * 0.06 + Math.sin(time * 2.4 + seed) * 0.012;
      head.rotation.set(0.75 + stream * 0.25, Math.sin(time * 0.7 + seed) * 0.15 * (1 - stream), -s.lean * 0.3);
      tail.rotation.set(-stream * 0.9, Math.sin(time * (3 + stream * 9) + seed) * 0.3, 0);
    };
    return rider;
  };
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
].map((r) => ({ ...r, build: r.build ?? (HORSES[r.id] ? buildHorse(HORSES[r.id]) : buildAnimalRider(SPECIES[r.id])) }));
