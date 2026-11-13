# Desert Rider

Endless hover-bike prototype (three.js r186, Vite 8) with six levels: desert, rainforest, grassland, snow mountains, volcano and seabed. Procedural terrain, one generated cat rider, and streamed props. There is no test runner. `README.md` is stale: it still says the rider is primitives and that there are no external models. Trust the code.

The page copy is zh-Hant. Keep new player-facing strings in Traditional Chinese. The HUD counters are wired to the war: 擊破 is foes the player shot, 捕獲 is foes in jail, 夥伴 is friends still free.

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

- `?level=rainforest`, `grassland`, `snow`, `volcano`, `ocean`, `jail` or `penalty`. No flag is the desert.
- `?swarm=N` sets the swarm size (default 494, so the teams are 250 each; up to 10000).
- Holding V runs the frame at `SLOW_MO` (a quarter) of real time.
- `?demo` holds W and weaves with A/D. Useless for checking a fixed heading.
- `?nopost` skips bloom and FXAA. `?nobloom` skips bloom only.
- An MSAA render target plus `UnrealBloomPass` draws a blank frame here. AA stays on `FXAAPass`.

`window.__game` is `{ player, bike, house, ghosts, setCoins, coinCount, terrain, chase, camera, renderer, input, eruption, rivals, coinRain, swarm, war, weapons, route, jailCoins }` (`eruption` is null off the volcano). The speed and gap readout refreshes about every 80 ms. The fps line, including the camera mode name, refreshes once a second.

A ~98 MB reference mp4 sits untracked in the repo root. The game does not load it. Do not commit it.

## Controls

Keyboard stays on `Input`. `Input.poll` runs once per frame and reads one standard gamepad through `readGamepad`.

Steer is positive to the rider's left, the same sign as KeyA. A standard pad's axis 0 is positive to the right, and that negation happens only in `readGamepad`. The right stick's positive X matches a mouse drag to the right: chase `orbit` decreases. Do not flip either sign in `player.js`.

RT or left-stick up throttles, LT or left-stick down brakes, the left stick and d-pad steer, A jumps, E (keyboard), X or LB holds boost, Y cycles the camera, the right stick orbits. R or B (keyboard), pad B fires the air cannon; T, pad RB the machine gun; N, pad View spends 10,000 coins to move on a level; Backspace, pad Menu resets, or starts a new war once one is won (as Enter does); the number keys, pad L3 / R3 step the level picker back / forward; L, pad Guide (button 16) pauses and resumes. Every keyboard action has a pad button: `PAD_KEYS` in `player.js` maps each `readGamepad` button to the key it presses in `Input.poll`, once per press (the level steps press `PadLevelBack` / `PadLevelForward`, which no key has). Analog throttle uses the existing thrust term. The player's bike is a `flyer`: its boost never runs out of energy and climbs slowly to `FLY_TOP` (300 km/h), and past `FLY_FROM` (270 km/h) `lift` raises the hover height and field by up to `FLY_H` (5 m), so it flies low; rivals keep the old boost. Chrome hides the pad until the page is focused and a button has been pressed.

## Coins

`src/coins.js` lays 100,000 coins on one straight trail in the desert, along the road. The road (`src/road.js`) runs straight from the start along yaw 0.9 on the six racing levels: `clearRoad` in `terrain.js` hides every prop piece whose bounding sphere reaches it and drops its colliders, slopes, hazards and breakables (the landmarks at (149, 118) sit on it and are gone); `lavaAt` keeps it dry, and `roadMask` cuts the volcano cone and the seabed's trenches and seamounts away along it. From the second level on the trail is only `EXIT_COINS` (6) discs, and `coinExit` past the last one is a glowing 出口 gate (`src/exit.js`); driving through it sends the player back a level. Once the discs are gone, `CoinFinder` points at the exit. Each disc is 2.8 km across (`COIN_R` 1400) and adds 10,000 to the 金幣 counter (`COIN_WORTH`). The readout is the small-coin total, not how many discs were picked up. The center is lifted by the radius (`COIN_LIFT`) or the bottom sinks into the sand, and `Y_REACH` has to cover that lift or a bike on the ground cannot collect. Do not put a second copy of either number in `player.js`.

Only coins near the bike get a mesh. `coinsInChunk` buckets the trail by chunk, and `coinsNear` binary-searches the forward projection. `Terrain.update` keeps the chunk under a coin while its disc reaches the view (`VIEW_RADIUS` reach plus `COIN_R`). Without that, a coin this size never streams in. Fog far and the camera far plane sit past the rim. The disc material ignores fog, so the next disc shows through any level's haze. Nudge only slides the hub out of a solid.

`CoinFinder` (`src/finder.js`, every level) floats a yellow `Pointer` 20 m ahead and 7.5 m up, above the ice arrow, at the nearest uncollected disc center within 6 km (`nearestCoin`), until it is collected.

Coin rain (`src/coinrain.js`): within `ZONE` (`COIN_R` + 500 m) of any disc center, collected or not, up to 3,000 small coins fall at 12–28 m/s in a 130 m box around the bike, spawned ahead by its velocity, lie on the ground `REST` seconds, and recycle. Every 6–10 s a burst drops 250 of them in a 14 m column just ahead. One in 20 is a jackpot coin, twice the size, tinted past 1 so it glows, worth `JACKPOT_WORTH` (1,000). Density fades over the last `FADE` metres. The bike picks one up within `PICK`; each adds `RAIN_WORTH` (100) through `addCoins` and plays `chime`. `take(coin)` lets others remove one; `active` lists the live ones.

## Frame

Bike space is **+Z forward, +Y up, +X to the rider's left**. This is not three.js's default Object3D forward of −Z.

`player.forward` is `(sin(yaw), 0, cos(yaw))`. `bike.root.rotation.y` is `player.yaw`. The chase camera sits behind that same vector. One yaw, one forward. Do not invent a second `sin`/`cos` pair for movement, facing, or camera placement.

`rotation.y = yaw` sends local +x to `(cos yaw, 0, −sin yaw)` and local +z to `(sin yaw, 0, cos yaw)`. Prop meshes and their colliders both go through `yawOffset` in `src/props.js`. A new prop that rotates with `rotation.y` and then places colliders with its own `cos`/`sin` will sit off its hit volume.

## Levels

The desert has cacti (`LEVEL.cacti`, `src/cactus.js`), placed on their own seed after the chunk's props. They have no collider: `Terrain.cactiTouching` sweeps the bike's path, and `stickSpines` in `main.js` adds a green cactus's id to `war.spines` (saved; drawn on the bike by `Bike.setSpines`; 尖刺 in the HUD) and withers it yellow (`Terrain.wither`). Swarm bikers and rivals wither what they touch too (`Terrain.witherAt`), and a yellow cactus gives nothing. `Terrain.withered` keeps them yellow when a chunk streams back; only the player's are saved. `SPINES_FULL` (30) empties the list, turns every cactus green and restarts the player through `die`, coins kept. The penalty jail has cacti too, only outside the glass block (ids prefixed `p`): there a spine sends the player back to the jail, and the one that fills the bike sends it to the desert. Other riders there wither and count theirs in `war.pricks` (saved) and move the same way (`prickRider`).

`LEVEL` is fixed for the page load. `heightAt`, the chunk props, the sky, the fog and the dust tint all read it at import time, so the picker (HUD buttons, number keys) reloads the page with `?level=` instead of swapping the world in place. Keep the other URL flags when switching (`switchLevel` does).

The rainforest uses `jungleHeight` and `buildJungleProps`; the desert code paths are unchanged. Trees, palms, ferns and boulders are one `InstancedMesh` per kind per chunk, and `disposeChunk` disposes them. Trunks, palms, boulders and the temple shrine have colliders. Ferns and canopy do not. Jungle placement seeds from `hashSeed(cx + 3000, cz - 3000)`, separate from the desert seed.

The jungle landmark at `(149, 118)` is a stepped temple on the pyramid slope record. `flatY` caps `pyramidFace` at the shrine terrace. Each terrace's outer edge sits half a step above the taper, and the stairway on the face toward the origin lies on it. The fog is much shorter than the desert's (far 1500).

The grassland uses `plainsHeight` and `buildGrasslandProps` (acacias, granite outcrops, a giant acacia at the landmark spot). Its tall grass is `src/grass.js`, not chunk props: 20 m tiles of pooled `InstancedMesh` tufts within 100 m of the bike, thinned by `count` toward the rim (tufts are written in random order, so a lower count thins evenly). The grass shader replaces `project_vertex` and bends in world space after instancing: wind gusts, the bike parting the grass, blades lying down near the camera, and the rim shrinking to the ground. Grass has no colliders and casts no shadow. Acacia trunk colliders carry `tree`. With one dead ahead (`treeAhead` in `main.js`) the whole screen blinks red under a huge black NO (`#nono`); hitting one (`treeHit`) flips the bike over, hands every coin to the nearest rider (`riderBeside`; the coins just go to 0, since riders keep none) and restarts through `die`. The grassland ground colors are matched to the far grass so the patch rim does not show.

The snow level uses `snowHeight`: a flat valley within ~250 m of the start, ridged peaks up to ~330 m beyond it. `buildSnowProps` places pine stands below `TREE_LINE`, snow-capped boulders, and an emissive ice-crystal cluster at the landmark spot. `LEVEL.ground.steep` sets where the shade (rock) color takes over in `groundColor`; on snow it starts near 40°. Two extras hang off `LEVEL` flags: `Backdrop` (`backdrop: true`, in `terrain.js`) is a low-res ring of the same height field from 700 m to 6 km, sunk 8 m under the chunks, rebuilt every 150 m of travel a few rings per frame so it does not hitch. `Weather` (`LEVEL.weather`, a list of option sets, `src/weather.js`) wraps particles in a box around the camera in the shader; snow is the defaults. The white HUD text gets a darker halo through `body[data-level="snow"]`.

Ice crystals break. A collider may carry `breakable` (the spire record from `crystalCluster`; the cluster's fat core collider belongs to the main spire). Each frame, before `collidersNear` and the physics substeps, `Terrain.smash(pos, pos + vel·dt)` finds breakable colliders on that path, hides the instance, drops its colliders, and returns the spires; `main.js` then plays `Shatter.burst` (pooled instanced shards, `src/shatter.js`) and a frost cloud through `Dust`, trims the bike's speed and shakes the camera. `Terrain.broken` remembers `chunkKey:id` so a smashed spire stays gone when its chunk streams back in. Only snow props return `breakables`.

`IceFinder` (`src/finder.js`) leads the bike to the nearest unbroken spire within 260 m (`Terrain.nearestBreakable`). It beeps an alarm (`alarm` in `src/sound.js`) faster and higher as the spire gets closer, shows the distance in the reticle tag (搜尋中 when nothing is in range), and floats an arrow 14 m ahead and 5.5 m up. Both finders use `Pointer`, a compass card: the outer group takes the bike's yaw, the card tilts back toward the chase camera, and the needle turns by the bearing minus the yaw, so tip up is straight ahead and tip left means steer left.

The volcano level uses `volcanoHeight`. `src/lava.js` holds `VOLCANO` (a 460 m cone about 1.5 km out, with a crater) and `lavaAt` (0..1: warped plain channels, streams down the flanks, the crater lake); the height field carves the lava 4 m down. With `LEVEL.lava`, chunks and the backdrop carry an `aLava` vertex attribute and `patchGround` adds animated emissive past the bloom threshold, driven by `groundUniforms.uTime`. `lava.js` exists so `terrain.js` and `volcano.js` do not import each other. `buildVolcanoProps` places basalt column stands, ember rocks and charred trees only where `lavaAt` is dry, and the lava pool at the landmark spot returns `props.vent`. `main.js` hangs a `Plume` (`src/plume.js`) over the crater and the pool. The volcano also uses the backdrop and two `Weather` sets (rising embers, falling ash). `LEVEL.sky.cloud` tints the clouds.

Lava kills. In `main.js`, `inLava` is true when the bike is within 2.5 m of the floor over `lavaAt > 0.5` or inside the pool (`props.vent`), so a jump clears a channel. The pool's only safe way in is a basalt causeway from the opening in its rim (which faces `gap + π`, not `gap`) to a platform in the middle. It is a slope record with its own `faceAt`, which `floorAt` uses in place of `pyramidFace`, and `vent.onDeck` exempts it from the lava check. The small plume rises from `vent.plume` on the far side. `die` hides the bike, flashes `#burn` and shows `#alert`; after `DEATH_TIME` `respawn` puts the bike back at the start with the initial yaw and snaps the chase camera. `Eruption` (`src/eruption.js`) blows the crater every 9–15 s (the first after 3–5 s): an ash column whose puffs launch once and climb, wide lava bombs that land on the cone, and a dozen bombs aimed ballistically at where the bike is heading, at any distance. Between eruptions `aim` lobs one bomb every 0.5–1.2 s at the ground `SHOWER_MIN`–`SHOWER_MAX` (25–110 m) from the bike's predicted path, so lava keeps falling nearby without targeting the bike itself. A bomb that passes through the bike or splashes next to it kills it, except for `GRACE` seconds after a respawn. `window.__game.eruption.next = 0` forces an eruption.

The ocean level uses `seabedHeight`: broad slopes stepped into reef terraces, seamount ridges (up to ~220 m) in some regions that break the surface as islands, scattered knolls (up to 125 m, the nearest ~200 m from the start) whose tops stand just above the water, and winding trenches along the zero line of a warped noise field. A trench drops `TRENCH_DEPTH` (100 m) down ~60° walls, then an abyss slot down its middle falls `ABYSS_DEPTH` (200 m) more to about -300 m, steep enough that a bike that falls in does not climb out. A `calm` mask keeps the start (out to ~150 m) and the shipwreck on flat sand and keeps trenches and seamounts away from both.

The water surface is `LEVEL.sea` (110 m; the start is ~86 m under it). `src/sea.js` draws it as a camera-following plane, bright and rippling from below and deep blue from above, and sets the light by camera depth: below ~90 m the fog, sky and lights fade toward `LEVEL.abyss`, and above the surface the fog and sky switch to `LEVEL.air` and the `Weather` sets hide. `LEVEL.ground.deep` darkens the ground color with depth (`from` and `span` are absolute heights), `LEVEL.ground.island` dries out the ground above the surface, and the caustics fade out between 60 and 200 m under the surface.

`buildReefProps` places kelp forests and coral gardens by two noise fields, leaves slopes steeper than `STEEP` and anything above `DRY` (just under the surface) bare, and below `DEEP` (-35 m) grows glowing anemones and tube worms instead. A second pass on its own seed (`ABYSS_TRIES` samples, kept only below `ABYSS`, -150 m) packs the abyss floor with bigger clusters, so the reef above keeps its layout. They are unlit `MeshBasicMaterial` with instance colors past 1, so bloom picks them up. The glowing life kills: each cluster returns a hazard `{ x, z, r, top }` in `props.hazards`, `Terrain.hazardHit` checks the bike against them, and `main.js` calls `die`. It also places reef rock piles and a shipwreck on its side at the landmark spot with colliders down its keel. Kelp sways in its own vertex shader (`swellUniforms`); only big brain corals, rocks and the wreck have colliders. `LEVEL.caustics` makes `patchGround` brighten the lit ground with a tileable water-caustic loop. The sky reads as the water surface from below: `sky.hazeTop` keeps the fog color high above the horizon, and fast bright clouds (`sky.cloudSpeed`) stand in for surface ripples. `FishSchools` (`src/fish.js`) keeps seven schools wandering near the bike under the surface, wiggles tails in the vertex shader with `gl_InstanceID`, scatters fish away from the bike, and respawns schools that fall 150 m behind. Fog is short (far 420). Bubbles and marine snow are two `Weather` sets.

## Day, night and the house

`src/daynight.js` keeps one clock for all levels: a 24-hour day is `DAY_LEN` (300) real seconds, from `Date.now()` plus an offset saved in localStorage `desert-racing-clock`, so reloads keep the hour and `skipToMorning` can move it. `Nightfall` resets the sun, hemisphere light, fog, sky colors and exposure to their daytime values every frame, the sea's own light runs, then the night darkens what is left; the sky shader takes `uNight` for stars, a moon and a fading sun.

`src/house.js` is the player's house. At 50,000 coins the player pays them and owns it (`desert-racing-house`); it is placed ahead of the bike on every level, clamped inside the pen or room when locked up. Solid by day. At night, once per cycle, driving in sleeps 20 s with no hits (`sleeping`, `protect`), the camera waits out front under the 「沉睡中，請勿打擾」 sign, then it is 6:00 and pays 30,000. C (the horn) while asleep wakes early with no pay, and a clock stands by the door the rest of that night (C only cycles the camera when awake). The HUD draws the same clock face (`drawClock`) beside the time readout. `src/ghosts.js` chases a player with no house at night; a touch slows and scares it.

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
| `src/riders/animals.js` | Primitive animal riders for the rivals |
| `src/cactus.js` | Desert cacti |
| `src/rivals.js` | Rival AI racers, bike-to-bike collisions |
| `src/swarm.js` | Thousands of instanced animal bikers around the player |
| `src/coinrain.js` | Small coins raining around the big discs |
| `src/sound.js` | Synthesized crash, finder alarm, coin chime |
| `src/terrain.js` | `heightAt`, chunk streaming, prop hookup |
| `src/props.js` | Ruins, pillars, rocks, sphinx, pyramids, colliders |
| `src/jungle.js` | Rainforest trees, palms, ferns, boulders, stepped temple |
| `src/grassland.js` | Prairie acacias, outcrops, giant landmark tree |
| `src/grass.js` | Streamed tall grass with wind and bike parting |
| `src/snow.js` | Snowy pines, capped boulders, ice crystals |
| `src/weather.js` | Snow, ash and ember particles around the camera |
| `src/shatter.js` | Ice shards when a crystal is smashed |
| `src/finder.js` | Pointing arrows: ice crystals (with alarm), big coins, friend and foe |
| `src/teams.js` | Team colors and the flag geometry |
| `src/war.js` | Team war state across levels, saved in localStorage |
| `src/weapons.js` | Air cannon and machine gun shots |
| `src/jail.js` | The jail level's two fenced pens, jail coins, secret route |
| `src/penalty.js` | The penalty jail's rooms, doors and coin machines |
| `src/outside.js` | Creepers, villagers, spiders and coins outside the penalty jail |
| `src/tears.js` | Tear drops for the losing team in the arena |
| `src/lava.js` | Volcano cone position and `lavaAt` |
| `src/volcano.js` | Basalt columns, ember rocks, dead trees, lava pool |
| `src/plume.js` | Smoke columns over the crater and the pool |
| `src/eruption.js` | Random eruptions: ash column, lava bombs |
| `src/reef.js` | Kelp, corals, reef rocks, shipwreck |
| `src/fish.js` | Fish schools that scatter from the bike |
| `src/sea.js` | Water surface, depth light and fog, air above the islands |
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

The player no longer rides the cat. `src/chooser.js` opens a picker on a fresh tab (sessionStorage `desert-racing-rider-picked`, so level reloads skip it) and from the × beside the headline; the choice is kept in localStorage `desert-racing-rider`. While it is open `main.js` freezes the world and `showRider` circles the camera in front of the bike, turned toward the sun. The riders are `ROSTER` in `src/riders/roster.js`: 仙人掌先生 and 硬幣先生 are built there, horse and zebra have their own `buildHorse` (arched neck, nose-down long face, hooves), the other animals go through `buildAnimalRider` with their own specs (kept out of `SPECIES`, whose furs color the swarm). `Bike.setRider` swaps the rider in place. Riding 仙人掌先生, a rider that bumps the bike pays the player 300,000 (`CACTUS_FINE`), in the desert also takes a spine in `war.pricks`, and `rider.userData.hit` dries the cactus yellow for about 30 s. 炸彈方塊人 ignores lava, drops 炸藥 crates with L (`src/tnt.js`; crates are weapon targets of team -1, so any shot sets one off and every rider within `REACH` pays the player 50,000), and locked up N blows him out a stage. P pauses (the pad's Guide button is P); L pauses for everyone else. Cacti never hurt 仙人掌先生; any other rider pays 300 per green cactus (`CACTUS_HIT`) and the 30th spine sends it to the jail. The cat GLB is still the `Bike` default but nothing passes it now.

`Bike.update` calls `this.rider.userData.animate(time, s)` with `{ throttle, boost, speed, lean }`. The old capsule rider and its twin-tail loop are gone.

## Rivals

Every level has five animal rivals on the same hover-bikes (`src/rivals.js`, lineups per level in `LINEUP`). Their riders are primitives from `src/riders/animals.js` (`SPECIES`, `buildAnimalRider`), not GLBs; the cat stays the player's. `Bike` takes `{ rider, veinColor, lights }`: rivals pass their own builder, a vein color, and `lights: false` (ten extra point lights cost every lit material). Each rival drives its own `Player` through a fake input (`pad` plus `hit('Space')`), so hover, slopes and colliders match the player. It aims for a slot ahead or behind and to one side of the player that drifts over time, swerves around colliders, boosts to catch up and hops lava. Past `LOST` (320 m), in lava, on a seabed hazard or 80 m under the player, it respawns 70–110 m behind the player. `regroup` puts them back on the start grid on respawn and on R.

Bikes collide as cylinders (`BIKE_R`, `BIKE_H`) and trade closing speed with some bounce. `src/sound.js` `crash(strength)` synthesizes a loud hit (noise, thump, metal clang through a compressor). It plays for bike-to-bike hits and for hard hits into colliders (`Player.bump`, the closing speed at the push-out), faded with distance from the camera. Audio starts on the first key, click or touch.

The swarm (`src/swarm.js`) is 494 more animal bikers by default, `?swarm=N` for 0–10,000. Each is one simplified bike-and-rider geometry (vertex colors; white parts take the instance color as fur) in one `InstancedMesh`, plus a nozzle-glow `InstancedMesh` that shares its `instanceMatrix`. The matrices are written straight into the array (yaw, then lean). They move kinematically over `heightAt` (not `floorAt`, so they pass through pyramids), refreshing the ground every frame within `NEAR` of the camera and one `SLICES`th of the rest per frame. At a level's start (before the first `update`) each gets its own spot on a sunflower spiral over the same 80–380 m area, turned a random way per load, so nobody starts bunched. The rivals' start grid (`GRID`) is spread 45–140 m out. Every 4–12 s each picks a goal: orbit the player, roam, chase the player, or drive to a coin-rain coin and `take` it. Past `FAR` (420 m) one respawns 120–380 m around the player. They ignore props and each other, and bump the player with the crash sound (0.3 s cooldown). 1,000 cost ~0.6 ms a frame, 9,500 ~7 ms.

## War

`src/war.js` holds the team war across the levels, saved in localStorage (`desert-racing-war-2`; bump the key to send everyone back to the first level) so it survives the reload a level change needs. Every rider has a stage: 0–5 is its level (`LEVEL_ORDER`), `JAIL` (6) the jail, `PENALTY` (7) the penalty jail. Ids: 0 the player, then the rivals (`rivalBase`), then the swarm (`swarmBase`). A rider shot by the other team moves on a stage (`hit`); from the ocean it goes to jail. `send(id, stage)` moves a rider anywhere (bail, penalty). The team with all its riders locked up (jail or penalty jail) loses; `main.js` shows the winner and Enter starts a new war. Only riders whose stage is this page's level are on screen (`placeRider`: swarm `setState` OFF / DRIVE / PARKED, rivals `setActive`). The rest play on off screen in `War.update`, about once a second: free riders are shot at a rate that grows with the foes on their level, jailed riders stay jailed, penalty riders bail back to the jail (`PENALTY_BAIL_RATE`). The page sets the player's stage, so the picker moves the player too. The save also carries the player's coins and kills.

`src/weapons.js`: the air cannon throws one slow ring (`AIR`), and its owner cannot fire another until it is gone; the gun (`GUN`) fires a burst of four tracers. Shots hit only the other team, die on the ground (`heightAt` above them), and look up targets through a 24 m grid rebuilt each frame from `targets` (reused objects from the swarm and rivals, plus the player). Swarm and rival foes shoot at the player when it is ahead and close (`AIM_CHANCE`, `AIM_ERROR`), and everyone fires wild now and then. Standing still in the full desert, the player lasts about 20–25 s after the 6 s of spawn protection (`PROTECT`). A shot player with 10,000 coins (`SHIELD`) drops to 0 coins and stays; without them, `playerShot` sends it on a level, or to jail, after 1.6 s.

The jail is a seventh level (`LEVELS.jail`, `?level=jail`, 7 in the picker, `PICKER` in `levels.js`): a flat yard (`heightAt` is near zero) with two pens fenced by iron bars (`src/jail.js`), red around the origin and blue beside it, each with 500 parking slots (`penSlot`). Bars are 2.2 m apart with colliders, so the bike's padding cannot pass. Locked up, everyone keeps the same rules as the player. Jailed swarm riders drive inside their team's pen (`Swarm.confine`, a box they cannot leave), under the jail top speed, fire, and pick up the coins that land in their box (`coinSources`, each pen has its own `JailCoins`); they stay there; now and then one speeds (`onSpeed`) and goes to the penalty jail. A shot only knocks dust off a locked-up rider; it does not move stage. Jail is jail: nobody bails out of it (not the player, not the swarm, not the off-screen riders). The only way out is the secret route below. There is no coin rain in jail. `JailCoins` (`src/jail.js`) lobs ten coins a second on long arcs from 25–60 m outside the fence into the player's pen (`penBounds`), and a coin that lands stays until picked up, so the pen fills over time (up to 4,000). A plain coin counts 1 toward bail and is worth 100; one in eight is big (twice the size, counts `BIG_COUNT` 10, worth 1,000); every 30–45 s a super coin, a standing 24 m disc like the ones outside, falls in from 160 m up (counts `SUPER_COUNT` 20, worth 10,000). Locked up (jail and penalty jail) anything over `JAIL_TOP` (200 km/h) is speeding (at most once per `FINE_GAP`, 5 s): the player pays `FINE` (10,000 in the jail, 100 in the penalty jail, into debt if need be; the coin count can go negative), and in the jail is also sent straight to the coin jail. Speed from a shove does not count: rivals and swarm bikes that push the player set `Player.shoved` (1.5 s). Boxed swarm riders keep under 85 % of `JAIL_TOP` and no longer speed into the penalty jail. Coins picked up only add to the count. The reticle tag says how to get out.

The other way out is a secret route (`ROUTES`, one per pen, the blue one mirroring the red; `ROUTE_W` 4 m either side). Each fence has no bars where its route crosses its south side, but the gap is held by invisible `gate` colliders that `main.js` filters out only while the player holds `SEE_ROUTE` (140,000) coins. Pens, routes and arena are laid out at `GROW` (1.5) times their first size. Past the fence each route winds about 450 m, walled by `ROUTE_WALLS` (colliders with no mesh), into the fenced `ARENA` where both meet. `RouteOverlay` draws the glowing roads, ghost walls and six big coins per route (`ROUTE_COIN`, 10,000 each; they can be picked up seen or not) only for a rich player; the 終點 banner over the arena shows to anyone near. Entering the arena ends the war: the team with more riders free wins, but only if the player holds `WIN_COINS` (200,000), otherwise it is a draw (`DRAW`, restarts by itself after 6 s). After a win `startArena` brings `ARENA_CROWD` (40) riders of each team into the arena: the losers cry (`Swarm.crying`, tear drops from `src/tears.js`, `sob` from `src/sound.js` near the camera) and the winners can shoot them; a crying rider that is hit starts over elsewhere in the arena. Nobody's stage changes; Enter starts the next war. The result banner uses the smaller, wrapping `.alert.result` style.

The penalty jail is an eighth level (`LEVELS.penalty`, `?level=penalty`, `src/penalty.js`), for a player caught speeding in the jail: the coin jail, a huge glass block of 12×12 rooms 90 m across on a flat floor, one rider to a room (`roomOf(id)`; the player in room 0 at the origin). Every inner wall is two see-through glass panels with a brown door between them, all breakable through the same `Terrain.smash` path as ice crystals (each record carries `x, z, baseY, h, w` for the shards and dust, and `door.rooms`); `main.js` gives the level a `Shatter` of glass shards. Breaking a panel or door joins the two rooms in `RoomZones`, and the boxed riders in them get the joined box. Outer walls break too and join the room to `OUTSIDE`; a zone that reaches it gets `OPEN`, the floor 600 m past the block. The other riders play by the same rules: `penaltyRiders` in `main.js` has a boxed rider ram a wall of its room every `WALL_EVERY` (30) s each on average. A coin fountain over every room sprays coins up and out to 38 m (`JailCoins` with `machines` and `fountain`), 70 a second, 60 % from the fountain over the bike's own room, big coins only (`mix`: 70 % big worth 1,000, 30 % huge worth 10,000; coin `KINDS` in `jail.js`), plus a 100,000 super coin every 3–6 s. Outside the block (`LEVEL.outside`, `src/outside.js`, own seed) stand blocky creepers, villagers and black spiders, coins marked 50 and rare 10萬 coins, thick or thin by `density`. Each is a breakable record carrying `mob` or `coin`, so `Terrain.smash` takes it off the bike's path and `metOutside` in `main.js` handles it: a creeper blows the player back to the desert (`war.send(0, 0)`), a villager costs 300, a spider 200. Swarm riders outside meet creepers through `Terrain.breakAt` and go back to the desert too. Coin rain falls outside, with `coinRain.zone` set to `density`. There every coin counts 1 toward bail (`pieces`), and 300 send the player back to the jail (`BAIL`). In the jail itself coins pour in at 25 a second, three in ten big, a super coin every 10–15 s.

Only the player's bike has spikes (`Bike({ spikes: true })`): a small pyramid point on the nose and nine spikes out the back. On racing levels a swarm rider or rival inside the box behind it (`SPIKE_BACK`, `SPIKE_SIDE` in `main.js`) is pricked: it would pay `SPIKE_FINE` (35,000,000) to the player, but nobody else keeps coins, so it starts over on the first level (`war.send(id, 0)`, or back to a start spot if it is already there).

Teams (`src/teams.js`): the player's team (`FRIEND`) flies red flags, everyone else (`FOE`) blue. `flagParts` is one pole-and-cloth geometry at `FLAG_MOUNT` (the right rear corner, so the player's pole stays off the middle of the view), used by `Bike({ flag })` (the flag swings about its pole) and by a third swarm `InstancedMesh` sharing the swarm's `instanceMatrix`, tinted per instance. The teams come out even: `main.js` gives the swarm `friends` = half of everyone (player + rivals + swarm) minus the player and the red rivals, so the default 494 makes 250 red (the player, two rivals, 247 bikers) and 250 blue (three rivals, 247 bikers). Friends orbit closer and more often. `TeamFinder` (`src/finder.js`) points a glowing red `Pointer` 5 m to the left at the nearest friend and a black one 5 m to the right at the nearest foe, 12–400 m away, through `nearest(team, pos, range, min)` on the swarm and the rivals.

## Verify

Load the page and look. For a heading, prop, or collider change, a numeric self-check plus one screenshot beats reading the code. Headless Chrome on this machine works: start it and the script in the **same** shell command (a `Start-Process` Chrome dies when that shell exits), attach the debugger to a `type === 'page'` target from `/json`, and not to the browser-level socket (`Runtime.enable` is missing there). `?nopost` keeps a WebGL failure from being hidden under a bloom pass. `?demo` will steer away from whatever you were trying to frame.
