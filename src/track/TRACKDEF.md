# TRACKDEF: how to write a MARCO KART track

Everything a track needs is ONE plain object (a "def") registered by id. The engine (`Track.js`, `builders/*`) turns it into gameplay
data (`query`, `collideWalls`, checkpoints, grid, item boxes...) and, unless `headless`, meshes. You never touch the engine.

```js
// src/track/tracks/mytrack.js
export default function mytrack() { return { id: 'mytrack', name: 'My Track', points, ... }; }   // or export a plain object
// src/track/index.js
registerTrack('mytrack', mytrack);          // datacentre and marcoverse are still unregistered: add them here
createTrack('mytrack');                     // full build: meshes, textures
createTrack('mytrack', { headless: true }); // gameplay only: NO meshes, NO textures, no window/document. Must stay cheap (~100 ms)
```

Worked, runnable example (space ribbon: no walls, void edges, banking, boost chain, jump over a gap, spiral, glass tunnel, neon):
`src/track/tracks/example_ribbon.js`. Its exact numbers are quoted below where they matter. Register it with
`registerTrack('ribbon', exampleRibbon)`; `exampleRibbon({ gap: false })` gives a variant SimpleKart can lap.

Files you own when you add a track: `src/track/tracks/<id>.js` (def), optionally `src/track/builders/scenery/<id>.js` (dressing),
`test/tracks_<id>.test.js`.

---------------------------------------------------------------------------------------------------

## 1. Conventions (read once, they are all consistent)

| Thing | Rule |
|---|---|
| Axes | Y up. Forward for yaw `a` is `(sin a, cos a)` in (x, z). Right is `(-cos a, sin a)`. |
| Lateral | `+` = right of the direction of travel. `s` = metres along the centreline, wraps at `track.length`. |
| Bank | degrees in defs. `bank > 0` = RIGHT edge lower (banked right-hander). Surface height = `y - lateral * tan(bank)`. |
| Curvature | `> 0` = the road turns right. |
| Turtle heading | degrees, `0` faces +Z, `90` faces +X (east), `180` faces -Z. Arcs: positive degrees = right turn. |
| Colours | `0xRRGGBB` sRGB numbers everywhere (Geo converts to linear). Vertex colours above 1.0 (e.g. `0xffffff * 2` via Color) bloom on `glowVertex` materials. |
| `'@mark+off'` | any place that takes an `s` also takes `'@id'`, `'@id+30'`, `'@id-12.5'`, where `id` is a turtle `.mark(id)` (or a control point `id`). Wrapped into `[0, length)`. |
| Ranges | `from > to` wraps through the start line. |
| Geo primitives | `box/cyl/cone/gable` are placed by the centre of their BASE; `sphere` by its centre. `panel(w,h)` faces +Z. Euler order YXZ. |
| Prop facing | `place.spotAt().yaw` FACES THE ROAD from the spot (add PI to face away). `.along` is parallel to the road. |
| British English | in all text (names, signs, comments). No Nintendo IP. |

Hard rules for def / dress code: importable in Node (no `window`, `document` or canvas at import time; textures are made lazily and are
`null` in Node), deterministic (use `kit.rng`, never `Math.random`), no per-frame allocation in animate callbacks, and
`kit.headless` must skip every mesh (see section 9).

---------------------------------------------------------------------------------------------------

## 2. Def reference

```js
{
  id, name, music /* default id */, lapCount /* 3 */, seed /* rng seed for dress */, killY /* -40: below this a kart has fallen */,
  points,            // section 3 (REQUIRED)
  road, walls, kerbs, defaults, zones,          // section 4
  terrain,           // object | false          section 5
  water,             // section 5
  patches, boostPads, ramps, shortcuts,         // section 6
  itemRows, checkpoints, checkpointCount,       // section 7
  signs, paint, gantry, startLine,              // section 8
  materials(kit), dress(kit),                   // section 9
  environment,       // section 10
  groundY,           // constant ground height when there is no terrain.height (default terrain.base ?? 0)
}
```

### 3. `points`: the centreline

Either the return value of a turtle (recommended) or an array of control points. A point is `[x, z, y, width, bankDeg]` or
`{ x, z, y, w, bank, id }` (bank in DEGREES). At least 4 points, closed loop (the last point connects to the first: do NOT repeat it).

* Plan view: centripetal Catmull-Rom through the points (no cusps, no overshoot). Elevation, width and bank: monotone cubic (PCHIP) in arc
  length (flat crests, no overshoot). The engine samples uniformly every ~2 m (`road.spacing`).
* Keep control points >= 25 m apart on straights and about every 20 to 25 degrees on arcs (the turtle does this for you).

```js
import { turtle } from '../builders/layout.js';           // also available as kit.turtle
const t = turtle({ x: 0, z: 0, heading: 90, y: 30, w: 16, bank: 0 });   // start pose; y / w / bank are the initial values
t.straight(220, { y, w, bank })    // metres. Options are the values reached at the END of the element (linear in between)
t.arc(70, 90, { bank: 24 })        // radius (m), degrees (+ right, - left). Keep radius >= 1.2 x road width (the fixture hairpin: 22 m on an 18 m road is the tightest tested).
t.mark('boost')                    // names the most recent point = the END of the element just laid (mark after arc() = end of the arc). '@boost' works in every s field; marks are points, not ranges.
t.set({ y: 5 })                    // jump the y/w/bank target without moving
t.closeLoop(70, { bank: 0 })       // appends straight(L1), arc(radius, theta), straight(L2) to return to the start point AND heading. Returns points.
t.close()                          // alternative if you laid the loop yourself: distributes the small closing error. Returns points.
```

`closeLoop` throws `no solution (straights -x m, ...)` when the remaining geometry cannot close with non-negative straights: lengthen
an earlier straight (the ribbon uses a 420 m west leg for exactly this reason). `points.closureError` / `.headingError` are diagnostics.

Rules of the start line (`s = 0`):
* The 35 m BEFORE s = 0 (the end of the loop) must be a plain straight road: the 8 grid slots sit 7 to 31.5 m behind the line, on the road,
  no gap, no ramp, no hazard. Start the turtle mid-straight.
* Put the start on a straight with constant width/bank/y so the gantry and chequered line sit flat.
* Checkpoint 0 is always s = 0.

Height (`y`), width (`w`) and bank change smoothly between points. Slopes above about 12 percent feel like walls to the kart.

### 4. `road`, `walls`, `kerbs`, `defaults`, `zones`

```js
road: { width: 18 /* default w for array points */, kerbWidth: 1.3, wallGap: 1.4 /* road edge to wall face */, spacing: 2,
        tile: 18 /* m per road texture repeat */, underTile: 2.4, thickness: 0 /* metres of slab under the road; see below */,
        markings: { edge: { colour: 0xf2f2ee, inset: 0.55, width: 0.22 } | null,
                    centre: null | { kind: 'solid'|'double'|'dashed', colour, width, dash: 3, gap: 5 },
                    skip: [{ from, to }] } }
walls: { name: { height: 1.2, thickness: 0.7, solid: true, colour, top, shape: 'plane'|'hedge'|undefined,
                 map: texture, tile: 4, roughness: 0.85, profile: [[offset, up], ...], material: THREE.Material } }
kerbs: { default: {} }                                    // kerb styles by name; visuals via materials().kerb / .kerbs
defaults: { both: props, left: props, right: props }      // baseline for the whole lap
zones: [ { from, to, side: 'both'|'left'|'right', left: props, right: props, ...props, gap: bool, thickness: metres } ]  // later zones win
// props (per side): { wall: 'name'|'none'|null, kerb: true|'name'|false, edge: 'grass'|'sand'|'road'|'void', skirt: metres }
```

* `wall: 'none'` (or `null`) = no wall and no collider on that side. **A track with no walls at all is fine** (`collideWalls` then only
  reports static colliders, section 4.2).
* `solid: false` walls are visual only (hedges you can drive through, fence textures).
* `shape: 'plane'` is a thin two-sided plane (needs `map` with alpha: fences, banners); `'hedge'` is a rounded bush profile; anything
  else is a box. `profile` overrides the cross-section entirely: `[offset from the wall line, up]` points, base at about -0.35.
* Solid wall collision: circle vs the wall line at `width/2 + wallGap`. The push normal points back into the track. A wall only blocks
  a kart below `wall top + 0.35 m`, so a kart flying above it is free. Use tall walls (height 6+) for enclosed hall or tunnel sides.
* `edge` decides what lies beyond the road/kerb on that side: `grass | sand | road` = ground with that surface (needs terrain or `groundY`),
  **`void` = nothing there: `inVoid` is true, height is `killY`, the kart falls.** `terrain: false` makes `void` the default on both sides.
* `skirt` = metres over which the verge blends from the road edge height to the terrain (default 10; 0 for void or bridge edges).
* `zone.gap: true` removes road AND ground between `from` and `to`: a real hole (`inVoid`, no walls, no paint, not a respawn point).
* `zone.thickness` (or `road.thickness`) draws a slab under the road (side skirts and underside) so elevated roads read as bridges or girders.
  Visual only. With `terrain:false` set `road.thickness` (the ribbon uses 1.2) or the road looks like a sheet of paper.

#### 4.2 Static colliders (props you can bump)

From `dress(kit)` (works headless): `kit.track.model.addCollider(x, z, r, y0?, y1?)` (circle) and
`addCapsule(ax, az, bx, bz, r, y0?, y1?)` (a thickened segment: building fronts, rack rows, fences). `y0..y1` restricts the height band
(so a collider under a bridge does not block the deck). Karts are pushed out via `collideWalls`. Keep the count modest (hundreds is fine).

### 5. `terrain`, `water`

```js
terrain: {
  height: (x, z) => metres,          // ground away from the road. Default: flat at base.
  base: 0,                           // flat ground level when there is no height()
  follow: true | { slope: 0.16, reach: 110, cell: 5 },   // raise terrain around elevated roads into embankments
  surface: (x, z, h) => 'sand'|'water'|'void'|null,      // override the surface name away from the road; 'void' = hole (inVoid)
  colour: (surface, x, z, h, out, track) => THREE.Color|undefined,   // per-vertex ground colour, return undefined for the default
  colours: { grass: [a, b], ... },   // palette overrides (a/b blended by noise)
  detail: 'grass'|'sand', uvTile: 8, sink: 0.45, cell: (auto 6..16), extent: [x0, z0, x1, z1] (visual grid), bounds: [x0, z0, x1, z1] (outside = void),
  holes: [[x0, z0, x1, z1], ...],    // VISUAL hole rectangles in the terrain mesh (pair with surface:'void' for physics; align to the grid `cell`)
}
terrain: false   // no terrain, no verge meshes; every edge defaults to void. Use for space tracks.
```

* `bounds` defaults to the road bounding box padded by 420 m; beyond it everything is void (kills karts that leave the world).
* The terrain mesh, the verge and `query()` share one function, so what you see is what the wheels feel.
* Indoor floors: use a flat `terrain` (height 0) and give it a custom material via `materials().verge` (a tiled raised-floor texture). Anything
  the terrain mesh draws uses that material.

```js
water: { level: 0, extent: [x0, z0, x1, z1], cell: 10, shallow: 0x62d6cf, deep: 0x14649e, opacity: 0.9, roughness: 0.18, tile: 40,
         deepAt: 7, envMap: texture, envIntensity: 1, normalScale: 0.55, depth: (x, z) => metres }
```
A grid with per-vertex depth colour from the terrain height; where the terrain is above `level` it is transparent. Water is VISUAL only.
For a lethal sea, make the terrain lower than the water and set `terrain.surface` -> `'void'` there, or use `surface:'water'` patches for
shallow driveable water.

### 6. Surfaces, boost pads, jump ramps

Surface names returned by `query().surface`: `road | kerb | grass | sand | boost | oil | water | void`. `onRoad` is true for
`road, kerb, boost, oil, water` ON the driving surface. Grip and speed per surface: `SURFACE_PROPS` in `src/core/config.js`.

```js
boostPads: [{ s, lateral: 0, length: 10, width: 6 }]      // surface 'boost' + animated chevron visuals (cyan chaser lamps)
patches:   [{ kind: 'oil'|'water'|'sand'|'grass'|'boost', s, lateral: 0, rs: 3, rl: 2.5 }    // ellipse: radii along / across
            { kind, s, lateral, length, width }]                                            // rectangle: full extents
```
**Patches have NO visuals.** They only change what `query` reports inside the road width. Draw them yourself in `dress` with
`kit.paint(...)` (poly / rect in (s, lateral) space, `lift` 0.05) so eye and physics agree (Blighty's puddles do this).
Oil and water patches on the road are the "hazard zones"; boost is normally declared through `boostPads`.

```js
ramps: [{ id, s: '@jump-165', lateral: 0, length: 12, width: 10, rise: 2.4,       // s-based: follows the road heading
          // or world-placed: x, z, yaw    (yaw radians; an s-based ramp may add yawOffset)
          // rise0 (0), rise1 (=rise) metres above the ground there; or absolute y0, y1
          curve: 1.3 /* >1 kicks up late */, lip: true /* abrupt drop at the end (a jump) vs a bevel */,
          startBevel: 1.2, endBevel: 2, sideBevel: 1.4,
          kind: 'ramp'|'deck'|'pad', surface: 'road', road: true, material }]
shortcuts: [{ from, to, id }]                                                        // informational for AI / UI only
```
* A "platform" is an oriented rectangle whose top height is a curve from y0 to y1 laid over the ground. `kind:'ramp'` also lands in
  `track.jumpRamps`. `kind:'deck'` (rise 0, `lip:false`) makes a flat bridge, e.g. over a `gap` zone or a canal shortcut. Geometry and
  `query` use the same function; the ramp mesh is generated automatically (custom `material` or `materials().platform`).
* Ramps work over void: the top of a platform is solid even where the ground below is `void` or in a gap.
* On bridges, spirals and elevated void ribbons the ramp picks the correct road layer from the road's own height (s-based ramps only).

**Jump recipe (KartPhysics numbers, measured with the bot):**

| Quantity | Value |
|---|---|
| 2.4 m rise ramp, 12 m long, at ~30 m/s | about 0.9 s airtime, about 22 m flight, apex about 9 m after the lip |
| Gap start | at least 5 m after the lip, and the gap at most ~10 m wide |
| Landing | keep at least 85 m of straight, constant bank, after the landing |
| Curves | a launch within ~60 m of a curve overshoots into the void. Put ramps on long straights only |
| SimpleKart | cannot jump: give the track a variant without the gap (`exampleRibbon({ gap: false })`) if tests use it |

The ribbon: ramp `s:'@jump-165'` (12 m long, so the lip is at `@jump-153`), gap zone `@jump-148 .. @jump-138`, straight to `@jump`, then the spiral.

### 7. `itemRows`, `checkpoints`

```js
itemRows: [{ s, lateral: 0, count: 3, spacing: 4.6 }]          // boxes placed ON the road (bank included), hover height above it. Rows every 150 to 300 m.
checkpoints: [0, 200, '@bank', '@jump', 800, ...]              // 6 to 12 strictly ascending values (metres or marks); [0] is forced to 0
checkpointCount: 8                                             // used only when `checkpoints` is omitted: evenly spaced
```
Keep gates under ~500 m apart. Put checkpoints after every place where a shortcut or void could skip laps of progress; on spirals put one per turn. The race code
projects karts onto `s`, so any crossing that could be shortcut needs a checkpoint on both sides (or make the shortcut impossible).

### 8. `signs`, `paint`, `gantry`, `startLine`

```js
signs: [{ from, to, every: 12, side: 'right'|'left'|'both', offset: 2.4, dir: 'left'|'right' }]   // instanced chevron boards on the OUTSIDE of corners (dir = the way the turn goes)
paint: [{ kind: 'strip', from, to, lateral: 0, width: 0.2, colour, dash?, gap? },
        { kind: 'arrow', s, lateral, len: 5, wid: 2.2, colour },
        { kind: 'rect', s, lateral, len: 2, wid: 2, colour },
        { kind: 'chevrons', from, to, every: 8, lateral, c: 1.6, w, colour, t }]
gantry: false | { lines: ['MARCO KART', 'START / FINISH'], clearance: 7.4 }   // start gantry at s = 0
startLine: false                                                              // omit the chequered line and grid boxes
```
Signs, gantry, start line, boost pads and the default markings are all built automatically. Markings skip gaps automatically.

### 9. `materials(kit)` and `dress(kit)`

`materials(kit)` returns overrides (any subset): `road`, `kerb` (single) or `kerbs: { styleName: material }`, `verge` (also used for the
terrain mesh), `platform` (ramps), `paint` (default markings, arrows), `underside` (slabs). All are ordinary three.js materials:
emissive, `MeshBasicMaterial`, custom `onBeforeCompile` shaders, `kit.mat.glowVertex()` for neon paint, all fine. Road UVs are in metres
divided by `road.tile`, so a tiling texture with `repeat` 1 works. Defaults: asphalt texture, grass verge, plank platforms.

`dress(kit)` is called once after the road is built and BEFORE batches are baked. Do all scenery, obstacles, colliders and animation here.

```js
dress(kit) {
  if (!kit.headless) { ...meshes... }         // headless: only colliders / obstacles / gameplay state
}
```

**kit reference** (all seeded by `def.seed`, nothing is global):

| API | What it does |
|---|---|
| `kit.track`, `kit.def`, `kit.headless`, `kit.group`, `kit.rng` | rng: `rng()`, `rng.range(a,b)`, `rng.int(a,b)`, `rng.pick(arr)` |
| `kit.S(v)` | `'@mark+off'` or metres to metres |
| `kit.Geo` | procedural mesh builder: `box cyl cone beam panel sphere gable poly geometry merge` with baked vertex-colour AO, one BufferGeometry out. Every primitive takes `{x,y,z,ry,rx,rz,colour,top,ao}`; `box` also `facade:[w,h]`, `sphere` `sy` |
| `kit.statics.at(mat, x, z)` | the static batch: returns a Geo bucket for `mat` in the chunk under (x, z); draw with WORLD coordinates. Chunked by map cell so frustum culling works. `addGeo(mat, geo, {x,y,z,ry,s})` merges a prebuilt Geo |
| `kit.batch(name, { cell, cull, quality, castShadow })` | another static batch. `cull` = draw only within that many metres of `track.setViewer(camera.position)`; `quality` = lowest tier that draws (`'low'|'medium'|'high'`). Use for crowds, small props, far detail |
| `kit.instances(geo, mat, { cell, cull, quality, name, castShadow })` | chunked InstancedMesh. `.add(x, y, z, { ry, rx, rz, s, sx, sy, sz, colour })` |
| `kit.place.along({from,to,every,side,offset,jitterAlong,jitterOffset,filter,chance})` | spots beside the road (`offset` beyond the ROAD edge). Returns Spot `{x,y,z,s,lateral,side,yaw,along,surface,onRoad}`; spots in the void are dropped |
| `kit.place.scatter({rect:[x0,z0,x1,z1], minDist, count, roadMargin, filter})` | blue-noise scatter, rejects road and void |
| `kit.place.spotAt(x, z)` | ground info at a point (null in the void) |
| `kit.place.ring(cx, cz, r, n, phase)` | points on a circle |
| `kit.paint({ material?, lift? })` | road paint in (s, lateral) space: `strip(s0,s1,lat,width,colour,step)`, `dashes`, `poly([[s,l]...],colour)`, `rect(s,l,len,wid,colour)`, `arrow`, `chevron`. Built into one mesh. `material: kit.mat.glowVertex()` = neon paint |
| `kit.sweep(spec)` | extrudes a profile along the road: tunnels, glass tubes, rails, canyon walls, arches. One mesh per call. Spec below |
| `kit.obstacles.static({ id, kind, x, z, radius, hit, mesh })` | a static hazard (cone, barrier) in `track.obstacles` |
| `kit.obstacles.path({ id, kind, points:[[x,z]...], speed, mode:'loop'|'pingpong'|'cross', phase, wait, length, radius, hit, mesh })` | a moving vehicle; collision = a row of circles along its body; deterministic in `time`; `cross` drives once per cycle then waits hidden. `mesh` is a factory (skipped headless), origin = body centre on the ground, faces +Z |
| `kit.water(spec)` | extra water grid (also from `def.water`) |
| `kit.animate((dt, t) => ...)` | per-frame callback (no allocation) |
| `kit.add(object3D)` | add anything to the track group |
| `kit.mat.lit(opts, key?)`, `.vertex(opts, key?)`, `.basic(colour)`, `.glow(colour, intensity)`, `.glowVertex()` | material helpers (`key` caches). `.wind(material, opts)` / `.hop(material, opts)` add vertex-shader sway / crowd hop |
| `kit.tex.*` | procedural canvas textures (null in Node: they are only created when you call them, guard with `kit.headless`) |
| `kit.props.chevronSignGeo(dir)`, `kit.props.gantry(s, opts)` | ready-made furniture |
| `kit.noise.noise2 / fbm2`, `kit.turtle` | helpers |

**Sweep spec** (`kit.sweep`):
```js
{ from, to, profile: [[lateral, up], ...], material, step: 2, frame: 'road'|'flat', colour: 0xffffff | Color | (k, s) => Color,
  uvTile: 4, every, length,  /* repeat a short segment: ribs, arches */ shadow: false, name }
```
`frame:'road'` banks the profile with the road; `'flat'` keeps up = world up. `lateral > 0` is right, `up` is measured from the road surface.
A strip running left to right faces up (floors); a ceiling seen from below runs right to left, or use `THREE.DoubleSide`.
Recipes: a glass tunnel is an arch profile (`lateral = -9 cos a`, `up = 1 + 6 sin a`, `a` = 0..PI) with a transparent DoubleSide material;
a neon edge rail is a 4-point square profile at lateral +-(half + 0.4) with `kit.mat.glow(colour, 2.5)`; rack canyons are two tall
box profiles (add capsule colliders or a `solid` wall style for the physics: the sweep is visual only).

**Budgets** (per SPEC): under 400 draw calls and 500k triangles on screen. Chunk everything (`statics.at`, `kit.batch`, `kit.instances`),
give small props a `cull`, give expensive detail `quality: 'medium'|'high'`, keep instanced trees under ~200 triangles. Measure with
`node test/tracks_shoot.mjs <id> test/tracks_views.js` (prints calls and triangles per view; add `--noshadow --nokarts` for the scenery-only number).

### 10. `environment`

Fed to `applyEnvironment(scene, renderer, track.environment, quality)` (src/visuals/environment.js). Missing fields take the defaults shown.

```js
environment: {
  skyKind: 'day'|'overcast'|'dusk'|'indoor'|'space',          // 'day'
  skyTop: 0x4aa8ff, skyBottom: 0xcfeaff, fogColor: 0xcfeaff, fogNear: 160, fogFar: 720,
  sunDir: [0.5, 1, 0.3] /* towards the sun; array or Vector3 */, sunColor: 0xfff2d6, sunIntensity: 2.2,
  ambientColor: 0x9fc4ff, ambientIntensity: 0.9,
  stars: boolean (default on for space), clouds: 0..1, rain: 0..1,
}
```
* `space`: dark dome with stars (and a faint horizon glow); the horizon stays dark. Lower `sunIntensity` (0.6), raise `ambientIntensity` (1.1) and
  add your own emissive geometry: nothing else lights the road. Fog near/far 200/1400 keeps distant ribbon sections readable.
* `indoor`: a dark hall ceiling with light strips and rings, no clouds or stars. Build the hall itself (walls, racks, ceiling) in `dress`.
  For a closed ceiling, a `kit.sweep` over the whole route works; otherwise the dome ceiling is enough.
* `overcast` + `rain: 0.6`: Blighty. `dusk`: warm horizon and half stars.

---------------------------------------------------------------------------------------------------

## 11. Engine feature matrix (what tracks 3 and 4 can rely on)

| Need | Supported? | How |
|---|---|---|
| No walls | yes | `wall: 'none'` in `defaults` / a zone (per side, per range). `collideWalls` returns 0 |
| Void edges | yes | `terrain: false`, or `edge: 'void'` per range/side. Beyond the road `inVoid` is true, `height = killY`, `surface = 'void'` |
| `inVoid` queries | yes | `query().inVoid`, also true in `gap` zones, outside `terrain.bounds` and where `terrain.surface` returns `'void'`. NaN or absurd positions also give `inVoid` |
| Space environment | yes | `skyKind: 'space'` (section 10) |
| Indoor environment | yes | `skyKind: 'indoor'` |
| Emissive / custom materials | yes | `materials(kit)` for road, kerb(s), verge, platform, paint, underside; `wall.material`; `kit.mat.glow / glowVertex`; any `THREE.Material` in `kit.statics.at` / `kit.paint` / `kit.sweep` |
| Tunnels / enclosed sections | yes | `kit.sweep` for the shell (visual), tall `solid` wall style or `addCapsule` for physics. The road may be under a ceiling: queries never look up |
| Spiral descents / bridges / crossings | yes | The road may cross over itself if layers differ by more than ~1.5 m in `y` (a spiral of 2 turns dropping 14 m works). Queries pick the layer whose surface is nearest the query `y` (a point over the road strip of one layer is never stolen by another layer's centre line), so callers must pass the kart's real `y`; `hintS` speeds it up |
| Banking | yes (tested to 24 degrees) | `bank` in points/turtle; surface and normal follow. Blend bank slowly (over 60 m or more) |
| Jumps | yes | `ramps` (section 6). Real geometry, same height function as `query` |
| Gaps in the road | yes | `zones: [{ from, to, gap: true }]` |
| Oil / water / boost zones | yes | `patches` and `boostPads`; add your own decals with `kit.paint` |
| Moving hazards | yes | `kit.obstacles.path` |
| Cheap headless build | yes | skip all meshes, textures, `kit.sweep` (returns null), `place` still works |

Query throughput is over 200k queries per second, hinted and unhinted (asserted in `test/tracks_engine.test.js`). `query` is allocation free when you
pass `out`.

Public Track API (consumers): the SPEC section 3 interface, plus these extras:
`surfacePoint(s, lateral, outVec3)` (point on the banked surface), `curvatureAt(s)`, `widthAt(s)`, `heightAt(x, z)`, `sDiff(a, b)`
(signed lap distance), `checkpointIndexAt(s)`, `setViewer(vec3|null)` (enables distance culling: pass the camera position),
`setQuality('low'|'medium'|'high')`, `S('@mark+off')`, `marks`, `model` (the RoadModel: colliders, platforms).

---------------------------------------------------------------------------------------------------

## 12. Recipes

### Space ribbon (track 4: no walls, void edges, banking, boost chains)
```js
{
  terrain: false,                                             // void beside the road
  defaults: { both: { wall: 'none', edge: 'void', kerb: false, skirt: 0 } },
  road: { width: 16, thickness: 1.2, markings: { edge: { colour: 0x22d3ee, inset: 0.4, width: 0.3 }, centre: null } },
  environment: { skyKind: 'space', stars: true, sunIntensity: 0.6, ambientIntensity: 1.1, fogNear: 200, fogFar: 1400 },
  materials: (kit) => ({
    road: new THREE.MeshStandardMaterial({ color: 0x1a1d2e, roughness: 0.35, metalness: 0.4, emissive: 0x0b1a3a, emissiveIntensity: 0.8 }),
    paint: kit.mat.glowVertex(),                              // markings, arrows and edge lines glow
  }),
  boostPads: [{ s: '@boost-180', length: 12, width: 8 }, ...], // chain: 3 to 5 pads, 30 to 40 m apart
}
```
* With no walls, a kart drifting past the edge falls. Give it a wide road (16 to 20 m), gentle bank into corners, and respawn logic that
  uses `track.respawnAt(s)` (skips gaps and hazards).
* Place scenery by explicit lateral, not `place.along` (spots in the void are dropped): `track.surfacePoint(s, lateral, v)` then `statics.at(...)`.
  Floating props are fine: they need no ground.
* Neon edge rails: `kit.sweep({ from: 0, to: L, profile: [[-8.3,0],[-8.3,0.4],[-8,0.4],[-8,0]], material: glowDoubleSided })` per edge (`kit.mat.glow(0x22d3ee, 2.5)` with `material.side = THREE.DoubleSide`). Visual only.
* Emissive vertex-colour above 1.0 blooms only with the post-process bloom pass; keep the base colour readable without it.

### Indoor data centre (track 3: enclosed hall, rack canyons)
```js
{
  environment: { skyKind: 'indoor', skyTop: 0x0a0f24, skyBottom: 0x141a3a, fogColor: 0x0b1030, fogNear: 60, fogFar: 420, ambientIntensity: 0.8, sunIntensity: 0.5 },
  terrain: { height: () => 0, base: 0 },                      // a raised-floor plane beside the road
  materials: (kit) => ({ verge: floorMaterial, road: trackMaterial }),
  walls: { rack: { height: 6, thickness: 1.2, solid: true, colour: 0x1b2036 } },
  defaults: { both: { wall: 'rack', edge: 'road', skirt: 4 } },   // edge 'road' = road grip beyond the kerb, but onRoad is false there
  patches: [{ kind: 'oil', s: 900, lateral: -2, rs: 6, rl: 3 }],       // "cable spill": draw the decal with kit.paint
  dress(kit) { rows of racks via kit.instances / statics.at + kit.place.along; blinking LEDs with a glow material animated in kit.animate; kit.sweep for cable trays; capsule colliders for rack rows that stand off the road }
}
```
* Solid tall walls keep karts inside the canyon; drop the wall in a zone (`wall: 'none'`) to open a trench shortcut.
* Blinking LEDs: one shared `MeshBasicMaterial` per colour whose `color` you animate in `kit.animate` (no per-instance updates).

### Spiral descent
```js
t.arc(45, -720, { y: 12, w: 18 }).mark('spiral');    // two left-hand turns, dropping 14 m (7 m per turn)
```
Radius at least 2.5 x the road width. Drop at least 5 m per turn so the layers separate cleanly in `query`. One checkpoint per turn.
Never put a ramp, a gap or a boost pad inside the spiral or within 60 m before it.

### Tunnel
`kit.sweep({ from: '@a', to: '@b', profile: archPoints, material: glassOrConcrete, step: 2 })` + `every`/`length` ribs. Tunnel portal
frames are a second sweep with a short `length`. Add a `wall` zone if the tunnel should also confine karts.

---------------------------------------------------------------------------------------------------

## 13. Worked example (the 30 lines that matter)

From `src/track/tracks/example_ribbon.js`:

```js
import { turtle } from '../builders/layout.js';
const t = turtle({ x: 0, z: 0, heading: 90, y: 30, w: 16 });
t.straight(220).mark('boost');                         // start straight with a boost chain
t.arc(70, 90, { bank: 24 }).mark('bank');              // banked right-hander
t.straight(200, { bank: 0 }).mark('jump');             // ramp + gap live here
t.arc(45, -720, { y: 12, w: 18 }).mark('spiral');      // two left turns, 14 m descent
t.straight(80, { y: 26, w: 16 });                      // climb back to the start height
t.arc(70, 90, { bank: 20 }); t.straight(420, { bank: 0 }); t.arc(70, 90, { bank: 24 });
const points = t.closeLoop(70, { bank: 0 });

export default () => ({
  id: 'ribbon', name: 'Neon Ribbon', lapCount: 3, seed: 5, killY: -60,
  environment: { skyKind: 'space', skyTop: 0x05061a, skyBottom: 0x1a1140, fogColor: 0x0a0a24, fogNear: 200, fogFar: 1400, stars: true, sunIntensity: 0.6, ambientIntensity: 1.1 },
  road: { width: 16, thickness: 1.2, markings: { edge: { colour: 0x22d3ee, inset: 0.4, width: 0.3 }, centre: null } },
  points, terrain: false,
  defaults: { both: { wall: 'none', edge: 'void', kerb: false, skirt: 0 } },
  zones: [{ from: '@jump-148', to: '@jump-138', gap: true }],
  boostPads: ['@boost-180', '@boost-140', '@boost-100'].map((s) => ({ s, length: 12, width: 8 })),   // chain of 3, 40 m apart
  ramps: [{ id: 'gap-ramp', s: '@jump-165', length: 12, width: 10, rise: 2.4 }],
  itemRows: [{ s: 40 }, { s: '@bank+30' }, { s: '@spiral+40' }],
  checkpoints: [0, 200, '@bank', '@jump', 800, '@spiral', '@spiral+300', 1500, 1900, 2150],
  materials: (kit) => ({ paint: kit.mat.glowVertex() }),
  dress(kit) { if (kit.headless) return; kit.sweep({ from: '@spiral', to: '@spiral+70', profile: arch, material: glass, step: 2 }); },
});
```
(The mark `boost` sits at the END of the first 220 m straight, so `@boost-180` is 40 m from the line. The real file also has a custom road material, a neon strip and a tunnel ribs sweep.)
Result: laps in about 73 s with the pursuit bot on KartPhysics; the same track with `{ gap: false }` is lapped by SimpleKart in about 73 s.

---------------------------------------------------------------------------------------------------

## 14. Testing your track

```js
import { registerTrack, createTrack } from '../src/track/index.js';
import { KartPhysics } from '../src/kart/KartPhysics.js';
import { driveLaps } from './tracks_bot.js';
registerTrack('mytrack', mytrack);
const track = createTrack('mytrack', { headless: true });
const r = driveLaps(track, KartPhysics, { laps: 2, maxTime: 300 });   // r.finished, r.fell, r.stuck, r.laps, r.wallHits, r.offRoadTime
```
Checklist (all automated in `test/tracks_finished.test.js` for the shipped tracks; copy the pattern):
closed loop (the sample at `length` matches the sample at 0), checkpoints ascending and 6..12, all 8 grid slots on the road facing forward, every
item box within road width above the road, no NaN in `sample/query` over a dense sweep, `collideWalls` normals push back into the road,
obstacles move between two `update` times, the bot laps twice without `fell` or `stuck`, lap time about 60 to 90 s.

Screenshots: `node test/tracks_shoot.mjs <id> test/tracks_views.js [view1,view2] [--noshadow] [--nokarts]` writes `shots/tracks/<id>-<view>.png` and
prints draw calls and triangles. Add your views to `test/tracks_views.js` (`{ s, lat, back, up, ahead, lookUp, fov, time }` chase views along the spline, `{ pos, look, fov, aerial: true }` free cameras, `topDown: true` for plan views; see the existing entries). LOOK at every image.
