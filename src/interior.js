import * as THREE from 'three';
import { mulberry32 } from './noise.js';

export const INTERIOR_Y = 3000;
const CELL = 18; // each grid cell is 18x18 m — plenty of room to drive and turn a hover-bike
const WALL_H = 8;
const WALL_T = 1.2;

function makeSign(text, width, bg, fg) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = 80;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, width, 80);
  g.strokeStyle = '#f0c060';
  g.lineWidth = 6;
  g.strokeRect(4, 4, width - 8, 72);
  g.fillStyle = fg;
  g.font = 'bold 36px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, width / 2, 42);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeTileTexture(c1, c2) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = c1;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = c2;
  g.fillRect(0, 0, 64, 64);
  g.fillRect(64, 64, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const WALL_PALETTES = [0xf2e4cc, 0xdce8f2, 0xf2dcdc, 0xe0eed8, 0xeee4f6, 0xf8eed0];
const FLOOR_PALETTES = [0x8c6239, 0x6b4c35, 0xa88258, 0x70747d, 0x8a5a44];
const BLANKET_PALETTES = [0x4a6ac8, 0xc84a6a, 0x4ab06a, 0xe0a030, 0x8a4ac8, 0x30a0b0];

const DIRS = [
  { dx: 0, dz: -1, bit: 1, opp: 2 }, // North (-Z)
  { dx: 0, dz: 1, bit: 2, opp: 1 },  // South (+Z)
  { dx: -1, dz: 0, bit: 4, opp: 8 }, // West (-X)
  { dx: 1, dz: 0, bit: 8, opp: 4 },  // East (+X)
];

export class InteriorWorld {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.position.set(0, INTERIOR_Y, 0);
    this.root.visible = false;
    scene.add(this.root);

    // Dedicated bright indoor lighting so every room is well lit regardless of time of day or level.
    this.hemi = new THREE.HemisphereLight(0xfff4e0, 0xb89a78, 1.4);
    this.root.add(this.hemi);
    this.keyLight = new THREE.DirectionalLight(0xfff0d8, 0.9);
    this.keyLight.position.set(20, 40, 20);
    this.root.add(this.keyLight);

    this.content = new THREE.Group();
    this.root.add(this.content);

    this.boxes = [];   // AABB colliders { x0, x1, z0, z1 } in world space
    this.beds = [];    // { x, z, lookX, lookZ, sleepSign } in world space
    this.kitchen = null; // { x, z } food pickup center in world space
    this.exit = { x: 0, z: CELL * 0.4 }; // exit portal in world space
    this.chef = null;  // animated chef robot parts
    this.steam = [];   // rising steam puffs above the stove
    this.seed = -1;
  }

  get active() {
    return this.root.visible;
  }

  setVisible(v) {
    this.root.visible = v;
  }

  // Generate a unique large mansion interior for `seed`.
  build(seed) {
    if (this.seed === seed && this.content.children.length > 0) return;
    this.seed = seed;
    this.clear();

    const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];

    const wallHex = pick(WALL_PALETTES);
    const floorHex = pick(FLOOR_PALETTES);
    const blanketHex = pick(BLANKET_PALETTES);

    const mat = (color, glow = 0.28, extra = {}) =>
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: glow, roughness: 0.85, ...extra });

    const wallMat = mat(wallHex, 0.25);
    const trimMat = mat(0x5a381e, 0.2);
    const floorMat = mat(floorHex, 0.22);
    const ceilMat = mat(0xf7f2e8, 0.35);
    const kitchenFloorMat = new THREE.MeshStandardMaterial({
      map: makeTileTexture('#f2efe8', '#38404a'),
      emissive: 0x303030,
      emissiveIntensity: 0.25,
      roughness: 0.6,
    });

    // 1. Build a connected grid of cells starting at (0, 0) heading generally into -Z.
    const cells = new Map(); // key "gx,gz" -> { gx, gz, open: bitmask, role: 'entry'|'hall'|'bed'|'kitchen'|'lounge'|'master' }
    const key = (gx, gz) => `${gx},${gz}`;
    const get = (gx, gz) => cells.get(key(gx, gz));
    const addCell = (gx, gz, role = 'hall') => {
      const k = key(gx, gz);
      if (!cells.has(k)) cells.set(k, { gx, gz, open: 0, role });
      return cells.get(k);
    };
    const connect = (a, b, dir) => {
      a.open |= dir.bit;
      b.open |= dir.opp;
    };

    let cur = addCell(0, 0, 'entry');
    const mainPath = [cur];
    const mainLen = 7 + Math.floor(rng() * 3); // 7..9 cells deep
    for (let step = 0; step < mainLen; step++) {
      // Bias forward (-Z) and sideways, never going back into +Z past entry.
      const choices = DIRS.filter((d) => {
        const nx = cur.gx + d.dx;
        const nz = cur.gz + d.dz;
        return nz <= 0 && !get(nx, nz);
      });
      if (choices.length === 0) break;
      // Weight North (-Z) higher so the house stretches deep.
      const weighted = [];
      for (const d of choices) {
        weighted.push(d);
        if (d.dz === -1) weighted.push(d, d);
      }
      const dir = pick(weighted);
      const next = addCell(cur.gx + dir.dx, cur.gz + dir.dz, 'hall');
      connect(cur, next, dir);
      cur = next;
      mainPath.push(cur);
    }
    mainPath[mainPath.length - 1].role = 'master';

    // Place intermediate beds along the main path every 3 cells ("走到一個段落總會遇到床").
    for (let i = 3; i < mainPath.length - 1; i += 3) {
      mainPath[i].role = 'bed';
    }

    // Add a kitchen wing branching off the first half of the main path.
    const branchBase = mainPath[Math.min(2, mainPath.length - 1)];
    let kitchenCell = null;
    for (const dir of DIRS) {
      if (dir.dz === 1 && branchBase.gz === 0) continue;
      const nx = branchBase.gx + dir.dx;
      const nz = branchBase.gz + dir.dz;
      if (!get(nx, nz)) {
        const hall = addCell(nx, nz, 'hall');
        connect(branchBase, hall, dir);
        // Extend one more cell if free so the kitchen feels tucked into its own room.
        const nx2 = hall.gx + dir.dx;
        const nz2 = hall.gz + dir.dz;
        if (!get(nx2, nz2)) {
          kitchenCell = addCell(nx2, nz2, 'kitchen');
          connect(hall, kitchenCell, dir);
        } else {
          hall.role = 'kitchen';
          kitchenCell = hall;
        }
        break;
      }
    }
    if (!kitchenCell) {
      // Fallback: put kitchen on a side step from index 1 or 3.
      for (const b of mainPath.slice(1, -1)) {
        for (const dir of DIRS) {
          const nx = b.gx + dir.dx;
          const nz = b.gz + dir.dz;
          if (!get(nx, nz)) {
            kitchenCell = addCell(nx, nz, 'kitchen');
            connect(b, kitchenCell, dir);
            break;
          }
        }
        if (kitchenCell) break;
      }
    }

    // Add 1-2 extra lounge / side rooms for variety.
    let lounges = 0;
    for (let i = 1; i < mainPath.length - 1 && lounges < 2; i++) {
      if (rng() > 0.6) continue;
      const b = mainPath[i];
      for (const dir of DIRS) {
        const nx = b.gx + dir.dx;
        const nz = b.gz + dir.dz;
        if (nz <= 0 && !get(nx, nz)) {
          const room = addCell(nx, nz, lounges === 0 ? 'lounge' : 'bed');
          connect(b, room, dir);
          lounges++;
          break;
        }
      }
    }

    // 2. Build geometry and AABB wall colliders for each cell.
    const floorGeo = new THREE.BoxGeometry(CELL, 0.4, CELL);
    const ceilGeo = new THREE.BoxGeometry(CELL, 0.4, CELL);
    const nsWallGeo = new THREE.BoxGeometry(CELL + WALL_T, WALL_H, WALL_T);
    const ewWallGeo = new THREE.BoxGeometry(WALL_T, WALL_H, CELL + WALL_T);

    for (const c of cells.values()) {
      const cx = c.gx * CELL;
      const cz = c.gz * CELL;

      const floor = new THREE.Mesh(floorGeo, c.role === 'kitchen' ? kitchenFloorMat : floorMat);
      floor.position.set(cx, -0.2, cz);
      floor.receiveShadow = true;
      this.content.add(floor);

      const ceil = new THREE.Mesh(ceilGeo, ceilMat);
      ceil.position.set(cx, WALL_H + 0.2, cz);
      this.content.add(ceil);

      // Ceiling light fixture in each cell.
      const bulb = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.15, 1.6),
        new THREE.MeshBasicMaterial({ color: 0xfff3d0 })
      );
      bulb.position.set(cx, WALL_H - 0.08, cz);
      this.content.add(bulb);

      // Closed walls on sides not connected to a neighbour.
      for (const d of DIRS) {
        if (c.open & d.bit) continue;
        const wx = cx + d.dx * (CELL / 2);
        const wz = cz + d.dz * (CELL / 2);
        const isNS = d.dz !== 0;
        const wall = new THREE.Mesh(isNS ? nsWallGeo : ewWallGeo, wallMat);
        wall.position.set(wx, WALL_H / 2, wz);
        this.content.add(wall);

        // Baseboard trim
        const base = new THREE.Mesh(
          isNS ? new THREE.BoxGeometry(CELL, 0.5, WALL_T + 0.1) : new THREE.BoxGeometry(WALL_T + 0.1, 0.5, CELL),
          trimMat
        );
        base.position.set(wx, 0.25, wz);
        this.content.add(base);

        // Collider box (world space X/Z matches local X/Z since root is at (0, INTERIOR_Y, 0))
        const hx = isNS ? (CELL + WALL_T) / 2 : WALL_T / 2;
        const hz = isNS ? WALL_T / 2 : (CELL + WALL_T) / 2;
        this.boxes.push({ x0: wx - hx, x1: wx + hx, z0: wz - hz, z1: wz + hz });
      }

      // Decorate by role.
      if (c.role === 'entry') {
        this.buildEntry(cx, cz, mat);
      } else if (c.role === 'bed' || c.role === 'master') {
        this.buildBedRoom(cx, cz, c.open, blanketHex, c.role === 'master', mat, rng);
      } else if (c.role === 'kitchen') {
        this.buildKitchen(cx, cz, c.open, mat);
      } else if (c.role === 'lounge') {
        this.buildLounge(cx, cz, mat, rng);
      } else {
        this.buildHallDecor(cx, cz, c.open, mat, rng);
      }
    }
  }

  buildEntry(cx, cz, mat) {
    // Glowing exit portal on the South (+Z) wall of cell (0, 0).
    const ez = cz + CELL / 2 - 0.8;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(5.4, 4.4, 0.4), mat(0x6b4226, 0.25));
    frame.position.set(cx, 2.2, ez);
    this.content.add(frame);

    const portal = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 3.8),
      new THREE.MeshBasicMaterial({ color: 0x80f0ff, side: THREE.DoubleSide })
    );
    portal.position.set(cx, 2.0, ez - 0.25);
    this.content.add(portal);

    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 1.0),
      new THREE.MeshBasicMaterial({ map: makeSign('🚪 離開房子', 320, '#1e3a4c', '#e6fbff'), toneMapped: false })
    );
    signMesh.position.set(cx, 5.1, ez - 0.25);
    signMesh.rotation.y = Math.PI;
    this.content.add(signMesh);

    this.exit = { x: cx, z: ez - 0.5 };

    // Welcome rug
    const rug = new THREE.Mesh(new THREE.BoxGeometry(5, 0.04, 7), mat(0xb84444, 0.25));
    rug.position.set(cx, 0.02, cz);
    this.content.add(rug);
  }

  buildBedRoom(cx, cz, openMask, blanketHex, isMaster, mat, rng) {
    // Put the bed near a closed wall (preferring North or West/East) so driving through stays easy.
    let bx = cx - 4.5;
    let bz = cz - 4.5;
    if (!(openMask & 4)) { bx = cx - CELL / 2 + 3.2; bz = cz; }
    else if (!(openMask & 8)) { bx = cx + CELL / 2 - 3.2; bz = cz; }
    else if (!(openMask & 1)) { bx = cx; bz = cz - CELL / 2 + 3.2; }

    const g = new THREE.Group();
    g.position.set(bx, 0, bz);
    this.content.add(g);

    const put = (geo, m, x, y, z) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };

    const frame = mat(0x7a4a26, 0.25);
    const bw = isMaster ? 3.4 : 2.6;
    const bl = isMaster ? 4.2 : 3.6;
    put(new THREE.BoxGeometry(bw, 0.5, bl), frame, 0, 0.25, 0);
    put(new THREE.BoxGeometry(bw - 0.1, 0.25, bl - 0.1), mat(0xffffff, 0.35), 0, 0.6, 0);
    put(new THREE.BoxGeometry(bw, 0.2, bl * 0.65), mat(blanketHex, 0.35), 0, 0.75, bl * 0.15);
    put(new THREE.BoxGeometry(bw * 0.6, 0.22, 0.7), mat(0xfaf6ee, 0.35), 0, 0.8, -bl * 0.35);
    put(new THREE.BoxGeometry(bw, 1.3, 0.18), frame, 0, 0.85, -bl / 2);

    // Bedside lamp
    put(new THREE.BoxGeometry(0.9, 0.75, 0.9), mat(0x8a5a30, 0.25), bw / 2 + 0.8, 0.37, -bl * 0.3);
    put(new THREE.SphereGeometry(0.3, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffe49c }), bw / 2 + 0.8, 1.05, -bl * 0.3);

    // Bed sign
    const bedSign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 0.85),
      new THREE.MeshBasicMaterial({ map: makeSign('🛏️ 停在床邊睡覺', 360, '#2a2450', '#fff4c0'), toneMapped: false, side: THREE.DoubleSide })
    );
    bedSign.position.set(0, 2.7, 0);
    g.add(bedSign);

    const sleepSign = new THREE.Mesh(
      new THREE.PlaneGeometry(4.0, 0.9),
      new THREE.MeshBasicMaterial({ map: makeSign('沉睡中，請勿打擾', 380, '#1f1a3d', '#ffeaa0'), toneMapped: false, side: THREE.DoubleSide })
    );
    sleepSign.position.set(0, 3.7, 0);
    sleepSign.visible = false;
    g.add(sleepSign);

    // Soft collision for the bed itself so you park beside it rather than driving through it.
    this.boxes.push({ x0: bx - bw / 2, x1: bx + bw / 2, z0: bz - bl / 2, z1: bz + bl / 2 });
    this.beds.push({ x: bx, z: bz, sleepSign });

    if (isMaster || rng() < 0.7) {
      const rug = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.04, 24), mat(0xc85a5a, 0.25));
      rug.position.set(cx, 0.02, cz);
      this.content.add(rug);
    }
  }

  buildKitchen(cx, cz, openMask, mat) {
    // Place stove & counter along a closed wall, and dining table + chef robot in front.
    const counter = new THREE.Group();
    let kx = cx;
    let kz = cz - CELL / 2 + 1.8;
    let rotY = 0;
    if (!(openMask & 1)) { kx = cx; kz = cz - CELL / 2 + 1.8; rotY = 0; }
    else if (!(openMask & 4)) { kx = cx - CELL / 2 + 1.8; kz = cz; rotY = Math.PI / 2; }
    else if (!(openMask & 8)) { kx = cx + CELL / 2 - 1.8; kz = cz; rotY = -Math.PI / 2; }

    counter.position.set(kx, 0, kz);
    counter.rotation.y = rotY;
    this.content.add(counter);

    const put = (parent, geo, m, x, y, z) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };

    // Kitchen counter + stove + pot + fridge
    put(counter, new THREE.BoxGeometry(8.5, 1.3, 1.8), mat(0xdcd6cc, 0.25), 0, 0.65, 0);
    put(counter, new THREE.BoxGeometry(8.7, 0.14, 1.95), mat(0x505660, 0.25), 0, 1.35, 0);
    // Glowing stove burner
    put(counter, new THREE.CylinderGeometry(0.65, 0.65, 0.08, 16), new THREE.MeshBasicMaterial({ color: 0xff5a20 }), -1.2, 1.44, 0);
    // Cooking pot
    put(counter, new THREE.CylinderGeometry(0.58, 0.5, 0.65, 16), mat(0xb0b8c4, 0.2), -1.2, 1.78, 0);
    put(counter, new THREE.CylinderGeometry(0.52, 0.52, 0.1, 16), mat(0xffc850, 0.4), -1.2, 2.08, 0);
    // Fridge
    put(counter, new THREE.BoxGeometry(2.0, 4.0, 1.9), mat(0xe8f0f6, 0.25), 3.4, 2.0, 0);

    // Kitchen wall sign
    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 1.0),
      new THREE.MeshBasicMaterial({ map: makeSign('🍳 廚房 · 吃飽再上路', 400, '#4a2410', '#ffe49e'), toneMapped: false, side: THREE.DoubleSide })
    );
    signMesh.position.set(0, 4.6, 0.3);
    counter.add(signMesh);

    // Chef Robot standing in front of the stove!
    const chef = new THREE.Group();
    chef.position.set(0, 0, 1.9);
    counter.add(chef);

    const metal = mat(0xc4d0dc, 0.28);
    const darkMetal = mat(0x465260, 0.25);
    const white = mat(0xffffff, 0.4);
    // Legs / base
    put(chef, new THREE.CylinderGeometry(0.55, 0.7, 0.7, 14), darkMetal, 0, 0.35, 0);
    // Torso
    put(chef, new THREE.BoxGeometry(1.3, 1.4, 0.9), metal, 0, 1.4, 0);
    // Apron
    put(chef, new THREE.BoxGeometry(1.1, 1.1, 0.1), white, 0, 1.25, 0.48);
    // Head
    put(chef, new THREE.BoxGeometry(0.95, 0.85, 0.85), metal, 0, 2.55, 0);
    // Glowing eyes
    put(chef, new THREE.BoxGeometry(0.18, 0.16, 0.1), new THREE.MeshBasicMaterial({ color: 0x40e8ff }), -0.22, 2.6, 0.44);
    put(chef, new THREE.BoxGeometry(0.18, 0.16, 0.1), new THREE.MeshBasicMaterial({ color: 0x40e8ff }), 0.22, 2.6, 0.44);
    // Tall chef hat
    put(chef, new THREE.CylinderGeometry(0.5, 0.44, 0.45, 16), white, 0, 3.18, 0);
    put(chef, new THREE.SphereGeometry(0.52, 14, 10), white, 0, 3.55, 0);

    // Right arm holding a spatula
    const arm = new THREE.Group();
    arm.position.set(0.82, 1.85, 0);
    chef.add(arm);
    put(arm, new THREE.BoxGeometry(0.28, 0.9, 0.28), metal, 0, -0.35, 0.2);
    put(arm, new THREE.BoxGeometry(0.1, 0.1, 0.9), darkMetal, 0, -0.7, 0.6);
    put(arm, new THREE.BoxGeometry(0.32, 0.06, 0.35), darkMetal, 0, -0.7, 1.1);

    // Steam puffs above the pot
    this.steam = [];
    for (let i = 0; i < 6; i++) {
      const puff = put(counter, new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 }), -1.2, 2.3 + i * 0.35, 0);
      puff.userData.phase = i / 6;
      this.steam.push(puff);
    }

    this.chef = { group: chef, arm, baseX: 0 };

    // Dining table with hot rice bowl in the center of the kitchen
    const table = new THREE.Group();
    table.position.set(cx, 0, cz + 1.5);
    this.content.add(table);
    put(table, new THREE.CylinderGeometry(1.7, 1.7, 0.15, 20), mat(0xa86b3a, 0.25), 0, 1.1, 0);
    put(table, new THREE.CylinderGeometry(0.22, 0.3, 1.1, 12), mat(0x5a381e, 0.2), 0, 0.55, 0);
    // Rice bowl & food
    put(table, new THREE.CylinderGeometry(0.45, 0.25, 0.32, 14), white, 0, 1.32, 0);
    put(table, new THREE.SphereGeometry(0.36, 12, 8), mat(0xfff4d0, 0.45), 0, 1.44, 0);

    this.boxes.push({ x0: cx - 1.6, x1: cx + 1.6, z0: cz + 1.5 - 1.6, z1: cz + 1.5 + 1.6 });
    // Food pickup point centered around the dining table & chef
    this.kitchen = { x: cx, z: cz + 0.5 };
  }

  buildLounge(cx, cz, mat, rng) {
    const rug = new THREE.Mesh(new THREE.BoxGeometry(6, 0.04, 4.5), mat(0x4a7ac8, 0.25));
    rug.position.set(cx, 0.02, cz);
    this.content.add(rug);

    const sofa = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.2, 1.5), mat(0xc8584a, 0.25));
    sofa.position.set(cx, 0.6, cz - 3.5);
    this.content.add(sofa);
    this.boxes.push({ x0: cx - 2.1, x1: cx + 2.1, z0: cz - 4.25, z1: cz - 2.75 });

    if (rng() < 0.8) {
      const plant = new THREE.Group();
      plant.position.set(cx + 4.5, 0, cz - 4.5);
      this.content.add(plant);
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.9, 12), mat(0xb0603a, 0.25));
      pot.position.y = 0.45;
      plant.add(pot);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), mat(0x3f8a45, 0.3));
      leaf.position.y = 1.5;
      plant.add(leaf);
    }
  }

  buildHallDecor(cx, cz, openMask, mat, rng) {
    // Runner carpet along the hall
    const carpet = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.03, 8), mat(0x9a4444, 0.25));
    carpet.position.set(cx, 0.015, cz);
    this.content.add(carpet);

    // Picture on a closed wall if there is one
    if (!(openMask & 4) && rng() < 0.7) {
      const pic = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 3.2), mat(0x6ab0e0, 0.35));
      pic.position.set(cx - CELL / 2 + WALL_T / 2 + 0.08, 3.2, cz);
      this.content.add(pic);
    }
    if (!(openMask & 8) && rng() < 0.7) {
      const pic = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 3.2), mat(0xe0a850, 0.35));
      pic.position.set(cx + CELL / 2 - WALL_T / 2 - 0.08, 3.2, cz);
      this.content.add(pic);
    }
  }

  // Push bike out of interior AABB walls and furniture.
  collide(pos, vel, pad = 1.35) {
    for (const b of this.boxes) {
      const cx = THREE.MathUtils.clamp(pos.x, b.x0, b.x1);
      const cz = THREE.MathUtils.clamp(pos.z, b.z0, b.z1);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= pad * pad) continue;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        pos.x = cx + nx * pad;
        pos.z = cz + nz * pad;
        const vn = vel.x * nx + vel.z * nz;
        if (vn < 0) {
          vel.x -= nx * vn;
          vel.z -= nz * vn;
        }
      } else {
        // Inside the box: push out along nearest edge
        const dl = pos.x - b.x0;
        const dr = b.x1 - pos.x;
        const dt = pos.z - b.z0;
        const db = b.z1 - pos.z;
        const m = Math.min(dl, dr, dt, db);
        if (m === dl) pos.x = b.x0 - pad;
        else if (m === dr) pos.x = b.x1 + pad;
        else if (m === dt) pos.z = b.z0 - pad;
        else pos.z = b.z1 + pad;
      }
    }
  }

  nearestBed(pos) {
    let best = null;
    let bestD = Infinity;
    for (const b of this.beds) {
      const d = Math.hypot(pos.x - b.x, pos.z - b.z);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best ? { bed: best, dist: bestD } : null;
  }

  bedroomView(bed, eye, target) {
    eye.set(bed.x + 5.5, INTERIOR_Y + 4.8, bed.z + 5.5);
    target.set(bed.x, INTERIOR_Y + 1.4, bed.z);
  }

  update(time) {
    if (!this.root.visible) return;
    if (this.chef) {
      this.chef.group.position.x = this.chef.baseX + Math.sin(time * 1.4) * 1.1;
      this.chef.arm.rotation.x = -0.35 + Math.sin(time * 6.5) * 0.45;
    }
    for (const p of this.steam) {
      const t = (time * 0.55 + p.userData.phase) % 1;
      p.position.y = 2.25 + t * 1.8;
      p.scale.setScalar(0.7 + t * 0.9);
      p.material.opacity = (1 - t) * 0.65;
    }
  }

  clear() {
    while (this.content.children.length > 0) {
      const c = this.content.children[0];
      this.content.remove(c);
    }
    this.boxes.length = 0;
    this.beds.length = 0;
    this.kitchen = null;
    this.chef = null;
    this.steam = [];
  }
}
