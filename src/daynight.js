import * as THREE from 'three';

// One clock for every level: a whole 24-hour day takes DAY_LEN real seconds, and the
// hour comes from the wall clock plus a saved offset, so a level change (a page reload)
// lands at the same hour and sleeping can move it on. Day from 6:00, dusk 18:00-19:00,
// night until 5:00, dawn until 6:00. Cycle k runs from 6:00 of day k to 6:00 of the
// next, so it holds that day and the night after it.
export const DAY_LEN = 300;
const OFFSET_KEY = 'desert-racing-clock';
const HOUR = DAY_LEN / 24;

let offset = 0;
try {
  offset = Number(localStorage.getItem(OFFSET_KEY)) || 0;
} catch {
  // no storage: the plain wall clock
}
const hoursNow = () => (Date.now() / 1000 + offset) / HOUR;
const smooth = (t) => t * t * (3 - 2 * t);

export function clock() {
  const hours = hoursNow();
  const h = ((hours % 24) + 24) % 24;
  let dark = 0;
  if (h >= 19 || h < 5) dark = 1;
  else if (h >= 18) dark = smooth(h - 18);
  else if (h < 6) dark = 1 - smooth(h - 5);
  const night = h >= 18.5 || h < 5.5;
  // Seconds until it turns: to 18:30 by day, to 5:30 by night.
  const to = night ? (5.5 - h + 24) % 24 : 18.5 - h;
  return { dark, night, hour: h, cycle: Math.floor((hours - 6) / 24), left: to * HOUR };
}

// Jump the clock to 6:00 of the next day.
export function skipToMorning() {
  const hours = hoursNow();
  const morning = (Math.floor((hours - 6) / 24) + 1) * 24 + 6;
  offset += (morning - hours) * HOUR;
  try {
    localStorage.setItem(OFFSET_KEY, String(offset));
  } catch {
    // the skip lasts until the page reloads
  }
}

const MOON = new THREE.Color(0x9db4ff);
const NIGHT_SKY = new THREE.Color(0x3a4a78);
const NIGHT_GROUND = new THREE.Color(0x1a1a28);
const NIGHT_ZENITH = new THREE.Color(0x050a1c);
const NIGHT_MID = new THREE.Color(0x0e1834);
const NIGHT_HAZE = new THREE.Color(0x1c2440);

// Darkens the lights, sky and fog by `dark`. The lights and sky are reset to their
// daytime values first, then the level's own per-frame light (the sea) runs, then the
// night goes over whatever it left.
export class Nightfall {
  constructor({ renderer, sun, hemi, sky, fog }) {
    this.renderer = renderer;
    this.sun = sun;
    this.hemi = hemi;
    this.fog = fog;
    this.u = sky.material.uniforms;
    this.base = {
      exposure: renderer.toneMappingExposure,
      sun: sun.intensity,
      sunColor: sun.color.clone(),
      hemi: hemi.intensity,
      hemiSky: hemi.color.clone(),
      hemiGround: hemi.groundColor.clone(),
      fog: fog.color.clone(),
      zenith: this.u.uZenith.value.clone(),
      mid: this.u.uMid.value.clone(),
      haze: this.u.uHaze.value.clone(),
    };
  }

  reset() {
    const b = this.base;
    this.renderer.toneMappingExposure = b.exposure;
    this.sun.intensity = b.sun;
    this.sun.color.copy(b.sunColor);
    this.hemi.intensity = b.hemi;
    this.hemi.color.copy(b.hemiSky);
    this.hemi.groundColor.copy(b.hemiGround);
    this.fog.color.copy(b.fog);
    this.u.uZenith.value.copy(b.zenith);
    this.u.uMid.value.copy(b.mid);
    this.u.uHaze.value.copy(b.haze);
  }

  apply(dark) {
    this.u.uNight.value = dark;
    if (dark <= 0) return;
    this.renderer.toneMappingExposure *= 1 - dark * 0.3;
    this.sun.intensity *= 1 - dark * 0.8;
    this.sun.color.lerp(MOON, dark);
    this.hemi.intensity *= 1 - dark * 0.45;
    this.hemi.color.lerp(NIGHT_SKY, dark);
    this.hemi.groundColor.lerp(NIGHT_GROUND, dark);
    this.fog.color.lerp(NIGHT_HAZE, dark);
    this.u.uZenith.value.lerp(NIGHT_ZENITH, dark);
    this.u.uMid.value.lerp(NIGHT_MID, dark);
    this.u.uHaze.value.lerp(NIGHT_HAZE, dark);
  }
}
