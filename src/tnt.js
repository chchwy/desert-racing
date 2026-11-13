import * as THREE from 'three';

// 炸藥 crates that 炸彈方塊人 sets down on the ground. A crate waits until something sets
// it off (a shot from anyone, or lava under it), then blows up whoever is within REACH.
export const REACH = 14;
const MAX = 8;
const SIZE = 1.1;

function label() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#c62a1e';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#f2ece0';
  g.fillRect(0, 40, 128, 48);
  g.fillStyle = '#c62a1e';
  g.font = 'bold 40px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('炸藥', 64, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const tntMaterial = new THREE.MeshStandardMaterial({ map: label(), roughness: 0.8 });

export function tntCrate(size = SIZE) {
  return new THREE.Mesh(new THREE.BoxGeometry(size, size, size), tntMaterial);
}

export class TntField {
  constructor(scene) {
    this.scene = scene;
    this.crates = [];
  }

  // Drop one at (x, y, z) on the floor; the oldest goes when there are MAX already.
  drop(x, y, z) {
    if (this.crates.length >= MAX) this.remove(this.crates[0]);
    const mesh = tntCrate();
    mesh.position.set(x, y + SIZE / 2, z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    const crate = { mesh, target: { id: -1, team: -1, x, y: y + SIZE / 2, z, gone: false } };
    crate.target.crate = crate;
    this.crates.push(crate);
  }

  remove(crate) {
    this.scene.remove(crate.mesh);
    crate.mesh.geometry.dispose();
    this.crates.splice(this.crates.indexOf(crate), 1);
  }

  // Crates as weapon targets, so any shot can set one off.
  targets(list) {
    for (const c of this.crates) {
      c.target.gone = false;
      list.push(c.target);
    }
  }
}
