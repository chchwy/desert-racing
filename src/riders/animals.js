import * as THREE from 'three';

// Rival riders built from primitives: a hunched body on the seat, a head with a snout
// or beak, ears, arms reaching to the hull, knees tucked forward, and a tail.
// Same frame as the bike: +Z forward, +Y up, +X to the rider's left.

export const SEAT = new THREE.Vector3(0, 0.98, -0.25);
const UP = new THREE.Vector3(0, 1, 0);

const mats = new Map();
function mat(color) {
  let m = mats.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    mats.set(color, m);
  }
  return m;
}

const sphereGeo = new THREE.SphereGeometry(1, 20, 14);
const coneGeo = new THREE.ConeGeometry(1, 1, 14);
const capsuleGeos = new Map();
function capsuleGeo(len) {
  const k = Math.round(len * 50) / 50;
  let g = capsuleGeos.get(k);
  if (!g) {
    g = new THREE.CapsuleGeometry(1, k, 6, 14);
    capsuleGeos.set(k, g);
  }
  return g;
}

export function ball(parent, color, p, s) {
  const m = new THREE.Mesh(sphereGeo, mat(color));
  m.position.set(...p);
  m.scale.set(...(Array.isArray(s) ? s : [s, s, s]));
  m.castShadow = true;
  parent.add(m);
  return m;
}

// A capsule of radius r whose caps end at a and b. The geometry is unit radius, so the
// straight part is divided by r and the whole mesh scaled back by r.
export function limb(parent, color, a, b, r) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const d = vb.clone().sub(va);
  const len = d.length();
  const m = new THREE.Mesh(capsuleGeo(Math.max(len - 2 * r, 0.02) / r), mat(color));
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  m.scale.setScalar(r);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export function cone(parent, color, p, r, h, rot = [0, 0, 0]) {
  const m = new THREE.Mesh(coneGeo, mat(color));
  m.position.set(...p);
  m.scale.set(r, h, r);
  m.rotation.set(...rot);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// fur, belly, limbs, ear inner, nose; ears, tail, snout length, head scale, extras.
export const SPECIES = {
  shiba: { name: '柴犬', fur: 0xd9893f, belly: 0xf6ead8, ears: 'pointy', inner: 0xf6ead8, tail: 'curl', snout: 1.1, nose: 0x231a17 },
  fox: { name: '狐狸', fur: 0xe0702a, belly: 0xfaf3ea, limbs: 0x3a2a24, ears: 'tall', inner: 0x3a2a24, tail: 'bushy', tip: 0xfaf3ea, snout: 1.35, nose: 0x161210 },
  arcticFox: { name: '北極狐', fur: 0xf3f4f6, belly: 0xffffff, ears: 'tall', inner: 0xc9cdd6, tail: 'bushy', tip: 0xffffff, snout: 1.3, nose: 0x161210 },
  rabbit: { name: '兔子', fur: 0xf2efe9, belly: 0xffffff, ears: 'long', inner: 0xf0a8b8, tail: 'puff', snout: 0.7, nose: 0xe57b93 },
  bear: { name: '熊', fur: 0x7a5034, belly: 0xb88a63, ears: 'round', inner: 0xb88a63, tail: 'puff', snout: 1, head: 1.12, nose: 0x1d1512 },
  polarBear: { name: '北極熊', fur: 0xf4f1e8, belly: 0xffffff, ears: 'round', inner: 0xe6e0d0, tail: 'puff', snout: 1.1, head: 1.12, nose: 0x1d1512 },
  panda: { name: '熊貓', fur: 0xf7f7f4, belly: 0xf7f7f4, limbs: 0x1f1f22, ears: 'round', ear: 0x1f1f22, inner: 0x1f1f22, tail: 'puff', snout: 0.9, head: 1.15, nose: 0x1f1f22, patches: 0x1f1f22 },
  tiger: { name: '老虎', fur: 0xec8a2a, belly: 0xfbf2e4, ears: 'round', inner: 0xfbf2e4, tail: 'long', snout: 1, head: 1.05, nose: 0xd9786b, stripes: 0x221a16 },
  pig: { name: '小豬', fur: 0xf3b3bf, belly: 0xf8cdd5, ears: 'flop', inner: 0xe8919f, tail: 'curl', snout: 0.55, disc: 0xe8919f, nose: 0xb35e6d },
  koala: { name: '無尾熊', fur: 0x9da2a8, belly: 0xe7e6e2, ears: 'big', inner: 0xf2f0ec, tail: 'none', snout: 0.5, head: 1.1, nose: 0x2a2a2e, bigNose: true },
  frog: { name: '青蛙', fur: 0x5cae46, belly: 0xd8ec9e, ears: 'none', tail: 'none', snout: 0.3, head: 1.05, flat: true, nose: 0x5cae46, topEyes: true },
  penguin: { name: '企鵝', fur: 0x23262e, belly: 0xf6f6f2, ears: 'none', tail: 'none', snout: 0, beak: 0xf2a024, nose: 0xf2a024 },
  otter: { name: '水獺', fur: 0x6b4a32, belly: 0xc9a786, ears: 'small', inner: 0x4d3423, tail: 'long', snout: 0.8, nose: 0x1d1512 },
};

export function buildAnimalRider(spec) {
  return (parent) => {
    const rider = new THREE.Group();
    rider.position.copy(SEAT);
    parent.add(rider);
    const fur = spec.fur;
    const limbs = spec.limbs ?? fur;

    // Body, hunched forward over the hull.
    const body = new THREE.Group();
    rider.add(body);
    limb(body, fur, [0, 0.22, -0.12], [0, 0.66, 0.2], 0.27);
    ball(body, spec.belly, [0, 0.42, 0.14], [0.22, 0.26, 0.16]);
    if (spec.stripes) {
      for (const y of [0.32, 0.48, 0.62]) ball(body, spec.stripes, [0, y, 0.02 + y * 0.35 - 0.12], [0.285, spec.headStripes ? 0.05 : 0.035, 0.24]);
    }

    // Arms out to the front of the hull, legs folded forward.
    for (const sx of [-1, 1]) {
      limb(body, limbs, [sx * 0.22, 0.64, 0.24], [sx * 0.3, 0.42, 0.82], 0.075);
      ball(body, limbs, [sx * 0.3, 0.41, 0.86], 0.09);
      limb(rider, limbs, [sx * 0.16, 0.18, -0.02], [sx * 0.3, 0.22, 0.4], 0.11);
      limb(rider, limbs, [sx * 0.3, 0.22, 0.4], [sx * 0.38, -0.15, 0.46], 0.085);
      ball(rider, limbs, [sx * 0.38, -0.2, 0.52], [0.1, 0.07, 0.14]);
    }

    // Head.
    const head = new THREE.Group();
    head.position.set(0, 0.94, 0.4);
    rider.add(head);
    const hs = 0.29 * (spec.head ?? 1);
    ball(head, fur, [0, 0, 0], spec.flat ? [hs * 1.25, hs * 0.75, hs] : spec.long ? [hs * 0.82, hs * 0.95, hs * 1.15] : hs);
    // A horse's long face: a tapered muzzle reaching down and forward.
    if (spec.long) {
      limb(head, fur, [0, -0.02, hs * 0.6], [0, -0.2, hs * 1.45], 0.15);
      ball(head, spec.muzzle, [0, -0.22, hs * 1.55], [0.15, 0.13, 0.13]);
      for (const sx of [-1, 1]) ball(head, spec.nose, [sx * 0.06, -0.2, hs * 1.55 + 0.12], 0.025);
      if (spec.headStripes) {
        for (const z of [0.55, 0.9, 1.2]) ball(head, spec.stripes, [0, 0.02 - z * 0.15, hs * z], [0.158, 0.025, 0.05]);
      }
    }

    // Snout, beak, or a pig's disc.
    const front = hs * (spec.flat ? 0.85 : 0.9);
    if (spec.beak) {
      cone(head, spec.beak, [0, -0.04, front + 0.08], 0.07, 0.2, [Math.PI / 2, 0, 0]);
      ball(head, spec.belly, [0, -0.04, front * 0.55], [hs * 0.75, hs * 0.65, hs * 0.5]);
    } else if (spec.disc) {
      ball(head, spec.disc, [0, -0.05, front + 0.02], [0.12, 0.09, 0.06]);
      for (const sx of [-1, 1]) ball(head, spec.nose, [sx * 0.04, -0.05, front + 0.075], 0.02);
    } else if (spec.long) {
      // Built with the head above.
    } else if (spec.snout > 0.35) {
      const l = 0.14 * spec.snout;
      ball(head, spec.muzzle ?? spec.belly, [0, -0.07, front - 0.02 + l * 0.4], [0.13, 0.1, l]);
      ball(head, spec.nose, [0, -0.04, front - 0.02 + l * 1.3], 0.045);
    } else if (spec.bigNose) {
      ball(head, spec.nose, [0, -0.02, front + 0.02], [0.08, 0.11, 0.07]);
    }

    // Eyes: on top for the frog, with dark patches for the panda.
    const eyeY = spec.topEyes ? hs * 0.7 : 0.07;
    const eyeZ = spec.topEyes ? hs * 0.45 : front * 0.85;
    for (const sx of [-1, 1]) {
      const ex = sx * hs * (spec.topEyes ? 0.55 : 0.42);
      if (spec.patches) ball(head, spec.patches, [ex, eyeY - 0.01, eyeZ - 0.03], [0.09, 0.07, 0.05]);
      if (spec.topEyes) ball(head, fur, [ex, eyeY - 0.03, eyeZ - 0.02], 0.1);
      ball(head, 0xffffff, [ex, eyeY, eyeZ], spec.topEyes ? 0.085 : 0.06);
      ball(head, 0x111114, [ex * 1.02, eyeY + 0.005, eyeZ + (spec.topEyes ? 0.065 : 0.045)], spec.topEyes ? 0.04 : 0.032);
    }

    // A horse's mane down the back of the head, a zebra's stripes over it, an antelope's horns.
    if (spec.mane) {
      ball(head, spec.mane, [0, hs * 0.95, hs * 0.35], [0.07, 0.07, 0.1]);
      for (let k = 0; k < 6; k++) ball(head, spec.mane, [0, hs * (1 - k * 0.3), -hs * (0.2 + k * 0.3)], [0.06, 0.15, 0.1]);
    }
    if (spec.headStripes) {
      for (const y of [-0.08, 0.05, 0.17]) ball(head, spec.stripes, [0, y, -0.03], [hs * 0.85, 0.03, hs * 1.08]);
    }
    // Ringed horns sweeping up and back.
    if (spec.horns) {
      for (const sx of [-1, 1]) {
        const horn = new THREE.Group();
        horn.position.set(sx * hs * 0.32, hs * 0.8, 0.02);
        horn.rotation.set(-0.45, 0, -sx * 0.22);
        head.add(horn);
        cone(horn, spec.horns, [0, 0.3, 0], 0.06, 0.6);
        for (const y of [0.08, 0.18, 0.28]) ball(horn, spec.horns, [0, y, 0], [0.065 - y * 0.08, 0.02, 0.065 - y * 0.08]);
      }
    }

    // Ears, in a group each so they can flap in the wind.
    const ears = [];
    const earColor = spec.ear ?? fur;
    for (const sx of [-1, 1]) {
      const ear = new THREE.Group();
      head.add(ear);
      ears.push(ear);
      switch (spec.ears) {
        case 'pointy':
          ear.position.set(sx * hs * 0.55, hs * 0.75, -0.02);
          ear.rotation.z = -sx * 0.35;
          cone(ear, earColor, [0, 0.1, 0], 0.1, 0.22);
          cone(ear, spec.inner, [0, 0.09, 0.03], 0.06, 0.15);
          break;
        case 'tall':
          ear.position.set(sx * hs * 0.5, hs * 0.8, -0.03);
          ear.rotation.z = -sx * 0.3;
          cone(ear, earColor, [0, 0.15, 0], 0.11, 0.32);
          cone(ear, spec.inner, [0, 0.13, 0.035], 0.065, 0.22);
          break;
        case 'long':
          ear.position.set(sx * 0.09, hs * 0.85, -0.04);
          ear.rotation.set(-0.25, 0, -sx * 0.12);
          limb(ear, earColor, [0, 0, 0], [0, 0.42, 0], 0.065);
          ball(ear, spec.inner, [0, 0.22, 0.04], [0.035, 0.17, 0.02]);
          break;
        case 'round':
        case 'small':
        case 'big': {
          const r = spec.ears === 'big' ? 0.15 : spec.ears === 'small' ? 0.06 : 0.095;
          ear.position.set(sx * hs * 0.72, hs * 0.72, -0.02);
          ball(ear, earColor, [0, 0, 0], [r, r, r * 0.55]);
          ball(ear, spec.inner, [0, 0, 0.03], [r * 0.6, r * 0.6, r * 0.3]);
          break;
        }
        case 'flop':
          ear.position.set(sx * hs * 0.6, hs * 0.65, 0.05);
          ear.rotation.set(0.9, 0, -sx * 0.5);
          cone(ear, earColor, [0, 0.08, 0], 0.09, 0.18);
          break;
        default:
          break;
      }
    }

    // Tail, behind the seat.
    const tail = new THREE.Group();
    tail.position.set(0, 0.24, -0.38);
    rider.add(tail);
    switch (spec.tail) {
      case 'bushy':
        limb(tail, fur, [0, 0, 0], [0, 0.18, -0.55], 0.14);
        ball(tail, spec.tip ?? fur, [0, 0.2, -0.62], 0.13);
        break;
      case 'long':
        limb(tail, fur, [0, 0, 0], [0, 0.05, -0.45], 0.05);
        limb(tail, spec.stripes ?? fur, [0, 0.05, -0.45], [0, 0.3, -0.62], 0.05);
        break;
      case 'curl': {
        const m = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.045, 8, 16, Math.PI * 1.6), mat(fur));
        m.position.set(0, 0.1, -0.05);
        m.rotation.y = Math.PI / 2;
        m.castShadow = true;
        tail.add(m);
        break;
      }
      case 'hair':
        limb(tail, spec.mane, [0, 0, 0], [0, -0.3, -0.45], 0.08);
        ball(tail, spec.mane, [0, -0.34, -0.5], 0.1);
        break;
      case 'puff':
        ball(tail, spec.belly, [0, 0.02, -0.04], 0.1);
        break;
      default:
        break;
    }

    const seed = Math.random() * 10;
    rider.userData.animate = (time, s) => {
      const stream = THREE.MathUtils.clamp(s.speed / 48, 0, 1);
      body.rotation.x = 0.08 + stream * 0.12;
      head.position.y = 0.94 - stream * 0.05 + Math.sin(time * 2.4 + seed) * 0.012;
      head.rotation.set(stream * 0.1, Math.sin(time * 0.7 + seed) * 0.15 * (1 - stream), -s.lean * 0.35);
      ears.forEach((ear, i) => {
        ear.userData.base ??= ear.rotation.x;
        ear.rotation.x = ear.userData.base - stream * 0.6 + Math.sin(time * (8 + stream * 14) + i) * 0.06 * (0.3 + stream);
      });
      tail.rotation.set(-stream * 0.4, Math.sin(time * (3 + stream * 9) + seed) * 0.25, 0);
    };
    return rider;
  };
}
