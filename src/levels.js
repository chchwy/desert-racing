import * as THREE from 'three';

// One level per page load: `?level=rainforest`, `grassland`, `snow`, `volcano` or `ocean`;
// anything else is the desert.
// Switching reloads the page: heightAt, the props and the sky all read LEVEL at import time.

const srgb = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

export const LEVELS = {
  desert: {
    id: 'desert',
    name: '沙漠',
    title: 'Desert Rider — prototype',
    eyebrow: 'DESERT RIDER / BATTLE PROTOTYPE',
    headline: '在沙上，狩獵。',
    sub: '懸浮機車原型 · 輝光＋沙塵 · 地形 endless',
    page: '#dcd3c2',
    haze: 0xdcd3c2,
    fogNear: 240,
    fogFar: 6400,
    sky: { zenith: 0x2f78c8, mid: 0x86b6e0, cover: 0, sun: 1 },
    hemi: { sky: 0xbcd6f0, ground: 0xd9b98a, intensity: 0.6 },
    sun: { color: 0xfff1dc, intensity: 2.8 },
    ground: {
      base: srgb(0.87, 0.72, 0.5),
      crest: srgb(0.93, 0.81, 0.62),
      shade: srgb(0.78, 0.6, 0.4),
      ripple: true,
      roughness: 0.93,
      normalScale: 0.28,
    },
    dust: { color: srgb(0.95, 0.87, 0.74), shade: srgb(0.8, 0.69, 0.55) },
  },
  rainforest: {
    id: 'rainforest',
    name: '雨林',
    title: 'Jungle Rider — prototype',
    eyebrow: 'JUNGLE RIDER / BATTLE PROTOTYPE',
    headline: '在林間，狩獵。',
    sub: '懸浮機車原型 · 濕霧＋巨木 · 地形 endless',
    page: '#9fb09a',
    haze: 0x9fb09a,
    fogNear: 25,
    fogFar: 1500, // humid haze swallows the forest past a few hundred metres
    sky: { zenith: 0x4d7790, mid: 0x9db7b8, cover: 0.32, sun: 0.45 },
    hemi: { sky: 0xcfe6d4, ground: 0x3a4a22, intensity: 0.8 },
    sun: { color: 0xfff0d0, intensity: 2.0 },
    ground: {
      base: srgb(0.22, 0.3, 0.12),
      crest: srgb(0.33, 0.42, 0.16),
      shade: srgb(0.3, 0.22, 0.13),
      roughness: 0.97,
      normalScale: 0.5,
    },
    dust: { color: srgb(0.66, 0.6, 0.45), shade: srgb(0.42, 0.38, 0.28) },
  },
  grassland: {
    id: 'grassland',
    name: '大草原',
    title: 'Prairie Rider — prototype',
    eyebrow: 'PRAIRIE RIDER / BATTLE PROTOTYPE',
    headline: '在草海，狩獵。',
    sub: '懸浮機車原型 · 長草＋風 · 地形 endless',
    page: '#d3d8bd',
    haze: 0xd3d8bd,
    fogNear: 140,
    fogFar: 3600,
    sky: { zenith: 0x3a7fc4, mid: 0x9cc4e2, cover: 0.08, sun: 1 },
    hemi: { sky: 0xc8e0f0, ground: 0x6b7a3a, intensity: 0.7 },
    sun: { color: 0xfff0d6, intensity: 2.6 },
    ground: {
      // Close to the grass patch seen from afar, so its rim melts into the ground.
      base: srgb(0.23, 0.31, 0.1),
      crest: srgb(0.3, 0.36, 0.12),
      shade: srgb(0.2, 0.25, 0.09),
      roughness: 0.96,
      normalScale: 0.45,
    },
    dust: { color: srgb(0.9, 0.86, 0.66), shade: srgb(0.72, 0.68, 0.48) },
  },
  snow: {
    id: 'snow',
    name: '雪山',
    title: 'Summit Rider — prototype',
    eyebrow: 'SUMMIT RIDER / BATTLE PROTOTYPE',
    headline: '在雪嶺，狩獵。',
    sub: '懸浮機車原型 · 雪霧＋冰晶 · 地形 endless',
    page: '#cfdae6',
    haze: 0xcfdae6,
    fogNear: 160,
    fogFar: 5200, // the backdrop range reaches 6 km, so distant peaks fade instead of ending
    backdrop: true,
    weather: [{}], // snow, the Weather defaults
    sky: { zenith: 0x2a62b8, mid: 0x93b6dc, cover: 0.14, sun: 1.1 },
    hemi: { sky: 0xdfeaff, ground: 0x8a93a8, intensity: 0.85 },
    sun: { color: 0xfff8f0, intensity: 2.3 },
    ground: {
      base: srgb(0.84, 0.88, 0.95),
      crest: srgb(0.96, 0.97, 1.0),
      shade: srgb(0.36, 0.36, 0.4), // bare rock on the steep faces
      steep: [4.5, 1.15, 0.85], // slope gain, offset, cap: rock only past ~40°
      roughness: 0.8,
      normalScale: 0.22,
    },
    dust: { color: srgb(0.96, 0.97, 1.0), shade: srgb(0.78, 0.82, 0.9) },
  },
  volcano: {
    id: 'volcano',
    name: '火山',
    title: 'Ember Rider — prototype',
    eyebrow: 'EMBER RIDER / BATTLE PROTOTYPE',
    headline: '在熔岩，狩獵。',
    sub: '懸浮機車原型 · 熔岩＋火山灰 · 地形 endless',
    page: '#4a332c',
    haze: 0x5a3c32,
    fogNear: 90,
    fogFar: 3400,
    backdrop: true,
    lava: true,
    weather: [
      // Embers rising and flickering, then ash drifting down.
      { count: 1400, fall: -1.4, fallSpread: -2.2, drift: 0.6, size: 0.05, sizeSpread: 0.05, color: 0xff7a2a, opacity: 1, additive: true, flicker: 0.7 },
      { count: 3000, fall: 0.7, fallSpread: 0.8, drift: 1.4, size: 0.05, sizeSpread: 0.04, color: 0x8a8580, opacity: 0.55 },
    ],
    sky: { zenith: 0x2a1c1a, mid: 0x6a3a2c, cover: 0.55, sun: 0.45, cloud: 0x6e5a52 },
    hemi: { sky: 0xb08070, ground: 0x2a1a14, intensity: 0.75 },
    sun: { color: 0xffb27a, intensity: 1.7 },
    ground: {
      base: srgb(0.13, 0.115, 0.11),
      crest: srgb(0.22, 0.19, 0.17),
      shade: srgb(0.07, 0.06, 0.06),
      lava: srgb(0.45, 0.1, 0.02),
      roughness: 0.88,
      normalScale: 0.5,
    },
    dust: { color: srgb(0.4, 0.36, 0.34), shade: srgb(0.22, 0.2, 0.19) },
  },
  ocean: {
    id: 'ocean',
    name: '海底',
    title: 'Abyss Rider — prototype',
    eyebrow: 'ABYSS RIDER / BATTLE PROTOTYPE',
    headline: '在海底，狩獵。',
    sub: '懸浮機車原型 · 珊瑚＋魚群 · 地形 endless',
    page: '#14485c',
    haze: 0x1a5870,
    fogNear: 6,
    fogFar: 340, // water swallows the view fast
    caustics: true,
    weather: [
      // Bubbles rising, then marine snow drifting down.
      { count: 900, fall: -1.2, fallSpread: -1.8, drift: 0.2, size: 0.05, sizeSpread: 0.06, color: 0xcff6ff, opacity: 0.7 },
      { count: 2500, fall: 0.25, fallSpread: 0.3, drift: 0.35, size: 0.025, sizeSpread: 0.03, color: 0xd8f0ea, opacity: 0.55 },
    ],
    // Looking up: a bright, rippling surface. The cloud layer stands in for the ripples.
    sky: { zenith: 0x9eeaf4, mid: 0x2f8aa6, cover: 0.2, sun: 0.35, cloud: 0xc8fbff, cloudSpeed: 6, hazeTop: 0.55 },
    hemi: { sky: 0x9ad8e8, ground: 0x2a4a58, intensity: 1.0 },
    sun: { color: 0xd8f4ff, intensity: 1.7 },
    ground: {
      base: srgb(0.58, 0.6, 0.52),
      crest: srgb(0.7, 0.71, 0.6),
      shade: srgb(0.3, 0.36, 0.36), // reef rock
      ripple: true,
      roughness: 0.9,
      normalScale: 0.35,
    },
    dust: { color: srgb(0.78, 0.9, 0.92), shade: srgb(0.55, 0.68, 0.7) },
  },
};

export const LEVEL_ORDER = ['desert', 'rainforest', 'grassland', 'snow', 'volcano', 'ocean'];

function pickLevel() {
  if (typeof location === 'undefined') return LEVELS.desert;
  const id = new URLSearchParams(location.search).get('level');
  return LEVELS[id] ?? LEVELS.desert;
}

export const LEVEL = pickLevel();

// Reload on the same page with the other level, keeping the other flags (?nopost, ?demo).
export function switchLevel(id) {
  if (!LEVELS[id] || id === LEVEL.id) return;
  const params = new URLSearchParams(location.search);
  if (id === 'desert') params.delete('level');
  else params.set('level', id);
  const q = params.toString();
  location.search = q ? `?${q}` : '';
}
