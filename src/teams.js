import * as THREE from 'three';

// Two teams. The player's team flies red flags, everyone else blue. Every bike carries
// its team's flag on a pole behind the seat so friend and foe read from a distance.

export const FRIEND = 1;
export const FOE = 0;

export const TEAM_COLOR = {
  [FRIEND]: new THREE.Color(0xe8222a),
  [FOE]: new THREE.Color(0x2257e8),
};

// Where the pole stands, in bike space (+Z forward, +Y up, +X left): the right rear
// corner, so the player's own pole stays off the middle of the chase view.
export const FLAG_MOUNT = new THREE.Vector3(-0.55, 0.9, -1.55);

function colored(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Pole and cloth around the pole base at the origin, with vertex colors: the dark pole
// stays dark and the white cloth takes the material or instance color.
export function flagParts() {
  const pole = new THREE.CylinderGeometry(0.04, 0.055, 2.8, 6);
  pole.translate(0, 1.4, 0);
  const knob = new THREE.SphereGeometry(0.09, 8, 6);
  knob.translate(0, 2.85, 0);
  const cloth = new THREE.PlaneGeometry(1.7, 1.05, 4, 1);
  // A slight wave baked in, so the static swarm flags do not look like boards.
  const p = cloth.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) + 0.85) * 3.2) * 0.12);
  cloth.rotateY(Math.PI / 2); // plane X -> -Z (trailing behind), Z wave -> X
  cloth.translate(0, 2.25, -0.85);
  return [colored(pole, 0x1a1a1f), colored(knob, 0xd8d0b0), colored(cloth, 0xffffff)];
}
