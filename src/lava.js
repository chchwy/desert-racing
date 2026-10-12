import * as THREE from 'three';
import { fbm } from './noise.js';

// The volcano level's big cone and its lava, shared by the height field (terrain.js)
// and the props (volcano.js) without the two importing each other.

const smooth = (t) => t * t * (3 - 2 * t);

// A big cone with a lava-filled crater, about 1.5 km from the start.
export const VOLCANO = { x: 1150, z: 900, radius: 1300, height: 460, crater: 150, craterDepth: 70 };

// 0..1 lava cover: plain channels, streams down the cone's flanks, and the crater lake.
export function lavaAt(x, z) {
  const wx = x + (fbm(x * 0.0015 + 7.7, z * 0.0015, 3) - 0.5) * 260;
  const wz = z + (fbm(x * 0.0015, z * 0.0015 + 3.9, 3) - 0.5) * 260;
  const c = Math.abs(fbm(wx * 0.0022 + 1.1, wz * 0.0022 + 8.3, 3) - 0.5);
  const spawn = smooth(THREE.MathUtils.clamp((Math.hypot(x, z) - 70) / 60, 0, 1));
  const dx = x - VOLCANO.x;
  const dz = z - VOLCANO.z;
  const r = Math.hypot(dx, dz);
  const onCone = smooth(THREE.MathUtils.clamp((r - VOLCANO.radius * 0.75) / (VOLCANO.radius * 0.2), 0, 1));
  let lava = smooth(THREE.MathUtils.clamp((0.034 - c) / 0.022, 0, 1)) * spawn * onCone;
  if (r < VOLCANO.radius * 0.8 && r > VOLCANO.crater) {
    const a = Math.atan2(dz, dx);
    const s = Math.sin(a * 9 + fbm(x * 0.002 + 4.2, z * 0.002, 2) * 7);
    const down = 1 - smooth(THREE.MathUtils.clamp((r - VOLCANO.radius * 0.45) / (VOLCANO.radius * 0.3), 0, 1));
    lava = Math.max(lava, smooth(THREE.MathUtils.clamp((s - 0.94) / 0.05, 0, 1)) * down);
  }
  if (r < VOLCANO.crater * 0.85) lava = 1;
  return lava;
}

