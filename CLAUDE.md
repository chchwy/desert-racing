# Desert Rider

Endless hover-bike prototype (three.js r186, Vite 8) with six levels: desert, rainforest, grassland, snow mountains, volcano and seabed. Procedural terrain, one generated cat rider, and streamed props. There is no test runner. `README.md` is stale: it still says the rider is primitives and that there are no external models. Trust the code.

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

- `?level=rainforest`, `grassland`, `snow`, `volcano` or `ocean`. No flag is the desert.
- `?demo` holds W and weaves with A/D. Useless for checking a fixed heading.
- `?nopost` skips bloom and FXAA. `?nobloom` skips bloom only.
- An MSAA render target plus `UnrealBloomPass` draws a blank frame here. AA stays on `FXAAPass`.

`window.__game` is `{ player, terrain, chase, camera, renderer, input, eruption }` (`eruption` is null off the volcano). The speed and gap readout refreshes about every 80 ms. The fps line, including the camera mode name, refreshes once a second.

A ~98 MB reference mp4 sits untracked in the repo root. The game does not load it. Do not commit it.

## Controls

Keyboard stays on `Input`. `Input.poll` runs once per frame and reads one standard gamepad through `readGamepad`.

Steer is positive to the rider's left, the same sign as KeyA. A standard pad's axis 0 is positive to the right, and that negation happens only in `readGamepad`. The right stick's positive X matches a mouse drag to the right: chase `orbit` decreases. Do not flip either sign in `player.js`.

RT or left-stick up throttles, LT or left-stick down brakes, the left stick and d-pad steer, A jumps, X or LB holds boost, Y cycles the camera, the right stick orbits, Menu resets. Analog throttle uses the existing thrust term. Chrome hides the pad until the page is focused and a button has been pressed.

## Coins

`src/coins.js` lays exactly 100,000 coins on one bowed trail. Each disc is 2.8 km across (`COIN_R` 1400) and adds 10,000 to the 金幣 counter (`COIN_WORTH`). The readout is the small-coin total, not how many discs were picked up. The center is lifted by the radius (`COIN_LIFT`) or the bottom sinks into the sand, and `Y_REACH` has to cover that lift or a bike on the ground cannot collect. Do not put a second copy of either number in `player.js`.

Only coins near the bike get a mesh. `coinsInChunk` buckets the trail by chunk, and `coinsNear` binary-searches the forward projection. `Terrain.update` keeps the chunk under a coin while its disc reaches the view (`VIEW_RADIUS` reach plus `COIN_R`). Without that, a coin this size never streams in. Fog far and the camera far plane sit past the rim. Nudge only slides the hub out of a solid.

## Frame

Bike space is **+Z forward, +Y up, +X to the rider's left**. This is not three.js's default Object3D forward of −Z.

`player.forward` is `(sin(yaw), 0, cos(yaw))`. `bike.root.rotation.y` is `player.yaw`. The chase camera sits behind that same vector. One yaw, one forward. Do not invent a second `sin`/`cos` pair for movement, facing, or camera placement.

`rotation.y = yaw` sends local +x to `(cos yaw, 0, −sin yaw)` and local +z to `(sin yaw, 0, cos yaw)`. Prop meshes and their colliders both go through `yawOffset` in `src/props.js`. A new prop that rotates with `rotation.y` and then places colliders with its own `cos`/`sin` will sit off its hit volume.

## Levels

`LEVEL` is fixed for the page load. `heightAt`, the chunk props, the sky, the fog and the dust tint all read it at import time, so the picker (HUD buttons, number keys) reloads the page with `?level=` instead of swapping the world in place. Keep the other URL flags when switching (`switchLevel` does).

The rainforest uses `jungleHeight` and `buildJungleProps`; the desert code paths are unchanged. Trees, palms, ferns and boulders are one `InstancedMesh` per kind per chunk, and `disposeChunk` disposes them. Trunks, palms, boulders and the temple shrine have colliders. Ferns and canopy do not. Jungle placement seeds from `hashSeed(cx + 3000, cz - 3000)`, separate from the desert seed.

The jungle landmark at `(149, 118)` is a stepped temple on the pyramid slope record. `flatY` caps `pyramidFace` at the shrine terrace. Each terrace's outer edge sits half a step above the taper, and the stairway on the face toward the origin lies on it. The fog is much shorter than the desert's (far 1500).

The grassland uses `plainsHeight` and `buildGrasslandProps` (acacias, granite outcrops, a giant acacia at the landmark spot). Its tall grass is `src/grass.js`, not chunk props: 20 m tiles of pooled `InstancedMesh` tufts within 100 m of the bike, thinned by `count` toward the rim (tufts are written in random order, so a lower count thins evenly). The grass shader replaces `project_vertex` and bends in world space after instancing: wind gusts, the bike parting the grass, blades lying down near the camera, and the rim shrinking to the ground. Grass has no colliders and casts no shadow. The grassland ground colors are matched to the far grass so the patch rim does not show.

The snow level uses `snowHeight`: a flat valley within ~250 m of the start, ridged peaks up to ~330 m beyond it. `buildSnowProps` places pine stands below `TREE_LINE`, snow-capped boulders, and an emissive ice-crystal cluster at the landmark spot. `LEVEL.ground.steep` sets where the shade (rock) color takes over in `groundColor`; on snow it starts near 40°. Two extras hang off `LEVEL` flags: `Backdrop` (`backdrop: true`, in `terrain.js`) is a low-res ring of the same height field from 700 m to 6 km, sunk 8 m under the chunks, rebuilt every 150 m of travel a few rings per frame so it does not hitch. `Weather` (`LEVEL.weather`, a list of option sets, `src/weather.js`) wraps particles in a box around the camera in the shader; snow is the defaults. The white HUD text gets a darker halo through `body[data-level="snow"]`.

Ice crystals break. A collider may carry `breakable` (the spire record from `crystalCluster`; the cluster's fat core collider belongs to the main spire). Each frame, before `collidersNear` and the physics substeps, `Terrain.smash(pos, pos + vel·dt)` finds breakable colliders on that path, hides the instance, drops its colliders, and returns the spires; `main.js` then plays `Shatter.burst` (pooled instanced shards, `src/shatter.js`) and a frost cloud through `Dust`, trims the bike's speed and shakes the camera. `Terrain.broken` remembers `chunkKey:id` so a smashed spire stays gone when its chunk streams back in. Only snow props return `breakables`.

The volcano level uses `volcanoHeight`. `src/lava.js` holds `VOLCANO` (a 460 m cone about 1.5 km out, with a crater) and `lavaAt` (0..1: warped plain channels, streams down the flanks, the crater lake); the height field carves the lava 4 m down. With `LEVEL.lava`, chunks and the backdrop carry an `aLava` vertex attribute and `patchGround` adds animated emissive past the bloom threshold, driven by `groundUniforms.uTime`. `lava.js` exists so `terrain.js` and `volcano.js` do not import each other. `buildVolcanoProps` places basalt column stands, ember rocks and charred trees only where `lavaAt` is dry, and the lava pool at the landmark spot returns `props.vent`. `main.js` hangs a `Plume` (`src/plume.js`) over the crater and the pool. The volcano also uses the backdrop and two `Weather` sets (rising embers, falling ash). `LEVEL.sky.cloud` tints the clouds.

Lava kills. In `main.js`, `inLava` is true when the bike is within 2.5 m of the floor over `lavaAt > 0.5` or inside the pool (`props.vent`), so a jump clears a channel. `die` hides the bike, flashes `#burn` and shows `#alert`; after `DEATH_TIME` `respawn` puts the bike back at the start with the initial yaw and snaps the chase camera. `Eruption` (`src/eruption.js`) blows the crater every 35–70 s (the first after 12–26 s): an ash column whose puffs launch once and climb, wide lava bombs that land on the cone, and, when the bike is within `AIM_RANGE`, a dozen bombs aimed ballistically at where it is heading. A bomb that passes through the bike or splashes next to it kills it, except for `GRACE` seconds after a respawn. `window.__game.eruption.next = 0` forces an eruption.

The ocean level uses `seabedHeight`: broad slopes stepped into reef terraces, seamount ridges in some regions, and winding trenches cut `TRENCH_DEPTH` (100 m) along the zero line of a warped noise field, with ~40–50° walls and a flat floor. A `calm` mask keeps the start (out to ~150 m) and the shipwreck on flat sand and keeps trenches away from both. `LEVEL.ground.deep` darkens the ground color with depth, and the caustics fade out below about -70 m. `buildReefProps` places kelp forests and coral gardens by two noise fields, leaves slopes steeper than `STEEP` bare, and below `DEEP` (-35 m) grows glowing anemones and tube worms instead (unlit `MeshBasicMaterial` with instance colors past 1, so bloom picks them up). It also places reef rock piles and a shipwreck on its side at the landmark spot with colliders down its keel. Kelp sways in its own vertex shader (`swellUniforms`); only big brain corals, rocks and the wreck have colliders. `LEVEL.caustics` makes `patchGround` brighten the lit ground with a tileable water-caustic loop. The sky reads as the water surface from below: `sky.hazeTop` keeps the fog color high above the horizon, and fast bright clouds (`sky.cloudSpeed`) stand in for surface ripples. `FishSchools` (`src/fish.js`) keeps seven schools wandering near the bike, wiggles tails in the vertex shader with `gl_InstanceID`, scatters fish away from the bike, and respawns schools that fall 150 m behind. Fog is short (far 420). Bubbles and marine snow are two `Weather` sets.

## Map

| File | Role |
| --- | --- |
| `src/main.js` | Renderer, post, loop, HUD, level picker, `?demo` |
| `src/levels.js` | `LEVEL` from `?level=`, per-level colors, fog, light, HUD copy |
| `src/player.js` | Input, hover, jump, cylinder push-out |
| `src/gamepad.js` | Standard gamepad (Xbox) axes and buttons |
| `src/camera.js` | Chase / side / front, mouse orbit, right-stick look |
| `src/bike.js` | Hover-bike from primitives. Thrusters. Mounts the rider |
| `src/riders/cat.js` | Cat GLB, seat fit, wind shader |
| `src/terrain.js` | `heightAt`, chunk streaming, prop hookup |
| `src/props.js` | Ruins, pillars, rocks, sphinx, pyramids, colliders |
| `src/jungle.js` | Rainforest trees, palms, ferns, boulders, stepped temple |
| `src/grassland.js` | Prairie acacias, outcrops, giant landmark tree |
| `src/grass.js` | Streamed tall grass with wind and bike parting |
| `src/snow.js` | Snowy pines, capped boulders, ice crystals |
| `src/weather.js` | Snow, ash and ember particles around the camera |
| `src/shatter.js` | Ice shards when a crystal is smashed |
| `src/lava.js` | Volcano cone position and `lavaAt` |
| `src/volcano.js` | Basalt columns, ember rocks, dead trees, lava pool |
| `src/plume.js` | Smoke columns over the crater and the pool |
| `src/eruption.js` | Random eruptions: ash column, lava bombs |
| `src/reef.js` | Kelp, corals, reef rocks, shipwreck |
| `src/fish.js` | Fish schools that scatter from the bike |
| `src/noise.js` | `fbm`, `mulberry32`, `hashSeed` |
| `src/sky.js` | Sky dome. `SUN_DIR`, `HAZE_COLOR` |
| `src/effects.js` | Dust, ribbons, speed lines |

`heightAt(x, z)` is the sand. The hover floor and the camera's ground clamp use `Terrain.floorAt`, which is the sand unless a pyramid face is higher. Do not point the bike back at `heightAt` alone or it will drive through the pyramids.

Chunks are 200 m (`CHUNK_SIZE`). `VIEW_RADIUS` is 4. One chunk builds per frame after the first forced fill: a build costs 8–20 ms depending on the level, and two per frame showed up as hitches. `Terrain.collidersNear` only returns props from the 3×3 chunks around the bike, and the push happens after integration, so a fast bike can clip a thin obstacle. Big silhouettes need a fat base collider.

## Colliders

A collider is `{ x, z, r, top }`. It blocks everything **below** `top` inside a vertical cylinder of radius `r`. The bike adds 1.3 m of padding. There is no per-band slice: a wide upper collider also blocks the ground. That is why pyramids are not cylinders. A cylinder stack shoves the bike off the face, so a pyramid is a slope record and `floorAt` raises the hover floor to the stone.

Jump apex is only a few metres (`vel.y` boost of 13, gravity 26–34). The base band is what normal driving hits. Upper bands matter when a dune lifts the bike into the solid. Spawn stays clear for 60 m around the origin (`props.js`).

Prop placement in a chunk is a pure function of `hashSeed(cx + 1000, cz - 1000)`. Inserting an `rng()` call ahead of the existing loop moves every ruin. Extra landmarks should use their own `mulberry32(hashSeed(...))`, the way the pyramid cluster does.

## Pyramids

`ConeGeometry(radius, height, 4)` has its base corners on the local axes. The mesh uses `rotation.y = yaw - π/4` so those corners land on the corners of the square base. The plinth is a yaw-aligned box, slightly wider than the cone, sunk with `groundMin`. `describePyramid` stores that same placement. `pyramidFace` is the L∞ taper in the yaw frame: full height at the center, plinth height at the base edge. The face normal tilts outward. Drive up it; do not add cylinder bands back. On a steep face the chase camera pulls up and back, and the look point stays above the stone. A horizontal look-ahead sits inside the pyramid and the frame fills with the wall.

The landmark cluster is fixed in chunk (0, 0) at `(149, 118)`, the flat patch straight ahead of the initial yaw `0.9`, with a face turned back toward the origin (`atan2(-x, -z)`). Other clusters are rare and must stay well clear of that one (`LANDMARK_CLEAR`, and the 320 m check). The sun shadow frustum is only ±30 m around the bike, so a pyramid does not cast a long shadow until you are next to it.

## Cat rider

`src/assets/riders/cat.glb` is the mesh. `src/assets/riders/cat-ref.jpg` is the style anchor for any later animal. The measured front is +Z (face on the +Z render, tail toward −Z, belly −Y), so the mount quaternion is identity:

```js
model.quaternion.setFromUnitVectors(ASSET_FRONT, BIKE_FORWARD);
```

Do not replace that with `rotation.y = Math.PI`. A check that transforms `ASSET_FRONT` by the same quaternion is a tautology. Confirm facing from a render, or from a cue the mount was not built from.

Vite 8 does not treat `.glb` as an asset. `vite.config.js` has `assetsInclude: ['**/*.glb']`, and the import is `cat.glb?url`. A bare import, or `?import`, makes Vite parse the binary as JavaScript.

Wind is a vertex shader, not a second mesh and not a CPU pass over the vertices. At load, `paintWind` writes `aWind` (x = tail, y = ear) from **geometry-local** positions, before the group scale of about 1.9. `onBeforeCompile` patches `MeshStandardMaterial` and a `MeshDepthMaterial` assigned to `customDepthMaterial`, or the shadow stays rigid. `beginnormal_vertex` runs before `begin_vertex` in the r186 chunks, so the color material calls `computeWind` from the normal chunk. `MeshDepthMaterial` only runs `beginnormal_vertex` with a displacement map, so the depth material calls it from `begin_vertex`. These materials are still GLSL1 (`attribute`, `#include <begin_vertex>`; `out` is a reserved word).

The tail bends as a 5-joint chain (`uTailPivot`), rotated tip-first. It does not translate vertices. The cat mesh is two unstitched shells, and the tail runs across both. `tailDistances` walks the surface from the tip with Dijkstra, which only reaches one shell. That walk traces the spine and the tube radius. Every vertex inside the tube, on either shell, takes `aWind.x` from its closest point on the spine. Keep the distances in a `Float64Array` and settle each vertex once: a `Float32Array` made the heap loop never end and froze the page at load.

`Bike.update` calls `this.rider.userData.animate(time, s)` with `{ throttle, boost, speed, lean }`. The old capsule rider and its twin-tail loop are gone. Do not add another animal unless asked.

## Verify

Load the page and look. For a heading, prop, or collider change, a numeric self-check plus one screenshot beats reading the code. Headless Chrome on this machine works: start it and the script in the **same** shell command (a `Start-Process` Chrome dies when that shell exits), attach the debugger to a `type === 'page'` target from `/json`, and not to the browser-level socket (`Runtime.enable` is missing there). `?nopost` keeps a WebGL failure from being hidden under a bloom pass. `?demo` will steer away from whatever you were trying to frame.
