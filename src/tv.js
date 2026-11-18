const TV_KEY = 'desert-racing-tv';

export function isTvMode() {
  try {
    return sessionStorage.getItem(TV_KEY) === '1';
  } catch {
    return false;
  }
}

export function setTvMode(on) {
  try {
    if (on) sessionStorage.setItem(TV_KEY, '1');
    else sessionStorage.removeItem(TV_KEY);
  } catch {}
}

// Compute virtual keyboard inputs for the autonomous TV-mode driver.
// Drives forward, dodges obstacles/lava, chases nearby coins or foes, and fires weapons.
export function computeTvControls({ player, colliders, targets, nearestCoin, friendTeam, time, lavaAt }) {
  const down = new Set(['KeyW']);
  const hits = new Set();

  const fx = Math.sin(player.yaw);
  const fz = Math.cos(player.yaw);
  // +X in bike frame is left: right = (-fz, fx)? Wait:
  // forward = (sin yaw, cos yaw). Left = (cos yaw, -sin yaw).
  const lx = Math.cos(player.yaw);
  const lz = -Math.sin(player.yaw);

  let steer = 0; // >0 steer left (KeyA), <0 steer right (KeyD)
  let blocked = false;

  // 1. Dodge nearest obstacle directly ahead within 32m.
  let nearObsDist = 32;
  let nearObsSide = 0;
  for (const c of colliders) {
    if (c.top < player.pos.y - 0.5) continue;
    const dx = c.x - player.pos.x;
    const dz = c.z - player.pos.z;
    const fwd = dx * fx + dz * fz;
    if (fwd < 0 || fwd > nearObsDist) continue;
    const lat = dx * lx + dz * lz; // >0 on left, <0 on right
    const clearance = (c.r ?? 2) + 3.0;
    if (Math.abs(lat) < clearance) {
      nearObsDist = fwd;
      nearObsSide = lat >= 0 ? -1 : 1; // obstacle on left -> steer right (-1)
      blocked = true;
    }
  }

  // 2. Dodge lava ahead if on volcano level.
  if (!blocked && lavaAt) {
    const aheadX = player.pos.x + fx * 18;
    const aheadZ = player.pos.z + fz * 18;
    if (lavaAt(aheadX, aheadZ) > 0.45) {
      const leftLava = lavaAt(aheadX + lx * 10, aheadZ + lz * 10);
      const rightLava = lavaAt(aheadX - lx * 10, aheadZ - lz * 10);
      steer = leftLava < rightLava ? 1 : -1;
      blocked = true;
      if (player.gap < 1.2) hits.add('Space');
    }
  }

  if (blocked) {
    if (steer === 0) steer = nearObsSide;
    if (nearObsDist < 14 && player.gap < 1.2) hits.add('Space');
  } else {
    // 3. Aim toward nearest enemy within 140m to battle, or nearest big coin.
    let aimX = null;
    let aimZ = null;
    let bestEnemyD = 140;
    for (const t of targets) {
      if (t.gone || t.team === friendTeam) continue;
      const d = Math.hypot(t.x - player.pos.x, t.z - player.pos.z);
      if (d < bestEnemyD) {
        bestEnemyD = d;
        aimX = t.x;
        aimZ = t.z;
      }
    }
    if (aimX == null && nearestCoin) {
      aimX = nearestCoin.x;
      aimZ = nearestCoin.z;
    }
    if (aimX != null) {
      const dx = aimX - player.pos.x;
      const dz = aimZ - player.pos.z;
      const fwd = dx * fx + dz * fz;
      const lat = dx * lx + dz * lz;
      const ang = Math.atan2(lat, fwd);
      if (ang > 0.08) steer = 1;
      else if (ang < -0.08) steer = -1;
    } else {
      // Gentle scenic weave
      const w = Math.sin(time * 0.45);
      if (w > 0.65) steer = 1;
      else if (w < -0.65) steer = -1;
    }
    if (player.speed < 55) down.add('KeyE');
  }

  // 4. Fire weapons when an enemy is in front cone.
  for (const t of targets) {
    if (t.gone || t.team === friendTeam) continue;
    const dx = t.x - player.pos.x;
    const dz = t.z - player.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 130) continue;
    const fwd = dx * fx + dz * fz;
    const lat = dx * lx + dz * lz;
    if (fwd > 0 && Math.abs(Math.atan2(lat, fwd)) < 0.28) {
      hits.add('KeyT');
      if (dist < 65) hits.add('KeyR');
      break;
    }
  }

  if (steer > 0) down.add('KeyA');
  else if (steer < 0) down.add('KeyD');

  return { down, hits };
}
