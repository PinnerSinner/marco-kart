# MARCO KART: build specification (v1)

A browser kart racer in Three.js, in the spirit of the classic kart-racing genre, but every corner of it is about **Marco**:
a British cloud and networking instructor living in Copacabana, Rio de Janeiro, who runs the "Marcoverse" brand.
Target quality: **AAA-feeling polish**: tight driving feel, gorgeous stylised visuals, juicy effects, great menus, great audio.
Everything ships as ONE self-contained HTML file (esbuild bundle, three included, no network at runtime).

Read this whole file before writing code. It is the contract between five people working in parallel.

---------------------------------------------------------------------------------------------------

## 0. Rules that apply to everyone

1. **Original IP only.** Genre mechanics (drifting, item boxes, laps) are fine. Do NOT use, imitate or name any Nintendo
   (or other publisher) characters, logos, tracks, item art, music or sound. No "Mario", "Luigi", "Rainbow Road", mushrooms,
   shells, bananas, stars-with-faces, Lakitu, etc. Items, characters, tracks and music are the ones defined in this spec.
2. **British English** in all user-facing strings ("colour", "tyre", "organise", "kerb", "Grand Prix"). Marco is British.
3. **Node-importable.** Every module outside `src/ui/`, `src/audio/` and `src/core/input.js` must import cleanly in plain Node
   (no `window`/`document`/`localStorage` at import time) so logic can be unit tested headlessly. `three` imports fine in Node.
4. **Fixed timestep.** Simulation runs at 60 Hz (`CFG.fixedDt`). Rendering interpolates. Simulation code never reads the clock.
5. **No per-frame allocations in hot paths** (physics step, AI think, RaceView update, particles). Reuse Vector3s / scratch objects.
6. **Graceful assets.** Marco's photos/voice may or may not exist. Everything must look and work great with zero user assets, and
   *upgrade* when `Assets.has('marco_face')` etc. (see `src/core/assets.js`).
7. **Storage guarded.** `localStorage` may throw or be absent (sandboxed iframe). Wrap every access in try/catch with an in-memory fallback.
8. **Performance budget** (mid-range laptop, 1080p, 8 karts): 60 fps; < 400 draw calls; < 500k triangles on screen; textures <= 2048px;
   instance repeated scenery (`InstancedMesh`); merge static geometry; three quality tiers `low | medium | high` (see settings).
9. **Do not edit files you do not own** (table in section 1). Contract files (`src/core/*`, `src/track/StubTrack.js`,
   `src/kart/SimpleKart.js`, `SPEC.md`, `tools/*`) are read-only for you. If you need a change, append a dated note to
   `/home/claude/marco-kart/REQUESTS.md` and carry on with a sensible local workaround. Extra constants you need go in your OWN module.
10. **Do not spawn sub-agents.** Do not run `npm install` (three r0.186.1 and esbuild are installed). Do not touch `dist/`.
11. **Quality bar for code:** small focused modules, JSDoc on every public class/function (params, units), no dead code, no `console.log`
    spam (use `console.warn` for real problems only), defensive against NaN (kart physics must never produce NaN).
12. **Finish properly.** Run your tests and your screenshot demos, look at the screenshots (Read the PNGs), fix what looks wrong, iterate
    until you would be proud to ship it. Then send the final report described in section 11.

---------------------------------------------------------------------------------------------------

## 1. Repo layout and ownership

`/home/claude/marco-kart/`

| Path | Owner | Notes |
|---|---|---|
| `src/core/{config,bus,util,roster,assets}.js` | CONTRACT (read-only) | shared constants, event bus, math, roster, asset registry |
| `src/track/StubTrack.js`, `src/kart/SimpleKart.js` | CONTRACT (read-only) | interface fixtures for testing |
| `src/main.js`, `src/core/game.js`, `src/core/renderer.js`, `src/core/loop.js`, `src/core/state.js` | LEAD (integration) | do not create these |
| `src/kart/KartPhysics.js`, `src/kart/collisions.js`, `src/kart/ChaseCamera.js`, `src/core/input.js`, `src/audio/**` | **A1 DRIVE** | physics, camera, input, audio |
| `src/track/Track.js`, `src/track/builders/**`, `src/track/index.js`, `src/track/tracks/copacabana.js`, `src/track/tracks/blighty.js`, `src/track/TRACKDEF.md` | **A2 TRACKS** | track engine and tracks 1 and 2 |
| `src/race/**` (Race, ItemManager, itemDefs, AIDriver, AutoDriver, GrandPrix) | **A3 RACE** | rules, items, AI, GP |
| `src/ui/**` | **A4 UI** | all DOM screens, HUD, menus |
| `src/visuals/**` (factory, RaceView, environment, postfx, itemMeshes), `src/fx/**`, later `src/track/tracks/datacentre.js` and `marcoverse.js` | **A5 VISUALS** | characters, karts, items, FX, sky/lighting/postfx |
| `test/<area>_*.test.js`, `test/demo_<area>_*.js` | each owner (prefix with your area: `drive`, `tracks`, `race`, `ui`, `visuals`) | |
| `shots/<area>/` | each owner | your screenshot output |

Tooling (already set up):
- `npm test` runs `node --test "test/**/*.test.js"`.
- `node tools/shot.mjs <entry.js> <out.png> [--wait ms] [--shots n] [--interval ms] [--w px] [--h px] [--keys a,b]` runs an ES-module
  entry in headless Chromium with software WebGL2 and saves screenshot(s). The page already contains `<canvas id="game">` and
  `<div id="ui-root">`. Set `window.__ready = true` when the first frame is drawn. It prints console errors and exits 1 on any.
  `test/demo_stub.js` is a working reference. Look at your PNGs with the Read tool; that is how you review visuals.
- `node tools/build.mjs` bundles `src/main.js` (does not exist until the lead integrates).
- Software WebGL is slow: keep demo resolutions modest (`--w 960 --h 540`) and use `--wait` generously (3000 to 8000 ms).

---------------------------------------------------------------------------------------------------

## 2. Conventions (every module relies on these)

- Units: metres, seconds, radians. **Y up.** Ground plane XZ.
- **Yaw:** `forward = (sin yaw, 0, cos yaw)`, `right = (-cos yaw, 0, sin yaw)`. Models are authored facing **+Z**; `object.rotation.y = yaw`.
- **Steer +1 = turn RIGHT = yaw DEcreases.** Steer -1 = left.
- **Track lateral:** positive = to the RIGHT of the direction of travel. `s` = metres along the centreline, wraps at `track.length`.
- Kart `pos` is the ground-contact point at the kart's centre (bottom-centre of the body). Visual origin = `pos`.
- `input` object passed to physics each step:
  `{ throttle: 0..1, brake: 0..1, steer: -1..1, drift: boolean (held) }`. (Item use, look-back and pause are edge events handled elsewhere.)
- Colours in `config`/`roster` are 0xRRGGBB numbers.
- Base numbers: kart radius 1.15 m, road width ~18 m, top speed ~ 30 to 36 m/s (HUD shows `speed * CFG.speedDisplayMult` as km/h).

---------------------------------------------------------------------------------------------------

## 3. TRACK INTERFACE (owner A2 implements; `StubTrack` is the reference; A1, A3, A4, A5 consume)

`src/track/index.js` exports `createTrack(id): Track` for ids `copacabana | blighty | datacentre | marcoverse` (later tracks may throw
"not built yet" until A5 adds them: A2 must make the registry easy to extend: `registerTrack(id, def)`).

```js
track.id, track.name                    // strings
track.lapCount                          // default 3
track.length                            // centreline length in metres
track.group                             // THREE.Group: ALL visuals of the world (road, terrain, scenery, sky props, animated bits)
track.environment = {                   // consumed by src/visuals/environment.js (A5) to build sky, lights, fog
  skyTop, skyBottom, fogColor, fogNear, fogFar,          // 0xRRGGBB / metres
  sunDir: Vector3 (unit, pointing TOWARDS the sun), sunColor, sunIntensity, ambientColor, ambientIntensity,
  skyKind: 'day' | 'overcast' | 'dusk' | 'indoor' | 'space',   // hint for sky dome style
  stars?: boolean, clouds?: number(0..1), rain?: number(0..1)  // optional weather hints
}
track.music                             // 'copacabana' | 'blighty' | 'datacentre' | 'marcoverse'
track.checkpointS                       // number[] ascending metres; [0] is the start/finish line (s = 0); 6 to 12 entries
track.itemBoxes                         // [{ pos: Vector3 }]  (pos.y already hover height above the road)
track.obstacles                         // [{ id, kind, pos: Vector3, radius, active: boolean, hit: 'spin'|'bump' }]  MOVING/static hazards; A2 updates pos in update()
track.killY                             // y below which a kart counts as fallen (void tracks); default -40

track.sample(s, out?)  -> { pos: Vector3, tangent: Vector3, right: Vector3, up: Vector3, width: number, banking: number, s }
    // centreline sample; pos includes elevation; tangent unit, follows the slope; up is the road-surface normal

track.query(pos: Vector3, out?, hintS?: number) -> out = {
    height: number,          // ground surface Y directly under pos (continuous; road, verge and terrain)
    normal: Vector3,         // ground normal (unit)
    surface: 'road'|'kerb'|'grass'|'sand'|'boost'|'oil'|'water'|'void',   // SURFACE in config.js
    onRoad: boolean,         // road, kerb or boost pad or oil or water patch that lies on the driving surface
    s: number,               // projected distance along the centreline [0, length)
    lateral: number,         // signed metres from centreline, + = right
    inVoid: boolean          // true where there is NO ground under pos (space tracks, gaps); height should then be -Infinity or killY-ish
  }
    // HOT PATH: called per kart per physics step (8 x 60 Hz, plus AI/items). Must be O(1)-ish: use a spatial hash or a
    // `hintS` local search over pre-sampled points (spacing ~2 m). No allocation when `out` is supplied.

track.collideWalls(pos: Vector3, radius: number, outNormal: Vector3) -> penetrationDepth: number
    // 0 if no overlap. Otherwise the depth and the horizontal unit normal pointing back INTO the track (push direction).
    // Tracks with open edges (marcoverse) return 0 (no walls); the void is the hazard.

track.gridSlot(i) -> { pos: Vector3, heading: number }     // i = 0..7, 2 columns staggered behind the line, i=0 is pole
track.respawnAt(s) -> { pos: Vector3, heading: number }    // safe spot on the road at/behind s, facing forward
track.minimapOutline(n=128) -> [[x, z], ...]               // closed loop points for the HUD minimap
track.update(dt, time)                                     // animate scenery, obstacles (dt seconds, time = total seconds)
track.dispose()
```
Also `track.boostPads = [{ s, lateral, length, width }]` (informational; the surface query returns `'boost'` on them) and
`track.jumpRamps` optional. Elevation, banking, jumps, tunnels, hairpins and shortcuts are encouraged: the query/height/normal contract already supports them.

**Surface behaviour** lives in `SURFACE_PROPS` (config.js): grip and speed multiplier per surface; `boost` triggers a boost pad; `void` = fall.

---------------------------------------------------------------------------------------------------

## 4. KART PHYSICS INTERFACE (owner A1 implements `src/kart/KartPhysics.js`; `SimpleKart` is the fixture; A3, A5 consume)

```js
import { KartPhysics, resolveKartCollisions } from '../kart/KartPhysics.js'   // both exports required
const kart = new KartPhysics(track, { id, charId, kartId, stats })            // stats = statsFor(charId, kartId): each 1..5
kart.id, kart.charId, kart.kartId
kart.pos: Vector3          kart.vel: Vector3          kart.yaw, kart.pitch, kart.roll (radians; pitch/roll = visual attitude)
kart.speed                 // signed forward m/s
kart.maxSpeed              // current effective cap (surface, boost, shrink included)
kart.steer                 // smoothed -1..1 (+ right), for wheel/driver animation
kart.grounded, kart.airTime
kart.slip                  // lateral slip 0..1 (for skid marks and tyre squeal)
kart.drift  = { active: boolean, dir: -1|1, charge: 0..1, level: 0|1|2|3 }     // level 0 none; 1 cyan; 2 amber; 3 magenta
kart.boost  = { time: number, power: number }                                    // seconds remaining, power ~1 normal, 1.6 fibre
kart.status = { spin: s, stun: s (shrunk by outage), invincible: s, autopilot: boolean, respawning: s }
kart.ground = last track.query result (has .s, .lateral, .surface, .onRoad, .inVoid, .height, .normal)
kart.radius, kart.mass, kart.scale                          // scale < 1 while shrunk
kart.update(dt, input)                                       // fixed step; input = { throttle, brake, steer, drift }
kart.applyBoost(power = 1, seconds = 1, kind = 'item'|'drift'|'pad'|'start'|'fibre')
kart.spinOut(seconds = 1.4, cause = 'hit') -> boolean        // false if invincible
kart.shrink(seconds = 6) -> boolean
kart.setInvincible(seconds)
kart.launch(vy)                                              // pop into the air
kart.teleport(pos, yaw)                                      // reset all motion and drift; used for grid + respawn
resolveKartCollisions(karts[])                               // pairwise bumps, mass-weighted; call once per fixed step after all updates
```
Physics emits on the bus (section 6): `kart:drift-start`, `kart:drift-level`, `kart:boost`, `kart:wall-hit`, `kart:bump`, `kart:land`, `kart:surface`, `kart:spin`, `kart:fall`.

**Feel requirements (A1):** arcade, forgiving, satisfying. Smooth acceleration curve; speed-sensitive steering; slight understeer at top speed;
hop-into-drift (hold `drift` while steering), drift arcs tighter in the drift direction, counter-steer widens; charge builds while drifting
(faster when steering into the drift) through 3 levels; releasing gives a mini-turbo boost of 0.6 / 1.0 / 1.5 s; rocket start (throttle
pressed in the last 0.6 s before GO gives an 1.0 s boost: the race module calls `applyBoost(..., 'start')`, physics need only expose the API);
off-road slowdown per `SURFACE_PROPS`; slopes and banking respected (follow ground normal, visual pitch/roll smoothed); ramps launch you
(vertical velocity follows the ground slope while grounded); gravity `CFG.gravity`; landing emits `kart:land`; walls: glancing hits slide
with a small speed loss and a satisfying bump, head-on hits lose more; kart-kart collisions are mass-weighted with a sideways shove;
void: when `ground.inVoid` and below the last surface, fall, emit `kart:fall` once; Race handles the respawn by calling `teleport`.
Stats mapping (1..5): speed maps to base top speed 30 to 36 m/s, accel to 0-to-top in 4.2 s down to 2.4 s, handling to turn rate and drift tightness,
weight to bump impulse and how much boost the kart loses on bumps. Determinism: same inputs give the same results. NEVER emit NaN.

**`src/kart/ChaseCamera.js` (A1):** `new ChaseCamera(camera)`; `.setTarget(kart)`; `.update(dt, { boosting, drifting, lookBack, speedFrac })`;
spring-damped follow behind and above the kart, looks slightly ahead, FOV kick on boost, sideways swing during drifts, ground/wall collision
avoidance is optional, look-back mode, `.startIntro(track, duration)` fly-through along the spline (returns a promise or exposes `.introDone`),
`.startFinish(kart)` orbit for the victory lap. Camera is a plain `THREE.PerspectiveCamera` owned by the lead.

**`src/core/input.js` (A1):** `new InputManager(canvasElement)`; `.read()` returns `{ throttle, brake, steer, drift, itemPressed, lookBack, pausePressed }`
(edge flags true for exactly one read). Keyboard: Arrow keys / WASD steer + accelerate/brake, `Space` or `Shift` = drift (hold), `E` / `Enter` / `Z` = use item,
`C` = look back, `Esc` / `P` = pause. Gamepad (standard mapping, poll every read): RT or A accelerate, LT or B brake, left stick / d-pad steer with dead zone
and response curve, RB = drift, X or LB = item, Y = look back, Start = pause. Touch: auto-created overlay (only when touch detected): left half steer pad or
two big arrow buttons, right side DRIFT and ITEM buttons, auto-accelerate ON by default with a small brake button; overlay must not intercept
non-touch use; `.setEnabled(bool)` and `.setTouchVisible(bool)`; `.bindingsHelp()` returns an array of `{ action, keys: string[] }` for the controls screen;
`.dispose()`.

**Audio (A1), `src/audio/`:** `new AudioManager()` exported from `src/audio/AudioManager.js`:
`.unlock()` (call on first user gesture; safe to call repeatedly), `.setVolumes({ master, music, sfx, voice })` each 0..1,
`.playMusic(key, { fadeIn })` for keys `menu | copacabana | blighty | datacentre | marcoverse | results | podium`, `.stopMusic({ fadeOut })`, `.setMusicIntensity(0..1)`
(e.g. final lap tempo/energy up), `.setRacePlayer(kart)` + `.update(dt, { camera })` drives the **engine sound** of the player (pitch by speed, gear-like steps, drift squeal,
boost whoosh, off-road rumble) and cheap positional engine hums for the 3 nearest rivals, `.playSfx(name, { pos?, volume?, pitch? })`, `.playVoice(key, charId?)`.
Everything synthesised with WebAudio (no external files). It must also react to bus events (section 6) by itself: subscribe in `attach()` / `detach()`.
Music: original loops, generated by a small step sequencer + synths (bass, lead/pluck, pad, drums), each track with a distinct character:
menu = upbeat funk-pop; copacabana = bossa/samba groove; blighty = jaunty brass-band / britpop shuffle with rain ambience; datacentre = pulsing synthwave/techno;
marcoverse = epic trance arpeggios; results = short victory jingle; podium = triumphant fanfare. Loops 45 to 90 s, seamless, mixed quietly under engine + sfx.
Required SFX names (implement all, synthesised): `ui-hover ui-click ui-back ui-confirm ui-error countdown-tick countdown-go roulette-tick item-get item-use
item-hit item-block box-pickup boost pad-boost drift-spark drift-level mini-turbo wall-hit bump land splash spin shrink respawn star-loop lap-chime final-lap finish
overtake win-fanfare lose-sting explosion pickup-coin`. Voice: `voice_*` keys from `assets.js` via `Assets.audioBuffer`; if a clip is missing, play nothing (the UI shows a caption instead).

---------------------------------------------------------------------------------------------------

## 5. RACE, ITEMS, AI (owner A3), and the data everyone renders

```js
const race = new Race({ track, entries, laps = track.lapCount, difficulty = 'professional', player = 'marco-id' })
// entries: [{ id, name, charId, kartId, isPlayer }] length up to 8; grid order = array order (Race may reorder for GP: worst first)
race.step(dt, playerInput)     // ONE fixed step: countdown, player+AI inputs, kart updates, collisions, items, checkpoints, ranking, rubber-banding, events
race.state                     // 'countdown' | 'racing' | 'finished'   ('finished' = every human/AI done or timeout)
race.time                      // seconds since GO (0 during countdown)
race.countdown                 // seconds remaining before GO (3.0 -> 0)
race.racers                    // [Racer]
race.player                    // the human Racer
race.itemBoxes                 // [{ pos: Vector3, active: boolean, respawn: number }]
race.items.entities            // active world items: [{ id, type, pos: Vector3, vel: Vector3, yaw, ownerId, state, radius, targetId? }]
race.getHud()                  // HudSnapshot (below), cheap, no allocation beyond a reused object
race.results()                 // [{ place, id, name, charId, time|null, bestLap|null, points, isPlayer }] final-ish
race.dispose()
// Racer:
{ id, name, charId, kartId, isPlayer, kart: KartPhysics, ai: AIDriver|null, place, lap, progress (metres, monotonic incl. laps),
  finished, finishTime, lapTimes: number[], bestLap, item: { id, count }|null, itemRoulette: { active, t, shown }|null,
  shield: boolean, lastInput }
```
**Rules:** 3-2-1-GO countdown (events); lap detection through ordered `checkpointS` gates (anti-shortcut); wrong-way detection for the player
(moving backwards along the track > 1.5 s); ranking by `progress` with finished racers ahead ordered by finish time; after the human finishes, remaining
racers keep racing until they finish or 25 s pass, then the rest are auto-placed by progress; falling/void or > 5 s stuck or upside-down: respawn on the road with 1.5 s
invincibility (`kart:respawn` event, `track.respawnAt`); item boxes respawn after `CFG.itemBox.respawn` s; obstacles (`track.obstacles`) spin karts on overlap;
rocket start; slipstream is optional; rubber-banding is gentle and mostly on AI (`DIFFICULTIES[].rubber`), never cheating visibly (no teleports).

**HudSnapshot** (`race.getHud()`), exact shape:
```js
{ state, countdown, time, place, racers (count), lap, laps, lapTimes: number[], bestLap, speedKmh, boost: { time, power },
  drift: { active, level, charge }, item: { id, count } | null, roulette: { active, shown: itemId|null } | null, shield: boolean,
  wrongWay: boolean, finished: boolean, finishTime, finalLap: boolean,
  standings: [{ id, name, charId, place, lap, finished, isPlayer }],
  minimap: { outline: [[x,z]...], karts: [{ id, x, z, isPlayer, place, colour }] } }
```

**Items (`src/race/itemDefs.js`, names from `ITEMS` in config):**
- `cable` Tangled Cable: dropped behind (or thrown forward if aiming forward); static hazard; spin on contact.
- `ping` Ping Packet: fast straight projectile, bounces off walls up to 3 times, then expires; spin on hit.
- `traceroute` Traceroute: homing, follows the road spline towards the racer directly ahead (robust on any track), then locks on; spin on hit.
- `espresso` Espresso: instant boost 1.2 s.
- `sudo` Sudo: 8 s invincible + speed bonus, hits knock rivals aside.
- `firewall` Firewall: orbiting shield for 10 s that absorbs one hit (or you can shake it off by pressing use).
- `fibre` Fibre Link: 4.5 s automatic driving on the racing line at boost speed 1.6x, invincible (AutoDriver takes over input).
- `outage` Regional Outage: every racer ahead of the user shrinks (`kart.shrink(7)`) and drops their held item.
- `kernel_panic` Kernel Panic: homing strike on 1st place with an area effect (ring radius 9 m); a firewall or sudo blocks it.
Item selection uses **place-weighted tables** (leader: cable, ping, espresso, firewall; mid: traceroute, espresso, ping; last places: sudo, fibre, outage, kernel_panic).
Roulette animation 1.4 s on box pickup (`item:roulette` events with `shown` ids for the HUD, tick sounds). Use = `input.itemPressed`; hold **up/down** is not needed:
`Race.step` signature receives `playerInput` and `playerActions = { itemPressed, aimBack }` as an optional 3rd argument (aimBack when brake is held while pressing item).

**AI (`AIDriver`):** follows a racing line derived from `track.sample()` (look-ahead steering, lateral offsets to take the inside and to avoid karts/obstacles),
brakes for curvature, uses drift on long curves (collects mini-turbos), picks up item boxes (small lateral detours), uses items intelligently (fire ping/traceroute when a
target is ahead within a cone and range; drop cable when someone is close behind; espresso on straights; hold firewall until a threat is near), recovers when stuck.
Personality from `roster.ai` (`aggression`, `skill`) scaled by `DIFFICULTIES`. AI must complete laps on ALL tracks including hairpins, banking and ramps without falling off,
and must be beatable but keep a human honest on Professional. Include headless sim tests (8 AIs, 3 laps, all finish, no NaN, sensible time spread).

`GrandPrix` (`src/race/GrandPrix.js`): `new GrandPrix({ cupId, entries, difficulty })`, `.trackId`, `.raceIndex`, `.record(results)`, `.standings()` (points via `GP_POINTS`,
tie-break by best placing), `.next()`, `.done`, `.grid()` (next race's grid order: reverse standings or by points), `.finalResults()` (with trophy tier 'gold'|'silver'|'bronze'|'none' for the player).

---------------------------------------------------------------------------------------------------

## 6. BUS EVENT CATALOGUE (`import { bus } from '../core/bus.js'`)

Sim to everyone (payload objects, all include `id` = racer id where relevant):
`race:countdown {n}` (3,2,1,0) - `race:start {}` - `race:lap {id, lap, laps, time, isPlayer, final}` - `race:finish {id, place, time, isPlayer}` -
`race:over {results}` - `race:overtake {id, passedId, place, isPlayer}` - `race:wrong-way {on}` - `race:final-lap {}`
`kart:drift-start {id, dir}` - `kart:drift-level {id, level}` - `kart:boost {id, kind, power, duration}` - `kart:wall-hit {id, impact}` - `kart:bump {id, otherId, impact}` -
`kart:land {id, impact}` - `kart:surface {id, surface}` - `kart:spin {id, cause}` - `kart:shrink {id, seconds}` - `kart:fall {id}` - `kart:respawn {id}`
`item:box {id, index}` (picked up) - `item:roulette {id, shown, done}` - `item:get {id, item}` - `item:use {id, item, pos?}` - `item:hit {victimId, byId, item}` - `item:block {id, item}` - `item:expire {entityId}`
UI/main to everyone: `sfx {name, pos?, volume?, pitch?}` - `voice {key, charId}` (UI shows a caption if no audio clip exists) - `music {key}`
UI to main: `ui:start {mode:'gp'|'single'|'time', charId, kartId, difficulty, trackId?, laps?}` - `ui:continue {}` - `ui:pause {}` - `ui:resume {}` - `ui:restart {}` - `ui:quit {}` -
`ui:settings {volume:{master,music,sfx,voice}, quality, cameraShake, touch, units}`

---------------------------------------------------------------------------------------------------

## 7. VISUALS (owner A5): style guide and contract

**Art direction:** chunky, saturated, cheerful stylised 3D. Think "premium mobile-console cartoon": toon-lit (3-step gradient `MeshToonMaterial`, or standard material with
punchy colour) with **inverted-hull outlines** on karts, characters and items; big readable silhouettes; warm sun, cool shadows; rim highlights; subtle bloom on
emissives; soft blob shadows under karts (project via `track.query` height, fade with air height) plus one real shadow-casting sun light following the player on `high`.
No flat grey blocks: every surface gets colour variation via vertex colours or small procedural canvas textures (generated at boot, cached).

`src/visuals/factory.js` (REPLACES the placeholder; keep exports and shapes):
```js
createCharacterMesh(charId, opts?) -> THREE.Group      // origin = seat/hips, faces +Z, ~1.5 tall; group.userData = { head, setExpression(name), lookSteer(steer, dt), setPose(name) }
    // expressions: 'neutral'|'happy'|'sad'|'hit'|'boost'; poses: 'drive'|'celebrate'|'defeat'|'spin'
createKartMesh(kartId, colour) -> { group, wheels: [fl, fr, rl, rr] (Object3D, wheels spin about local X, front pair yaw for steering via userData), seat, exhausts: [l, r], body }
createDriverKart(charId, kartId) -> same as createKartMesh plus { driver }
createItemMesh(itemId) -> THREE.Group                  // held-icon-free world model of each ITEM (cable, ping, traceroute, espresso cup, sudo badge, firewall shield bubble, fibre, outage, kernel_panic)
createItemBoxMesh() -> THREE.Group                     // spinning translucent cube with a glowing "?" and orbiting sparkles
```
Character requirements: 8 distinct silhouettes exactly as described in `roster.js -> look`. **Marco** gets a face plane using `Assets.image('marco_face')` (photo, circular/soft-edged
crop with cartoon eyebrow/cap overlay so it blends) with expression swaps from `marco_face_happy` / `marco_face_sad` if present, else a beautifully drawn procedural cartoon face
(canvas, several expressions). `Biscuit` uses `custom_rival_face` the same way if present (photo on a spaniel head plane or as a portrait badge) and name from `custom_rival_name`.
Karts: 4 models (`cruiser` classic tourer with union-flag stripe; `buggy` light open buggy with beach umbrella mount; `hauler` boxy server-rack truck with blinking LEDs; `rocket` sleek
finned racer), colourable by character colour with a contrasting accent, headlights/tail-lights (emissive), exhausts, animated wheels and steering wheel.

`src/visuals/RaceView.js`: `new RaceView({ scene, camera, race, track, quality })`, `.update(frameDt, alpha)` (alpha = interpolation between the last two fixed steps: keep the previous
pos/yaw per kart and lerp), `.setQuality(q)`, `.dispose()`. It owns: kart+driver meshes for all racers (attitude from `kart.pitch/roll/yaw`, wheel spin from `kart.speed`, steering, drift lean and
kart body squash/stretch bounce on land, spin-out animation, shrink visual, invincible rainbow-pulse + sparkle trail, firewall bubble, boost flames with colour by kind,
fibre light-trail), item boxes (bob, spin, pop/respawn animation), world items from `race.items.entities` (with pooling), obstacle meshes are the TRACK's job, blob shadows, skid marks (ribbon decal
ring buffer), drift sparks colour-coded by level (cyan/amber/magenta), dust and grass clumps and water spray by `kart.ground.surface`, hit explosions, confetti, respawn "fibre drone" beam,
rival nametag sprites (fade with distance, place number for the player's closest rivals), and reacts to bus events (section 6).

`src/visuals/environment.js`: `applyEnvironment(scene, renderer, track.environment, quality)` builds gradient sky dome / star field / cloud sprites / rain particles according to `skyKind`, fog, sun
`DirectionalLight` (+ shadow on high), hemisphere/ambient; returns `{ update(dt, cameraPos, followPos), dispose() }`.
`src/visuals/postfx.js`: `createPostFX(renderer, scene, camera, quality)` returning `{ render(dt), setSize(w,h), setBoost(0..1), setSpeedLines(0..1), dispose() }`; bloom (only on medium/high), vignette,
subtle speed lines / radial blur while boosting; `low` = plain `renderer.render`. Use three's `EffectComposer` etc. from `three/examples/jsm/...` (bundled by esbuild).
`src/fx/`: particle system (`ParticlePool` using instanced quads or Points with per-particle colour/size/life), trails, decals: reusable, allocation-free.

**Phase 2 (after A2's engine exists): tracks 3 and 4** (`datacentre.js`, `marcoverse.js`) written against `src/track/TRACKDEF.md`, see section 9.

---------------------------------------------------------------------------------------------------

## 8. UI (owner A4): screens, HUD, flows

DOM + CSS only (no canvas HUD). Everything lives under `#ui-root`; inject one `<style>` element from JS (single design system, CSS variables, all in `src/ui/`).
Chunky, playful, high-contrast, sporty-cartoon look: skewed panels, big italic display type (system font stack + heavy weights), thick outlines, drop shadows, springy CSS animations,
palette drawn from Marco's brand: hot red `#E63946`, deep navy `#0B1D3A`, electric cyan `#22D3EE`, sun yellow `#FFD166`, off-white `#FFF8EC`. Union-flag and Rio-wave-pavement motifs as tasteful accents.
Fully responsive (desktop 16:9 down to phones in landscape), scalable with `clamp()`/`vmin`. Menus operable with keyboard (arrows, Enter, Esc), gamepad (d-pad/stick, A, B) and mouse/touch; visible focus states; every clickable emits `sfx ui-*`.

`export class UI` in `src/ui/UI.js`. The lead calls these methods; all screens communicate back ONLY via bus events (section 6):
`mount(rootEl)`, `showLoading(text?, progress?)`, `showTitle()`, `showMenu()` (Grand Prix / Single Race / Time Trial / Controls / Settings / About Marco),
`showSelect({ mode })` runs the full flow: character select, then kart select, then difficulty (GP/single) then track (single/time) then emits `ui:start`,
`showHud(on)`, `updateHud(hudSnapshot, dt)` (called every frame), `showCountdown(n)`, `showBanner(text, kind)` (e.g. "FINAL LAP!", "WRONG WAY!", "NEW BEST LAP"),
`showCaption(charId, text)` (speech caption for voice events without audio), `showRaceResults(results, { gp })`, `showGpStandings(standings, { raceIndex, total })`, `showPodium(finalResults)`,
`showPause()`, `hidePause()`, `hideAll()`, `setInput(inputManager)` (for gamepad-navigable menus and the controls screen), `getSettings()`.

Screens (all must be beautiful, animated and complete):
- **Loading / boot** with a rotating tip line (mix of driving tips and Marco-flavoured cloud/networking gags: "A /24 has 254 usable hosts, just like this track has 254 ways to crash").
- **Title**: big "MARCO KART" logo (CSS/SVG, layered, tilted, with a Union-flag-and-wave underline; if `logo_marcoverse` exists show it too), "Press any key", brand line "A Marcoverse production", animated speed-line background. If `marco_full` exists, show him tastefully.
- **Main menu**, **Character select** (grid of 8 with 3D turntable preview via `createDriverKart` from `../visuals/factory.js`, drawn in a separate small WebGL renderer owned by the UI; stat bars from `statsFor`; blurb; Marco's photo shown if available;
  custom rival name via `Assets.text('custom_rival_name')`), **Kart select** (4 karts, live stat bars combined), **Difficulty** (Associate / Professional / Specialty), **Track select** (4 track cards with beautiful procedural canvas art, best times from storage), **Controls** (from `input.bindingsHelp()`), **Settings** (volumes, quality, camera shake, touch controls, units km/h or mph), **About Marco** (fun bio card: cloud and networking instructor, AWS-certified, Marcoverse, based in Rio; British sense of humour; if photos exist, show them).
- **HUD:** place (huge ordinal with suffix, pops on change), lap counter "LAP 2/3", item slot with roulette spin + count, speedometer (km/h or mph), drift/mini-turbo charge meter with the three colour levels, boost flame indicator, race timer and lap split list, minimap (outline + coloured dots, player highlighted, rotate-with-player optional), position list of all 8 racers with portraits, countdown numerals "3 2 1 GO!" with sfx hooks, banners, captions, wrong-way warning, finish banner "FINISH!".
- **Race results** (table of 8, player highlighted, points earned, best lap), **GP standings** between races, **Podium/final** (top three characters on a podium with trophy tier; Marco shows `marco_face_happy`/`_sad` when supplied; confetti), **Pause** (resume, restart, controls, volume, quit).
- Persist: best times per track, settings, last selections (guarded storage).

---------------------------------------------------------------------------------------------------

## 9. TRACK DESIGN NOTES (A2 for tracks 1 and 2; A5 for 3 and 4 in phase 2)

Each track: 3 laps of roughly 60 to 90 s at speed (length ~ 1900 to 2600 m at ~30 m/s), an interesting layout (hairpin, esses, a sweeping banked turn, an elevation change, at least one jump or shortcut,
2 to 4 boost pads, item box rows of 3 at ~6 to 8 spots), a grid start and a proper start/finish gantry with the Marco Kart logo, richly dressed scenery (instanced, distance-culled),
animated details, a skybox from `environment`, and a clear visual path (kerbs, arrows, chevrons on tight corners). Textures procedural (canvas) with mipmaps and anisotropy.

1. **Copacabana Calçadão (sunny, seaside).** Wavy black-and-white pavement mosaic road (the famous wave pattern), palm trees, beach volleyball nets, kiosks with striped umbrellas, football pitch,
   sand (slows), the sea with animated water, hills with favelas-style colourful blocks (generic, respectful), a hilltop statue silhouette with outstretched arms, a cable-car line, a beach jump ramp shortcut, samba drummers.
2. **Blighty Grand Prix (drizzle, city).** Wet dark tarmac, painted white lines, kerbs, a big clock-tower landmark, red double-decker buses as moving obstacles crossing at junctions, a roundabout, terraced houses, telephone
   boxes, pillar boxes, tea-shop, puddle patches (`water` surface), bridge over a canal, overcast light with rain particles and reflective puddles, pigeons flying up.
3. **Cloud Nine Data Centre (indoor neon).** Server-rack canyons with blinking LEDs, glowing fibre-optic cables along walls and floor, cooling fans, cable trench shortcut (with oil-like cable spill patches), holographic signs
   ("ping", "404", "sudo"), a spiral ramp descending through the "cold aisle", glass tunnel through a "cloud" atrium, cyan/magenta emissive palette on dark blue.
4. **Marcoverse Speedway (space, no walls).** A neon ribbon through a starfield with planets, a huge Marco-face planet, portals to loop back, banked twists and a loop-free but dramatic vertical wave; NO walls, void falls
   (`inVoid` past the edges), boost pad chains, gravity-defying banked curves, aurora sky, giant floating server-rack asteroids; the hardest track.

**Track engine (A2) must provide:** a spline-based builder (Catmull-Rom or similar through control points with per-point `width`, `bank`, `elevation`, `surface zones`, `wall left/right`, `kerb`), road mesh generation with UVs and correct normals,
side walls/fences, terrain skirt / void, boost pads, oil/water patches, jump ramps (real geometry, height field consistent with `query`), procedural texture helpers (canvas), instanced-scenery placement helpers (place along the spline
with offsets, jitter, seeded RNG), animated-object registry, obstacle helpers (moving buses along a path), start gantry, arrows, minimap outline, and a fast spatial index for `query`. Document the `TrackDef` format in `src/track/TRACKDEF.md`
so tracks 3 and 4 can be written by someone else. Tests: round-trip sample/query, wall collisions, closed loop continuity, checkpoint ordering, grid slots on road, no NaN, `query` perf (>= 200k queries/s).

---------------------------------------------------------------------------------------------------

## 10. ASSETS FROM MARCO (all optional; everything must degrade gracefully)

Keys in `window.__MK_ASSETS__` (see `src/core/assets.js`): `marco_face`, `marco_face_happy`, `marco_face_sad`, `marco_full`, `logo_marcoverse`, `custom_rival_face`, `custom_rival_name`,
`voice_ready`, `voice_go`, `voice_boost`, `voice_hit`, `voice_item`, `voice_win`, `voice_lose`, `voice_final_lap`, `voice_overtake`. If your area could use another asset, do NOT add a hard dependency:
mention it in your final report under "Assets I could use" and the lead will ask Marco.

---------------------------------------------------------------------------------------------------

## 11. Testing and the final report

- Unit tests for logic (`node --test`), named `test/<area>_<thing>.test.js`. Screenshot demos named `test/demo_<area>_<thing>.js`, images in `shots/<area>/`. **Look at every screenshot you produce** and fix problems.
- Be honest: if something does not work or is unfinished, say so.
- Your FINAL message (this is what the lead reads; keep it under 450 words) must contain:
  1. Files created (paths).
  2. Public API: exact signatures, and every place you deviated from this spec (with reason).
  3. How to run your tests/demos.
  4. What you verified (numbers: e.g. lap times, FPS-ish stats, query throughput, screenshot findings).
  5. Known issues / TODO.
  6. "Assets I could use" (optional).
