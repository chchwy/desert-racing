import * as THREE from 'three';

export const CAR_TYPES = [
  { id: 'hover', name: '懸浮機車', icon: '🛸' },
  { id: 'lexus', name: 'Lexus', icon: '🚘' },
  { id: 'moto', name: '摩托車重機', icon: '🏍️' },
  { id: 'yaris', name: 'Yaris', icon: '🚗' },
  { id: 'coplus', name: 'Co Plus', icon: '🚙' },
  { id: 'supercar', name: '超跑', icon: '🏎️' },
  { id: 'monster', name: '怪獸卡車', icon: '🛻' },
];

const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 20);
wheelGeo.rotateZ(Math.PI / 2);
const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.34, 14);
rimGeo.rotateZ(Math.PI / 2);

const tireMat = new THREE.MeshStandardMaterial({ color: 0x181a1e, roughness: 0.85 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xd8dee6, metalness: 0.85, roughness: 0.25 });
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x1a2838, metalness: 0.2, roughness: 0.1, clearcoat: 1 });
const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 1.8) });
const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 0.25, 0.2) });
const darkTrim = new THREE.MeshStandardMaterial({ color: 0x202228, roughness: 0.6, metalness: 0.4 });

function paint(hex) {
  return new THREE.MeshPhysicalMaterial({
    color: hex,
    metalness: 0.45,
    roughness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
  });
}

function addBox(g, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  g.add(m);
  return m;
}

function addWheel(g, x, y, z, scale = 1) {
  const w = new THREE.Group();
  w.position.set(x, y, z);
  w.scale.setScalar(scale);
  const t = new THREE.Mesh(wheelGeo, tireMat);
  t.castShadow = true;
  const r = new THREE.Mesh(rimGeo, rimMat);
  w.add(t, r);
  g.add(w);
  return w;
}

function addWheels(g, x, y, zFront, zBack, scale = 1) {
  addWheel(g, x, y, zFront, scale);
  addWheel(g, -x, y, zFront, scale);
  addWheel(g, x, y, zBack, scale);
  addWheel(g, -x, y, zBack, scale);
}

export function buildCarChassis(id) {
  const g = new THREE.Group();
  let riderY = 0.25;
  let showThrusters = false;

  if (id === 'lexus') {
    const body = paint(0xf2f4f8);
    // Sleek sedan body
    addBox(g, 2.05, 0.65, 4.4, body, 0, 0.55, 0);
    // Cabin / sunroof
    addBox(g, 1.72, 0.58, 2.15, glassMat, 0, 1.08, -0.15);
    addBox(g, 1.66, 0.08, 1.6, body, 0, 1.38, -0.2);
    // Signature spindle grille
    addBox(g, 1.05, 0.52, 0.12, darkTrim, 0, 0.48, 2.22);
    // Sharp LED headlights & taillights
    addBox(g, 0.45, 0.12, 0.1, lampMat, 0.72, 0.65, 2.21);
    addBox(g, 0.45, 0.12, 0.1, lampMat, -0.72, 0.65, 2.21);
    addBox(g, 1.7, 0.12, 0.08, tailMat, 0, 0.72, -2.21);
    addWheels(g, 1.02, 0.26, 1.35, -1.35, 1.0);
    riderY = 0.42;
  } else if (id === 'moto') {
    const body = paint(0xd62828);
    // Heavy motorcycle frame & fuel tank
    addBox(g, 0.46, 0.45, 1.5, darkTrim, 0, 0.62, 0);
    addBox(g, 0.58, 0.42, 0.95, body, 0, 0.92, 0.35, 0.15);
    // Front fairing & windscreen
    addBox(g, 0.62, 0.55, 0.75, body, 0, 0.98, 1.05, -0.35);
    addBox(g, 0.48, 0.35, 0.08, glassMat, 0, 1.32, 1.12, -0.6);
    addBox(g, 0.28, 0.16, 0.1, lampMat, 0, 0.95, 1.42);
    // Handlebars
    addBox(g, 1.05, 0.07, 0.08, rimMat, 0, 1.18, 0.85);
    // Gold front forks
    const gold = paint(0xd8a830);
    addBox(g, 0.09, 0.95, 0.09, gold, 0.18, 0.65, 1.15, -0.4);
    addBox(g, 0.09, 0.95, 0.09, gold, -0.18, 0.65, 1.15, -0.4);
    // Wide front & rear motorcycle tires
    addWheel(g, 0, 0.32, 1.38, 1.15);
    addWheel(g, 0, 0.35, -1.25, 1.25);
    // Dual exhaust pipes
    addBox(g, 0.12, 0.14, 1.1, rimMat, 0.32, 0.42, -0.95, 0.1);
    addBox(g, 0.12, 0.14, 1.1, rimMat, -0.32, 0.42, -0.95, 0.1);
    riderY = 0.05;
  } else if (id === 'yaris') {
    const body = paint(0x3a9ae8);
    // Compact hatchback
    addBox(g, 1.85, 0.62, 3.55, body, 0, 0.54, 0);
    addBox(g, 1.62, 0.62, 1.95, glassMat, 0, 1.08, -0.22);
    addBox(g, 1.56, 0.08, 1.55, body, 0, 1.4, -0.25);
    // Cute round-ish headlights + roof spoiler
    addBox(g, 0.35, 0.18, 0.1, lampMat, 0.65, 0.64, 1.78);
    addBox(g, 0.35, 0.18, 0.1, lampMat, -0.65, 0.64, 1.78);
    addBox(g, 1.4, 0.08, 0.25, darkTrim, 0, 1.42, -1.35);
    addBox(g, 0.35, 0.2, 0.08, tailMat, 0.68, 0.72, -1.78);
    addBox(g, 0.35, 0.2, 0.08, tailMat, -0.68, 0.72, -1.78);
    addWheels(g, 0.92, 0.24, 1.08, -1.12, 0.92);
    riderY = 0.42;
  } else if (id === 'coplus') {
    const body = paint(0x6e7d78);
    // Stylish compact SUV (Co Plus / Corolla Cross style)
    addBox(g, 2.1, 0.75, 4.2, body, 0, 0.66, 0);
    addBox(g, 2.16, 0.22, 4.26, darkTrim, 0, 0.32, 0);
    addBox(g, 1.8, 0.65, 2.35, glassMat, 0, 1.26, -0.2);
    addBox(g, 1.74, 0.1, 1.95, body, 0, 1.6, -0.22);
    // Roof rails
    addBox(g, 0.08, 0.09, 1.85, rimMat, 0.72, 1.68, -0.22);
    addBox(g, 0.08, 0.09, 1.85, rimMat, -0.72, 1.68, -0.22);
    // Bold SUV grille & lights
    addBox(g, 1.15, 0.48, 0.12, darkTrim, 0, 0.62, 2.12);
    addBox(g, 0.42, 0.14, 0.1, lampMat, 0.75, 0.82, 2.11);
    addBox(g, 0.42, 0.14, 0.1, lampMat, -0.75, 0.82, 2.11);
    addBox(g, 1.65, 0.14, 0.08, tailMat, 0, 0.85, -2.11);
    addWheels(g, 1.06, 0.32, 1.32, -1.32, 1.12);
    riderY = 0.58;
  } else if (id === 'supercar') {
    const body = paint(0xff6b1a);
    // Low wide supercar
    addBox(g, 2.25, 0.46, 4.5, body, 0, 0.42, 0);
    addBox(g, 1.65, 0.42, 1.85, glassMat, 0, 0.82, 0.05);
    // Big rear wing
    addBox(g, 2.2, 0.08, 0.45, darkTrim, 0, 1.18, -2.0);
    addBox(g, 0.08, 0.55, 0.3, darkTrim, 0.65, 0.88, -2.0);
    addBox(g, 0.08, 0.55, 0.3, darkTrim, -0.65, 0.88, -2.0);
    addBox(g, 0.45, 0.1, 0.1, lampMat, 0.78, 0.5, 2.26);
    addBox(g, 0.45, 0.1, 0.1, lampMat, -0.78, 0.5, 2.26);
    addBox(g, 1.8, 0.1, 0.08, tailMat, 0, 0.55, -2.26);
    addWheels(g, 1.12, 0.24, 1.38, -1.38, 1.02);
    riderY = 0.22;
  } else if (id === 'monster') {
    const body = paint(0xd62828);
    // Lifted monster truck chassis + giant tires
    addBox(g, 2.2, 0.82, 4.4, body, 0, 1.25, 0);
    addBox(g, 1.9, 0.72, 1.7, glassMat, 0, 1.95, 0.35);
    addBox(g, 1.84, 0.1, 1.5, body, 0, 2.32, 0.35);
    // Rollbar + roof spotlights
    addBox(g, 1.75, 0.65, 0.1, darkTrim, 0, 1.98, -0.6);
    addBox(g, 0.22, 0.18, 0.18, lampMat, 0.5, 2.35, -0.55);
    addBox(g, 0.22, 0.18, 0.18, lampMat, -0.5, 2.35, -0.55);
    addBox(g, 0.48, 0.2, 0.1, lampMat, 0.75, 1.32, 2.21);
    addBox(g, 0.48, 0.2, 0.1, lampMat, -0.75, 1.32, 2.21);
    addWheels(g, 1.28, 0.65, 1.35, -1.35, 1.85);
    riderY = 1.2;
  } else {
    showThrusters = true;
    riderY = 0;
  }

  return { group: g, riderY, showThrusters };
}
