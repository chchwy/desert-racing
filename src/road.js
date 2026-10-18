// A straight road from the start along the initial heading (yaw 0.9), the line the big
// coins sit on. On every racing level nothing stands on it: chunk props, colliders and
// hazards on it are dropped, lava stays off it, and the volcano cone and the seabed's
// trenches and seamounts are cut away along it. Drive straight from the start and you
// reach every disc and the exit.
import { LEVEL, LEVEL_ORDER } from './levels.js';

export const ROAD_YAW = 0.9;
const FX = Math.sin(ROAD_YAW);
const FZ = Math.cos(ROAD_YAW);
export const ROAD_W = 9; // metres either side kept clear
const BLEND = 14; // where the ground eases back from the road to the land

export const HAS_ROAD = LEVEL_ORDER.includes(LEVEL.id);

// Distance across the road; Infinity behind the start.
function across(x, z) {
  if (x * FX + z * FZ < -20) return Infinity;
  return Math.abs(-x * FZ + z * FX);
}

export function onRoad(x, z, pad = 0) {
  return HAS_ROAD && across(x, z) < ROAD_W + pad;
}

// 1 on the road, easing to 0 over BLEND past its edge.
export function roadMask(x, z) {
  if (!HAS_ROAD) return 0;
  const t = Math.min(Math.max((across(x, z) - ROAD_W) / BLEND, 0), 1);
  return 1 - t * t * (3 - 2 * t);
}
