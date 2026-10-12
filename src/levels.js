import * as THREE from 'three';

// One level per page load. `?level=rainforest` picks the jungle; anything else is the desert.
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
};

export const LEVEL_ORDER = ['desert', 'rainforest'];

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
