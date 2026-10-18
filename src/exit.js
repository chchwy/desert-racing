import * as THREE from 'three';

// The exit at the end of a level's big-coin trail: a tall glowing gate with a 出口 sign.
// Its materials ignore fog so it shows from as far as the discs do.
const WIDTH = 60;
const HEIGHT = 80;
const REACH = 34; // metres from its center that count as going through

function sign(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#0b6b2a';
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 14;
  g.strokeRect(10, 10, 492, 236);
  g.fillStyle = '#ffffff';
  g.font = 'bold 150px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 136);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class ExitGate {
  constructor(scene, at, heightAt) {
    this.x = at.x;
    this.z = at.z;
    const y = heightAt(at.x, at.z);
    this.group = new THREE.Group();
    this.group.position.set(at.x, y, at.z);
    this.group.rotation.y = Math.atan2(-at.x, -at.z); // faces back down the trail
    const frame = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.2, 0.6), fog: false });
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(5, HEIGHT, 5), frame);
      post.position.set((sx * WIDTH) / 2, HEIGHT / 2, 0);
      this.group.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(WIDTH + 5, 5, 5), frame);
    beam.position.y = HEIGHT;
    this.group.add(beam);
    this.portalMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.4, 1.6, 0.9), transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, fog: false,
    });
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, HEIGHT), this.portalMat);
    portal.position.y = HEIGHT / 2;
    this.group.add(portal);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(44, 22), new THREE.MeshBasicMaterial({ map: sign('出口'), side: THREE.DoubleSide, fog: false }));
    board.position.y = HEIGHT + 16;
    this.group.add(board);
    scene.add(this.group);
  }

  update(time) {
    this.portalMat.opacity = 0.25 + 0.15 * Math.sin(time * 3);
  }

  reached(pos) {
    return Math.hypot(pos.x - this.x, pos.z - this.z) < REACH;
  }
}
