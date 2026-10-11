# Desert Rider (prototype)

A three.js hover-bike prototype set in an endless desert, inspired by a vibe-coded sand game (LUTAAI on X).
Everything is procedural: no external models or textures.

```
npm install
npm run dev      # http://localhost:5173
```

URL flags: `?demo` auto-drives the bike, `?nopost` disables bloom/FXAA, `?nobloom` disables bloom only.

| Key | Action |
| --- | --- |
| W / ↑ | Throttle |
| S / ↓ | Brake / reverse |
| A D / ← → | Steer |
| Shift | Boost (uses the gauge at the top) |
| Space | Jump |
| C | Cycle camera (chase / side / front) |
| Mouse drag | Orbit the camera |
| R | Reset |

## Layout

- `src/terrain.js`: dune height field, chunk streaming, procedural ripple normal map
- `src/props.js`: ruins, pillars, rocks and a sphinx-like statue, plus their colliders
- `src/sky.js`: sky dome shader (gradient, sun, fBm clouds, horizon haze)
- `src/bike.js`: bike and rider built from primitives; thruster flames, glow and lights
- `src/effects.js`: dust particles, ribbon trails, speed lines
- `src/player.js`: input and hover physics
- `src/camera.js`: chase camera
- `src/main.js`: renderer, post-processing, main loop and HUD
