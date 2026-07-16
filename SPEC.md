# Smuggler's Town — Improvement Specs

Specs for the work identified in the July 2026 audit. Ordered by recommended
implementation sequence; each spec is self-contained enough to pick up later.
Dependencies are noted — 2 and 4 are easiest done alongside 1.

---

## 1. Local map-collision pipeline (replaces Mapbox Tilequery)

**Goal:** Server knows, per tick, whether any world position is on a road,
inside a building, or on water — with zero network calls in the hot path and
$0 in API costs. Unlocks: road speed boost (currently dead), real water
hazards (replaces hardcoded `WATER_ZONE` rect), building collision (new).

### Data source

Overpass API, queried **once per room create / world-origin change**, cached
on disk per bbox. Primary endpoint `https://overpass.kumi.systems/api/interpreter`
(explicitly no rate limits), fallback `https://overpass-api.de/api/interpreter`.

Query (bbox = play area around world origin, suggest ±1500 m):

```
[out:json][timeout:25];
(
  way["highway"]({{s}},{{w}},{{n}},{{e}});
  way["building"]({{s}},{{w}},{{n}},{{e}});
  relation["building"]({{s}},{{w}},{{n}},{{e}});
  way["natural"="water"]({{s}},{{w}},{{n}},{{e}});
  way["waterway"="riverbank"]({{s}},{{w}},{{n}},{{e}});
);
out geom;
```

`out geom;` inlines coordinates — no osmtogeojson dependency needed for ways.
Building relations (multipolygons): use outer members only; skip holes
(courtyards) for v1 — a car "colliding" with a courtyard boundary is acceptable.

Disk cache: `packages/server/.map-cache/<lat>_<lng>_<radius>.json` (raw
Overpass response). Key rounded to 4 decimals. Gitignore the directory.

### New module: `packages/server/src/map/mapData.ts`

Replaces `utils/mapApiUtils.ts` (delete it). Zero new dependencies.
*(Implemented 2026-07: used a hand-rolled uniform grid index instead of
flatbush — flatbush v4 is ESM-only and the server build is CommonJS; a grid
over a bounded play area gives O(1) lookups anyway. Measured 0.73µs per full
player lookup set on real midtown data.)* Point-in-polygon and
point-to-segment are hand-rolled (see below), we're already in flat meters.

```ts
export type SurfaceType = 'building' | 'water';

export class MapData {
  // Fetch (or read cache), project to meters via shared geoToWorld, build indexes.
  static async load(originLng: number, originLat: number, radiusM: number): Promise<MapData>;

  // Road check: nearest road segment within half its width.
  // Width by highway class: motorway/trunk 12, primary 10, secondary 8,
  // tertiary/residential/unclassified 6, service 4, else 5. (Tune later.)
  isOnRoad(x: number, y: number): boolean;

  // Polygon containment. Returns first hit or null.
  surfaceAt(x: number, y: number): SurfaceType | null;

  // Wall collision for building response (spec: see "physics integration").
  // Tests the segment (fromX,fromY)->(toX,toY) against building edges from
  // the polygon index; returns first intersection + edge normal, or null.
  sweepBuilding(fromX: number, fromY: number, toX: number, toY: number):
    { hitX: number; hitY: number; nx: number; ny: number } | null;
}
```

Internal structure:
- **Roads:** every 2-point segment of every highway way is one flatbush entry
  (bbox padded by its half-width). `isOnRoad` = `index.search(x±maxW, y±maxW)`,
  then point-to-segment distance (dot-product projection, ~10 lines) against
  candidates. Store segments in flat `Float64Array`s (x1,y1,x2,y2,halfWidth)
  parallel to flatbush ids.
- **Polygons (buildings + water):** one flatbush over polygon bboxes; ring
  coords in flat arrays; ray-cast point-in-polygon (~15 lines, even-odd rule).
- Coordinates projected once at load with `geoToWorld` from shared-utils.
  All queries are pure flat-2D meter math.

### Integration in ArenaRoom

- `onCreate`: `this.mapData = await MapData.load(originLng, originLat, 1500)`.
  Make `onCreate` async (Colyseus supports async onCreate). If Overpass fails
  after both endpoints, log and proceed with `mapData = null` — game degrades
  to today's behavior (no roads/buildings, no crash).
- `resetGame` (world origin change): re-run `MapData.load` for the new origin;
  keep serving the old data until the new load resolves.
- **Delete the entire road-status machinery** it obsoletes:
  - `playerRoadStatusCache`, `playerPredictedPositions`, `RoadStatus` type,
    `ROAD_QUERY_INTERVAL_MS`, the whole throttled query block
    (`ArenaRoom.ts:246-300`), and the commented-out Mapbox code.
  - `PREDICTION_LOOKAHEAD_FACTOR` + predicted-position return values in
    `playerController.ts` / `aiController.ts` (they exist only to hide API
    latency). Controllers go back to returning nothing.
  - The stale module-level cache at `playerController.ts:29-30` (already dead).
  - `utils/mapApiUtils.ts`, and `MAPBOX_ACCESS_TOKEN` from server `.env`.
- Per tick, before movement: `player.isOnRoad = mapData?.isOnRoad(player.x, player.y) ?? false`
  — checked at the *actual* position, every tick, no throttle, no prediction.

### Physics integration (movement controllers)

In the (merged, see spec 4) movement update:
- **Road:** speed limit = `isOnRoad ? MAX_SPEED * ROAD_SPEED_MULTIPLIER : MAX_SPEED`
  (existing branch, now live).
- **Water:** replace `isPointInRectangle(next, WATER_ZONE)` with
  `mapData.surfaceAt(nextX, nextY) === 'water'`. Same reset behavior
  (teleport to origin — consider respawn-at-own-base later). Delete
  `WATER_ZONE` from server constants AND the two hardcoded GeoJSON copies in
  `useMapLibre.ts:66,162` (the real map already renders real water).
- **Buildings:** after computing `nextX/nextY`, call
  `sweepBuilding(player.x, player.y, nextX, nextY)`. On hit: clamp position to
  the hit point minus a small epsilon along the normal, and slide — remove the
  velocity component along the normal (`v -= (v·n)n`), keep the tangential
  component. Swept test (not point-in-polygon on the destination) so cars
  can't tunnel through thin walls at road-boosted speed.

### Client visuals (small, optional in same PR)

`player.isOnRoad` already syncs via schema. `useDustParticles.ts:72` currently
always emits; gate on `!isOnRoad` so dust reads as "off-road" feedback again.

### Acceptance

- Room in Times Square: driving along Broadway shows `isOnRoad=true` and the
  2.5× boost; driving into a building stops/slides the car; driving into the
  Hudson resets the car. Server tick time stays < 1 ms with 8 players
  (log a one-off timing sample, then remove).
- Kill network after room load: game keeps running (all lookups local).
- Restart server, same origin: loads from disk cache, no Overpass hit.

### Non-goals (v1)

- Building heights / 3D. Road *rendering* (basemap already shows roads).
- AI pathfinding on the road graph (future — the data is now there).
- Cross-room sharing of MapData (one instance per room is fine; add an
  LRU keyed by bbox if room churn ever makes load time annoying).

---

## 2. Positional separation in car-car collision

**File:** `rules.ts:151` (`checkPlayerCollisionsAndStealing`).

**Problem:** collision applies a velocity impulse but never separates
positions, so overlapping cars stay overlapped and re-collide every tick
(impulse spam), and fast closings tunnel through each other.

**Spec:** inside the existing `dSq <= collisionThresholdSq` block, after the
impulse (reuse `nx, ny, dist` already computed):

```ts
const overlap = 2 * PLAYER_EFFECTIVE_RADIUS - dist;
if (overlap > 0) {
  const push = overlap / 2 + 0.01;   // split evenly + epsilon
  p1.x -= nx * push; p1.y -= ny * push;
  p2.x += nx * push; p2.y += ny * push;
}
```

If spec 1 is in, follow each pushed position with a `sweepBuilding` clamp so
separation can't shove a car through a wall. Steal logic is untouched.
Also handle the degenerate `dSq === 0` case (currently skipped by `dSq > 0`):
push apart along a fixed axis instead of skipping.

**Acceptance:** two cars driven head-on at full speed bounce and end up
non-overlapping; idling cars pushed together don't jitter.

---

## 3. Dead code deletion

Pure deletions, no behavior change. One commit.

- `packages/client/src/hooks/useInputHandling.ts` — unused duplicate of the
  keyboard hook; imported nowhere.
- `aiActions.ts:74,87` — `getInterceptTarget` / `getDefendTarget` and the
  `INTERCEPTING` / `DEFENDING` states they serve; `determineAIState` never
  returns them. (Re-add with spec 6 if/when those behaviors are built.)
- Debug sprites created in `usePixiApp.ts:124` + the empty update block at
  `useGameLoop.ts:577`.
- Client handlers for messages the server never sends (`useColyseus.ts:132-142`:
  `water_reset`, `flag_scored`, `debug_steal_check_positions`) — or keep ONE
  and actually broadcast it server-side; don't keep dead listeners.
- `rules.ts:13` unused `ITEM_START_POS` import; unused `GOLDEN_TOILET_SVG`
  preload; stale "MOVED TO..." breadcrumb comments in both constants files.
- `checkPlayerCollisionsAndStealing`'s `CollisionCheckDebugData` return —
  nothing consumes it upstream; return `void`.
- Debug-log sweep: `ArenaRoom.ts` logs multiple lines per join/leave and has
  an empty periodic-log block (`update()` builds `playerSessionIds` and drops
  it). Keep join/leave/score one-liners, delete the play-by-play.
- Note: `playerController.ts:29-30` module-level cache dies in spec 1; if
  doing this spec first, delete it here.

**Acceptance:** `pnpm -r build` passes; game plays identically.

---

## 4. Merge human/AI movement controllers

**Problem:** `updateHumanPlayerState` (`playerController.ts:40`) and
`updateAIState`'s movement body (`aiController.ts:45`) are ~90% identical —
friction, lerp-to-target-velocity, water check, heading turn — with constants
copy-pasted. They will drift (already have: AI has its own multipliers
sprinkled in).

**Spec:** one function in `packages/server/src/game/movement.ts`:

```ts
export function updateVehicle(
  player: Player,
  targetDir: { x: number; y: number },   // unit vector or {0,0}
  velocity: PlayerVelocity,
  opts: { maxSpeed: number; accel: number; isOnRoad: boolean },
  mapData: MapData | null,
  dt: number
): void;
```

- Human caller: normalizes input (including the Y-flip at
  `playerController.ts:55` — it's an input-mapping concern, keep it in the
  caller), passes `MAX_SPEED` / `ACCELERATION`.
- AI caller: `aiStateMachine` still decides the target point; `aiController`
  converts to a direction and passes `MAX_SPEED * AI_SPEED_MULTIPLIER` /
  `ACCELERATION * AI_ACCEL_MULTIPLIER`.
- Road/water/building handling lives inside `updateVehicle` once (per spec 1).
- `playerController.ts` shrinks to input→direction mapping; `aiController.ts`
  to FSM glue. Delete the duplicated physics bodies.

Do this **with or immediately after spec 1** — spec 1 already rewrites both
functions' signatures (dropping the predicted-position return), so merging
first or simultaneously avoids doing that surgery twice.

**Acceptance:** human driving feel unchanged (same constants, same math); AI
still seeks/pursues/returns. No physics constant appears in two files.

---

## 5. Hygiene & config

Small independent items; batch into one PR.

- **Lockfiles:** delete `packages/server/package-lock.json` and
  `firebase/functions/package-lock.json` (root pnpm-lock is authoritative;
  firebase functions can stay npm ONLY if deployed independently — if so,
  add a comment in `firebase/functions/package.json` saying it's intentional).
- **`INITIAL_CENTER` triplication:** keep the one in
  `shared-utils/src/constants.ts` (as `ORIGIN_LNG/LAT`); import it in
  `useMapLibre.ts:8` instead of redefining.
- **`set_world_origin` guard** (`ArenaRoom.ts:335`): any client can relocate
  the world mid-game. Minimum viable guard: only allow when
  `state.players.size === 1` or within the first 10 s of a round, plus
  clamp lat/lng to valid ranges and rate-limit to 1/30 s per client. (Real
  rooms/lobby auth is a future feature; don't build it now.)
- **Carrier-disconnect drop position** (`rules.ts:334` TODO): in
  `updateCarriedItemPosition`, items already track carrier x/y each tick —
  on carrier-missing, drop at the item's current x/y if finite, else (0,0).
  Two-line fix, removes the TODO.
- **Server deploy story:** add a minimal `Dockerfile` to `packages/server`
  (node:20-slim, pnpm install --prod, expose 2567) so the server can deploy
  to Fly/Railway/Cloud Run. Nothing more — no CI, no orchestration.

---

## 6. Future — deferred, spec'd to implementable depth

Don't build until wanted; recorded so the shape is agreed. Each item keeps an
explicit **build when** trigger — these stay deferred until their trigger
fires, no matter how ready the spec looks.

### 6a. Road-aware AI

*(Implemented 2026-07 — `map/roadGraph.ts` + `aiController.ts` planning layer.
Trigger fired early: spec 1 made buildings solid, so straight-line bots
wedged against walls. Measured: bots on-road 50-58% of samples vs ~13% map
road coverage.)*

**Build when:** spec 1 has shipped and bots visibly lose to humans who use
the 2.5× road boost — i.e., roads matter and bots ignore them.
**Depends on:** spec 1 (`MapData` road segments in flat arrays), spec 4
(`updateVehicle` — bots feed it a direction; routing only changes where that
direction points). Resurrects `INTERCEPTING`/`DEFENDING` deleted in spec 3.

**New module `packages/server/src/map/roadGraph.ts`:**

```ts
export class RoadGraph {
  // Build from MapData's segment arrays at room load (after MapData.load).
  // Nodes = segment endpoints deduped by 1m-rounded key `${round(x)},${round(y)}`
  // (endpoints of consecutive OSM way segments coincide exactly; rounding
  // also welds T-junctions that share an OSM node). Edges = segments,
  // cost = length in meters (all roads share the same 2.5× multiplier, so
  // plain length is the correct cost — no per-class weighting).
  static fromMapData(mapData: MapData): RoadGraph;

  // A* with a hand-rolled binary heap (~30 lines, no dependency).
  // Entry/exit: nearest node to (fromX,fromY) and (toX,toY) via a flatbush
  // over node coords. Returns world-meter waypoints ending at the goal
  // point itself, or null if graph empty / endpoints unreachable.
  findPath(fromX: number, fromY: number, toX: number, toY: number):
    { x: number; y: number }[] | null;
}
```

**Route-vs-direct decision** (in `aiController.ts`, not the graph): compare
travel times, not distances. `directTime = dist / MAX_SPEED`;
`roadTime = (distToEntry + distFromExit) / MAX_SPEED + pathLength / (MAX_SPEED * ROAD_SPEED_MULTIPLIER)`.
Take the road only when `roadTime < directTime`. This automatically makes
bots cut across a plaza when the detour isn't worth it.

**Per-bot plan state** (module-scope map in `aiController.ts`, cleaned up on
AI removal): `{ waypoints, waypointIndex, goalX, goalY, plannedAtMs }`.
Re-plan when any of: goal moved > 20 m from `goalX/goalY` (carrier drove
off), all waypoints consumed, or 1000 ms elapsed — never more than 1
plan/s/bot. Waypoint following: advance `waypointIndex` when within 8 m;
the direction to the current waypoint becomes `targetDir` into
`updateVehicle`. FSM target selection is unchanged — routing sits between
"pick target" and "steer."

**INTERCEPTING (resurrected):** selected by `determineAIState`
(`aiStateMachine.ts:44-47`, currently a TODO returning `PURSUING_CARRIER`)
when an opponent carrier exists AND is > 50 m away — close in, plain pursuit
is better. Target = carrier position + carrier velocity × leadTime, where
`leadTime = clamp(dist / (MAX_SPEED * AI_SPEED_MULTIPLIER), 0, 2 s)`
(carrier `vx/vy` are already in the Player schema). Replaces the
fall-back-to-pursuit stub at `aiActions.ts:74`.

**DEFENDING (resurrected as escort):** selected when a *teammate* carries an
item and no opponent carries one (today's implicit rule-4 fallback at
`aiStateMachine.ts:62-65` sends the bot to sit on its base). Target = point
15 m from the teammate carrier toward the nearest opponent — body-blocking
the likely tackle. Replaces the exact-position stub at `aiActions.ts:87`.

**State hysteresis:** keep the chosen state for ≥ 500 ms unless
`carriedBySelf` changes — prevents SEEK/PURSUE flicker when an item is
grabbed and instantly stolen.

**Acceptance:** with a room in Manhattan, a bot returning to base visibly
drives along an avenue rather than diagonally through blocks, and beats its
old straight-line self in a timed A-to-B; bots no longer oscillate between
states when two items swap carriers rapidly; server tick stays < 1 ms with
4 bots (planning is 1 Hz and off the hot path).
**Non-goals:** one-way streets / lane direction, path smoothing beyond the
8 m waypoint radius, cooperative multi-bot planning, per-tick re-planning.

### 6b. End-of-game flow

**Build when:** first session where people actually play to the timer —
today the clock hits 0 and the game just keeps going (`ArenaRoom.ts:178`
TODO).
**Depends on:** nothing (independent of specs 1-5).

**Schema** (`shared-schemas/src/ArenaState.ts`): add
`@type("string") gamePhase: "playing" | "ended" = "playing"` to `ArenaState`.

**Server** (`ArenaRoom.ts`):
- In the timer block (`update()`, `:174-181`): when `gameTimeRemaining`
  reaches 0 and phase is `"playing"`, set `gamePhase = "ended"`, broadcast
  `game_over` with `{ winner: 'Red' | 'Blue' | 'Draw', redScore, blueScore }`,
  and schedule `this.clock.setTimeout(() => this.resetGame({ lat: this.state.worldOriginLat, lng: this.state.worldOriginLng }), 10_000)`.
- Immediately after the timer block: `if (this.state.gamePhase === "ended") return;`
  — freezes movement, AI, collisions, pickups, scoring in one line. Inputs
  still arrive and are ignored; that's fine, the server is the authority.
- `resetGame()` (`:566`) sets `gamePhase = "playing"` and
  `gameTimeRemaining = GAME_DURATION_SECONDS` (it already does the latter).

**Client:**
- `useColyseus.ts`: add `gameResult` to internal state; set it in a
  `room.onMessage("game_over", ...)` handler (same registration block as the
  existing handlers at `:132-142` — and note spec 3 deletes the dead ones;
  this adds the first *live* one). Clear `gameResult` when
  `state.gamePhase` flips back to `"playing"` in the `onStateChange` handler.
- `GameCanvas.tsx`: when `gameResult` is set, render a centered
  `FloatingPanel` overlay (`zIndex: 40`, above everything at `:127-219`):
  winner headline, final score, "next round starting soon…". No countdown
  timer — the server resets in 10 s and the state change dismisses the
  overlay; a client-side countdown is cosmetic drift risk for zero gameplay
  value.

**Acceptance:** run with `GAME_DURATION_SECONDS = 10`: cars freeze at 0,
every connected client shows the correct winner and score, after 10 s a
fresh round starts (positions/items/scores reset) and the overlay dismisses
itself on all clients, including one that joined *during* the ended phase
(overlay derives from `gamePhase`, not only the broadcast — a late joiner
missed the message; render the overlay whenever `gamePhase === "ended"`,
using scores from state, with the broadcast only supplying the winner
flourish).
**Non-goals:** rematch voting, MVP/stats screens, score persistence, lobby.

### 6c. Client-side prediction

**Build when:** the server is deployed remotely AND sustained RTT for real
players exceeds ~80 ms AND someone actually complains about input feel.
All three. Interpolation-only is correct below that; do not build this
speculatively — it is the highest-complexity item in this file and its
failure mode (mispredict + visible rubber-banding) is worse than the latency
it hides.
**Depends on:** spec 4 (`updateVehicle` exists and is pure), spec 1 (wall
clamps — see the map-data note below).

**Step 1 — move physics to shared:** relocate `movement.ts`
(`updateVehicle`) and the physics constants it reads (`MAX_SPEED`,
`ACCELERATION`, `FRICTION_FACTOR`, `TURN_SPEED`, `ROAD_SPEED_MULTIPLIER`)
from `packages/server/src/` to `packages/shared-utils/src/`. It is already
pure (mutates passed-in player/velocity objects, no Colyseus imports), so
this is a file move + import updates on both sides.

**Step 2 — input sequencing:**
- Client (`useGameLoop.ts` input send, `:156-159`): stamp each send with an
  incrementing `seq`; keep a ring buffer of the last 128 `{seq, dx, dy,
  dtMs}` entries.
- Server: `playerInputs` (`ArenaRoom.ts:37`) becomes a short FIFO queue per
  player instead of latest-only; each tick, apply queued inputs in order
  (each with its `dtMs`, clamped to sane bounds so a client can't send
  dt=10s speed hacks), record the last applied `seq`.
- Schema: add `@type("uint32") lastProcessedInputSeq` to `Player`.

**Step 3 — client re-simulation:** each frame, take the authoritative
`x/y/vx/vy` + `lastProcessedInputSeq` from state, replay the ring-buffer
inputs newer than that seq through the shared `updateVehicle`, and render
the local car at the replayed position. Correction policy: divergence
< 0.5 m → blend over ~100 ms; > 5 m → hard snap (teleports, water resets).
Remote players stay pure-interpolated, unchanged.

**Map data on the client:** wall-accurate prediction needs the same geometry
the server has. Add `GET /map-data?lat=&lng=&radius=` to
`packages/server/src/index.ts` serving the spec-1 disk cache verbatim; the
client builds its own `MapData` from it (the class has no server-only deps).
Acceptable v1 shortcut: skip client-side walls and let the 100 ms correction
absorb wall hits — ship that first, add the endpoint only if wall
rubber-banding is actually noticeable.

**Acceptance:** with 150 ms of simulated latency (Chrome DevTools throttling
or Colyseus's `simulateLatency`), the local car responds to a keypress
within one frame; driving a clean loop on- and off-road produces no visible
correction; a water reset snaps cleanly; remote cars behave exactly as
before.
**Non-goals:** predicting other players, predicting pickups/steals/scoring
(server events remain snap-on-arrival), lag compensation for collisions
(favor-the-shooter style rewind).

### 6d. `useGameLoop.ts` split

**Build when:** the next change that touches `useGameLoop.ts` lands (6e is
the likely trigger) — never as a standalone "cleanup PR."
**Depends on:** nothing; spec 3 already deletes the dead debug-sprite block
(`:576-579`).

The 690-line callback currently inlines, in order: input send (`:156-159`),
map follow (`:161-192`), vortex spawn-on-status-change (`:194-272`), vortex
per-frame positioning (`:274-289`), item sprite create/destroy (`:291-330`),
local player sprite (`:332-381`), remote player sprites (`:383-464`),
initial placement (`:466-484`), item sprite positioning (`:486-545`), base
sprites (`:547-574`), nav arrow (`:581-669`). The
`worldToGeo → map.project → isFinite-guard` try/catch dance is duplicated
**seven** times.

**Extraction order** (each step independently shippable,
behavior-identical):

1. `client/src/game/projection.ts` — `makeProjector(map, state)` returning
   `project(worldX, worldY): {x, y} | null` (null = invalid/off-map). Kills
   the seven duplicated try/catch blocks first; every later module takes the
   projector. Do this before anything else.
2. `client/src/game/vortexFx.ts` — owns the vortex GifSource and the
   `ActiveVortex` list; `update(ctx)` handles both spawn-on-change and
   per-frame positioning. **Bundled simplification:** the screen→world
   round-trip at `:226-233` (project the carrier sprite, unproject back to
   world) exists only to find "where the carried toilet was"; compute it in
   world space instead — carrier world pos + world-space offset behind
   `heading` — and delete the unproject entirely.
3. `client/src/game/sprites.ts` — `syncPlayerSprites(ctx)`,
   `syncItemSprites(ctx)`, `syncBaseSprites(ctx)`: creation, per-frame
   position/rotation/tint, and removal for each entity type. The
   local-vs-remote player branches merge here (they differ only in the
   pin-to-center case).
4. `client/src/game/camera.ts` — follow-lerp + initial placement (and the
   6e mode logic when that lands).
5. `client/src/game/navArrow.ts` — target selection + arrow positioning
   (`:581-669`), self-contained already.

Shared per-frame context object built once at the top of the loop:
`{ app, map, state, sessionId, lerpFactor, project, refs }`. The three asset-
loading `useEffect`s (`:84-116`) collapse into one `useGameAssets` hook
returning `{ carTexture, itemSource, vortexSource }`. Modules are plain
functions/closures, not hooks — only the orchestrator and asset loader stay
hooks. End state: `useGameLoop.ts` ≤ ~150 lines of orchestration; no module
reaches into another's sprites.

**Acceptance:** drive, pick up, steal, score, trigger a vortex, watch a
remote player, use location search — all pixel-identical before/after each
extraction step; no new React re-renders (modules hold refs, not state).
**Non-goals:** changing any visual behavior, introducing a scene-graph
abstraction or ECS, memoization work.

### 6e. Dual camera mode (from the gpt-41 attempt)

**Build when:** wanted — it's a feature, not debt. Cheapest right after 6d
step 4 (camera module exists); buildable standalone by touching the follow
block + two rotation lines.
**Reference:** `smugglers-town-ai-gpt-41/client/src/MapGame.tsx:176-203` —
`car-fixed` pins the sprite dead-center upright (`rotation = 0`) and rotates
the *map* (`bearing = -heading + 180` in its heading convention); the
default mode keeps `bearing: 0` and rotates the sprite.

**Port into gemini:**
- `GameCanvas.tsx`: `const [cameraMode, setCameraMode] = useState<'north-up' | 'car-fixed'>('north-up')`,
  toggled by keydown `c` (register alongside the existing keyboard hook);
  pass into `useGameLoop` (→ `camera.ts` after 6d).
- **Convention conversion (the one real trap):** gemini `heading` is radians,
  0 = East, CCW-positive, +Y = North (`ArenaState.ts` Player comment);
  MapLibre `bearing` is degrees clockwise from North. Travel direction as a
  compass bearing is `90 − heading·180/π`; car-up-on-screen means
  `map bearing = 90 − heading·180/π`. Port gpt-41's debug label (its
  `:207-210`) into the existing debug panel (`GameCanvas.tsx:202-218`) as
  `heading / bearing` lines and verify the sign empirically on first run —
  both prior attempts got this wrong at least once before getting it right.
- Follow block (`useGameLoop.ts:177-187`): in `car-fixed`, alongside the
  center lerp, lerp the bearing toward the target with `angleLerp` (convert
  deg↔rad at the boundary — `angleLerp` is radian-based). In `north-up`,
  lerp bearing back to 0 so toggling un-rotates smoothly. Use
  `map.jumpTo({center, bearing})` once per frame instead of separate
  `setCenter`/`setBearing` calls.
- **Sprite rotations:** every projected *position* is bearing-correct for
  free (`map.project` accounts for rotation) — only sprite *rotation* needs
  the bearing term. Local car at `:344` and remote cars at `:430` change
  from `-heading + π/2` to `-heading + π/2 + bearing·π/180`; in `car-fixed`
  the local car's expression collapses to 0 by construction (assert that
  with the debug label rather than hardcoding it). Items/bases/vortexes are
  unrotated circles/gifs — positions only, no change.
- When `isFollowingPlayer` is false (location search / free pan,
  `GameCanvas.tsx:89-99`), force `north-up` behavior and restore
  `car-fixed` on re-follow — rotating a map the user is trying to browse is
  hostile.

**Acceptance:** toggling `c` mid-drive switches modes smoothly (no snap);
in `car-fixed`, holding "up" always drives toward the top of the screen and
oncoming remote cars render nose-to-nose correctly; location search
temporarily restores north-up; the debug panel shows heading/bearing in
agreement in both modes.
**Non-goals:** speed-coupled zoom, mode persistence across sessions,
per-player camera preferences synced to the server, gamepad toggle binding.
