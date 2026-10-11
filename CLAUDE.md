# Desert Rider

Endless desert hover-bike prototype (three.js r186, Vite 8). Procedural dunes, one generated cat rider, and streamed props. There is no test runner. `README.md` is stale: it still says the rider is primitives and that there are no external models. Trust the code.

The page copy is zh-Hant. Keep new player-facing strings in Traditional Chinese. The HUD counters (擊破 / 捕獲 / 夥伴) are static markup and are not wired to anything.

## Git

When a change is finished, commit it before starting the next one. One finished change, one commit. Do not leave the task's files uncommitted, and do not batch unrelated work into that commit.

Do not push unless asked. Do not commit the reference mp4, `node_modules`, `dist`, or secrets. The message says why, in the same style as `git log`.

## Run

```
npm install
npm run dev
```

Vite's default is http://localhost:5173. Port 5173 is often another project on this machine; if it is taken, use `--port 5174 --strictPort` and do not assume 5173 is this game.

URL flags, read in `src/main.js`:

- `?demo` holds W and weaves with A/D. Useless for checking a fixed heading.
- `?nopost` skips bloom and FXAA. `?nobloom` skips bloom only.
- An MSAA render target plus `UnrealBloomPass` draws a blank frame here. AA stays on `FXAAPass`.

`window.__game` is `{ player, terrain, chase, camera, renderer, input }`. The speed and gap readout refreshes about every 80 ms. The fps line, including the camera mode name, refreshes once a second.

A ~98 MB reference mp4 sits untracked in the repo root. The game does not load it. Do not commit it.

## Controls

Keyboard stays on `Input`. `Input.poll` runs once per frame and reads one standard gamepad through `readGamepad`.

Steer is positive to the rider's left, the same sign as KeyA. A standard pad's axis 0 is positive to the right, and that negation happens only in `readGamepad`. The right stick's positive X matches a mouse drag to the right: chase `orbit` decreases. Do not flip either sign in `player.js`.

RT or left-stick up throttles, LT or left-stick down brakes, the left stick and d-pad steer, A jumps, X or LB holds boost, Y cycles the camera, the right stick orbits, Menu resets. Analog throttle uses the existing thrust term. Chrome hides the pad until the page is focused and a button has been pressed.

## Coins

`src/coins.js` lays exactly 100 coins on one bowed trail. Each disc is 2.8 km across (`COIN_R` 1400), wider than the desert the old fog distance could show, so the cat and the pyramids read as small. The center is lifted by the radius (`COIN_LIFT`) or the bottom sinks into the sand, and `Y_REACH` has to cover that lift or a bike on the ground cannot collect. Do not put a second copy of either number in `player.js`.

The mesh is owned by the chunk under the coin's center. `Terrain.update` also keeps that chunk while the disc reaches the view (`VIEW_RADIUS` reach plus `COIN_R`). Without that, a coin this size never streams in. Fog far and the camera far plane sit past the rim so the disc is not clipped into haze. Nudge only slides the hub out of a solid; pushing by the full radius throws the coin off the trail.

## Frame

Bike space is **+Z forward, +Y up, +X to the rider's left**. This is not three.js's default Object3D forward of −Z.

`player.forward` is `(sin(yaw), 0, cos(yaw))`. `bike.root.rotation.y` is `player.yaw`. The chase camera sits behind that same vector. One yaw, one forward. Do not invent a second `sin`/`cos` pair for movement, facing, or camera placement.

`rotation.y = yaw` sends local +x to `(cos yaw, 0, −sin yaw)` and local +z to `(sin yaw, 0, cos yaw)`. Prop meshes and their colliders both go through `yawOffset` in `src/props.js`. A new prop that rotates with `rotation.y` and then places colliders with its own `cos`/`sin` will sit off its hit volume.

## Map

| File | Role |
| --- | --- |
| `src/main.js` | Renderer, post, loop, HUD, `?demo` |
| `src/player.js` | Input, hover, jump, cylinder push-out |
| `src/gamepad.js` | Standard gamepad (Xbox) axes and buttons |
| `src/camera.js` | Chase / side / front, mouse orbit, right-stick look |
| `src/bike.js` | Hover-bike from primitives. Thrusters. Mounts the rider |
| `src/riders/cat.js` | Cat GLB, seat fit, wind shader |
| `src/terrain.js` | `heightAt`, chunk streaming, prop hookup |
| `src/props.js` | Ruins, pillars, rocks, sphinx, pyramids, colliders |
| `src/noise.js` | `fbm`, `mulberry32`, `hashSeed` |
| `src/sky.js` | Sky dome. `SUN_DIR`, `HAZE_COLOR` |
| `src/effects.js` | Dust, ribbons, speed lines |

`heightAt(x, z)` is the only ground. The terrain mesh and the hover physics both call it. Do not keep a second height field.

Chunks are 200 m (`CHUNK_SIZE`). `VIEW_RADIUS` is 4. At most two chunks build per frame after the first forced fill. `Terrain.collidersNear` only returns props from the 3×3 chunks around the bike, and the push happens after integration, so a fast bike can clip a thin obstacle. Big silhouettes need a fat base collider.

## Colliders

A collider is `{ x, z, r, top }`. It blocks everything **below** `top` inside a vertical cylinder of radius `r`. The bike adds 1.3 m of padding. There is no per-band slice: a wide upper collider also blocks the ground. Tapered solids (pyramids) need several cylinders, wide and short at the base, narrower and taller above.

Jump apex is only a few metres (`vel.y` boost of 13, gravity 26–34). The base band is what normal driving hits. Upper bands matter when a dune lifts the bike into the solid. Spawn stays clear for 60 m around the origin (`props.js`).

Prop placement in a chunk is a pure function of `hashSeed(cx + 1000, cz - 1000)`. Inserting an `rng()` call ahead of the existing loop moves every ruin. Extra landmarks should use their own `mulberry32(hashSeed(...))`, the way the pyramid cluster does.

## Pyramids

`ConeGeometry(radius, height, 4)` has its base corners on the local axes. The mesh uses `rotation.y = yaw - π/4` so those corners land on the corners of the square base. The plinth is a yaw-aligned box, slightly wider than the cone, sunk with `groundMin`.

The landmark cluster is fixed in chunk (0, 0) at `(149, 118)`, the flat patch straight ahead of the initial yaw `0.9`, with a face turned back toward the origin (`atan2(-x, -z)`). Other clusters are rare and must stay well clear of that one (`LANDMARK_CLEAR`, and the 320 m check). The sun shadow frustum is only ±30 m around the bike, so a pyramid does not cast a long shadow until you are next to it.

## Cat rider

`src/assets/riders/cat.glb` is the mesh. `src/assets/riders/cat-ref.jpg` is the style anchor for any later animal. The measured front is +Z (face on the +Z render, tail toward −Z, belly −Y), so the mount quaternion is identity:

```js
model.quaternion.setFromUnitVectors(ASSET_FRONT, BIKE_FORWARD);
```

Do not replace that with `rotation.y = Math.PI`. A check that transforms `ASSET_FRONT` by the same quaternion is a tautology. Confirm facing from a render, or from a cue the mount was not built from.

Vite 8 does not treat `.glb` as an asset. `vite.config.js` has `assetsInclude: ['**/*.glb']`, and the import is `cat.glb?url`. A bare import, or `?import`, makes Vite parse the binary as JavaScript.

Wind is a vertex shader, not a second mesh and not a CPU pass over the vertices. At load, `paintWind` writes `aWind` (x = tail, y = ear) from **geometry-local** positions, before the group scale of about 1.9. `onBeforeCompile` patches `MeshStandardMaterial` and a `MeshDepthMaterial` assigned to `customDepthMaterial`, or the shadow stays rigid. `beginnormal_vertex` runs before `begin_vertex` in the r186 chunks, so `computeWind` is called from the normal chunk and `vWind` is reused. These materials are still GLSL1 (`attribute`, `#include <begin_vertex>`).

`Bike.update` calls `this.rider.userData.animate(time, s)` with `{ throttle, boost, speed, lean }`. The old capsule rider and its twin-tail loop are gone. Do not add another animal unless asked.

## Verify

Load the page and look. For a heading, prop, or collider change, a numeric self-check plus one screenshot beats reading the code. Headless Chrome on this machine works: start it and the script in the **same** shell command (a `Start-Process` Chrome dies when that shell exits), attach the debugger to a `type === 'page'` target from `/json`, and not to the browser-level socket (`Runtime.enable` is missing there). `?nopost` keeps a WebGL failure from being hidden under a bloom pass. `?demo` will steer away from whatever you were trying to frame.
