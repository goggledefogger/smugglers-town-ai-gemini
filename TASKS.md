# Smuggler's Town - Feature Implementation

Core gameplay loop and networking implementation for a real-time multiplayer game where players retrieve items and return them to their base.

## Completed Tasks

- [x] Basic project setup (Client: Vite/React/TS, Server: Node/TS)
- [x] Integrate MapLibre GL JS for map display
- [x] Integrate Pixi.js for canvas overlay rendering
- [x] Initial MapLibre + Pixi rendering synchronization
- [x] Basic local movement controls (keyboard input)
- [x] Set up Colyseus server project (`server/`)
- [x] Define basic server state schema (`ArenaState`, `Player`) using `@colyseus/schema`
- [x] Implement basic `ArenaRoom` on server (create, join, leave)
- [x] Add Colyseus client SDK to React app (`client/`)
- [x] Implement client connection logic to Colyseus server (`GameCanvas.tsx`)
- [x] Send client input (`dx`, `dy`) to server
- [x] Implement server-authoritative movement logic in `ArenaRoom.update`
- [x] Refactor server physics and state to use a meter-based world coordinate system
- [x] Implement client-side conversion (`worldToGeo`, `geoToWorld`) between server meters and map Lat/Lng
- [x] Implement map centering/panning based on authoritative local player state
- [x] Resolve core sprite positioning issues by projecting in `gameLoop`
- [x] Add `nodemon` for automatic server restarts during development
- [x] Implement synchronized client-side interpolation (Map center + Local sprite + Remote sprites)
- [x] Implement rendering/interpolation for other players' sprites
- [x] Implement correct team assignment and client-side color display
- [x] Refine server-side movement physics (acceleration, friction, turning) - Added basic drag
- [x] Add game state elements (scores, generic items/flags) to `ArenaState`
- [x] Implement server-side collision detection (player-item, player-player, player-base)
- [x] Implement core game logic (single generic item pickup, player-player item stealing, scoring at own base)
- [x] Add simple AI opponents (server-side) (Basic targeting & movement)
- [x] Refactor server room logic into separate modules (constants, helpers, controllers, rules)
- [x] Implement manual AI spawning via client message (`add_ai`)
- [x] Add basic UI buttons for triggering AI spawn
- [x] Add visual feedback (temporary disable/loading state) to AI spawn buttons
- [x] Add navigation arrow HUD element pointing towards the current objective (item, carrier, or base)
- [x] Modify scoring: Make Red/Blue scores persistent totals across rounds
- [x] Restructure project into packages (client, server, shared-utils, shared-schemas)
- [x] Create shared utility package (`@smugglers-town/shared-utils`)
- [x] Update client and server to import from shared packages
- [x] Implement multiple simultaneous items with random spawn locations within defined area
- [x] Implement basic server-side player collision physics (impulse response)
- [x] Configure root dev script for automatic shared package builds (concurrently)
- [x] Tune collision radius for better feel (set to 1.5m)
- [x] Allow item transfer on collision between teammates (removed team check)
- [x] Implement initial client-side UI design system using Tailwind CSS (panels, buttons)
- [x] Implement user selection of MapTiler map styles (investigate client-side vs server-side setting)
- [x] Add more MapTiler map styles based on screenshot
- [x] Change Map Style selector from buttons to dropdown
- [x] Set default map style (Backdrop -> Winter)
- [x] Fix vortex visual effect to appear at the precise location where the toilet was returned (scored), not at the center of the base or attached to the car
- [x] Refactor input handling for modularity (Keyboard/Gamepad) and add Gamepad support
- [x] Add visual effect for driving off-road (e.g., dust clouds using Pixi.Graphics triggered by server state)
- [x] Add location search bar to recenter map view (using MapTiler Geocoding control)
    - [x] Fixed server world origin synchronization on location select (`set_world_origin` message)
    - [x] Fixed map navigation (`flyTo`) and zoom level on location select
    - [x] Fixed map centering to re-follow player after location change animation
- [x] Refine UI layout and transparency for floating panels (HUD, Controls, Status, Search)
- [x] Tuned driving physics (MAX_SPEED, ACCELERATION, FRICTION_FACTOR, ROAD_SPEED_MULTIPLIER) for better feel
- [x] Fixed local player sprite jitter when camera is following
- [x] Implemented client-side timer smoothing for smoother countdown display
- [x] Improved player collision detection accuracy (offset collision point, tuned offset distance)
- [x] Fixed one-item-at-a-time limit for players (prevented multiple item pickup/stealing)
- [x] Implemented predictive road check: Server predicts player position slightly ahead (using `PREDICTION_LOOKAHEAD_FACTOR`) to query map data, aiming for smoother visual transitions for on/off-road status and speed changes.

## In Progress Tasks

- [ ] Implement user selection of MapTiler map styles (investigate client-side vs server-side setting)
- [ ] **AI Improvements (Phase 1: Decision Making & Teamwork):**
    - [x] Refactor AI logic into a Finite State Machine (FSM) or similar structure (`aiController`, `aiStateMachine`, `aiActions`).
    - **Decision Making:**
        - [x] Implement basic states: `SEEK_ITEM`, `PURSUE_CARRIER`, `RETURN_TO_BASE`.
        - [ ] Implement `INTERCEPT` state: Move towards opponent's path if they have the item.
        - [x] Improve target prioritization (e.g., closest item if multiple free, prioritize opponent carriers).
    - **Teamwork:**
        - [x] Implement AI awareness of teammate status (AI prioritizes opponents/items over teammates with items, falls back to own base).
        - [ ] Implement explicit `DEFEND`/`ESCORT` state: If teammate has item nearby, follow/protect.

## Future Tasks

- [x] Refine player/item sprite graphics/animations
- [ ] Add visual effects (e.g., speed lines, collision sparks, toilet smoke)
- [ ] Dynamically size car sprites based on loaded SVG dimensions
- [ ] Sound effects
- [ ] Database integration (player accounts, stats persistence - if needed)
- [ ] Deployment configuration (client and server)
- [ ] Address `npm audit` vulnerabilities
- [ ] Implement Client-Side Prediction (CSP) for improved responsiveness
- [ ] Implement 'hot-swap' refresh (immediate replacement of old player instance)
- [ ] Add different car types (visuals + performance: e.g., fast/drifty vs slow/grippy)
- [ ] Address Colyseus deprecation warning (move server options to WebSocketTransport)
- [ ] Improve Base and Item Placement:
    - Define 3 pairs of potential base locations (Red/Blue).
    - Randomly select one pair of base locations at the start of each round/match.
    - Ensure initial item spawn locations are more spread out and potentially relative to base locations.
    - (Long term: Allow manual selection or POI-based placement).
- [ ] **AI Improvements (Phase 2: Movement & Difficulty):**
    - **Movement:**
        - [ ] Implement road-aware pathfinding (e.g., A* on simplified road graph).
        - [ ] Implement basic obstacle avoidance (e.g., using feelers/raycasts).
        - [ ] Implement smoother turning/driving model similar to player physics.
        - [ ] Ensure AI utilizes existing `isOnRoad` status for speed boost.
    - **Difficulty:**
        - [ ] Add tunable AI parameters (reaction time, accuracy, physics).
        - [ ] Link difficulty levels to specific behaviors/parameter ranges.

## Implementation Plan

The game uses a server-authoritative architecture with client-side interpolation. The client renders the game world based on state updates received from the server and sends user input.

- **Server (`packages/server/`)**: Node.js with Colyseus. Manages the game simulation (`ArenaRoom.ts`) in a fixed update loop. Uses shared schemas (`@smugglers-town/shared-schemas`) for state and shared utilities (`@smugglers-town/shared-utils`) for constants/helpers. Handles player connections, input, authoritative physics calculations, collision detection, game rules, and AI control. **Includes logic to detect if a player is on a road using an external map query API (cached periodically) and applies a speed boost (`ROAD_SPEED_MULTIPLIER`).**
- **Client (`packages/client/`)**: React with Vite, TypeScript, PixiJS, and MapLibre GL JS. The `GameCanvas.tsx` component manages rendering, connection to the server, input handling, and displaying the game state. Uses shared schemas (`@smugglers-town/shared-schemas`) and utilities (`@smugglers-town/shared-utils`). Converts server meter coordinates to geographic coordinates (`worldToGeo`) for map positioning and sprite projection. Interpolates visual elements between state updates. **Will add a visual effect (e.g., dust) triggered by the server-provided `isOnRoad` status.**

- **Off-Road Visual Effect Implementation:**
1. Add `isOnRoad: boolean` field to the `Player` schema (`@smugglers-town/shared-schemas`).
2. Server (`ArenaRoom.ts`) will update this field based on its cached road status check.
3. Client (`useGameLoop.ts`) will read the `isOnRoad` state from the player data.
4. Client renders Pixi.Graphics dust particles attached to the player sprite.
   - Particles are positioned behind the car using `sprite.toGlobal()`, with the distance offset slightly scaled by `speedFactor`.
   - Particles have a fixed alpha (`DUST_PARTICLE_ALPHA`).
   - Particles are visible only when `!playerState.isOnRoad` AND `speedFactor > 0.01` (ensuring they hide when stopped).
   - *Note:* Initial attempts to scale particle alpha based on speed (`speedFactor`) proved complex and unreliable, leading to visibility issues. The current simpler approach (fixed alpha, visibility threshold) is more robust.

- *Vortex visual effect:* When a toilet is scored, the vortex animation is spawned at the exact world position where the toilet was returned (using the last carried position), and remains static there. This ensures the effect is visually accurate and not attached to the car or base center.


### Relevant Files

- ✅ `client/src/features/GameCanvas.tsx`: Main React component handling map/canvas rendering, Pixi setup, game loop, input handling, and Colyseus connection/state updates, **and rendering UI components (HUD, AIControls)**. Includes coordinate conversion, interpolation, and logic for correct initial sprite placement after connection/refresh.
- ✅ `client/src/components/HUD.tsx`: Displays game scores **and timer**.
- ✅ `client/src/components/AIControls.tsx`: Displays buttons to add AI players **with temporary disabled state feedback on click**.
- ✅ `client/src/components/MapStyleSelector.tsx`: UI component for selecting map styles **(uses dropdown, includes styles from MapTiler screenshot)**.
- ✅ `client/src/hooks/...`: Various hooks for Colyseus connection, input, map, Pixi app, and game loop logic.
- ✅ `client/src/hooks/usePixiApp.ts`: Manages PixiJS application setup, sprite creation (including navigation arrow with shadow filter).
- ✅ `client/src/hooks/useGameLoop.ts`: Handles the main game loop, including sprite position/rotation updates (local sprite centered when following), map centering, and item/base rendering.
- ✅ `client/src/hooks/useDustParticles.ts`: Manages dust particle effects for off-road driving.
- ✅ `client/src/hooks/useSmoothedServerTime.ts`: Provides client-side smoothing for the game timer display.
- ✅ `server/src/ArenaRoom.ts`: Colyseus Room handler managing game state, player lifecycle, receiving input, running the server-side game simulation loop (delegating logic to controllers/rules), **and decrementing the game timer**.
- ✅ `server/src/game/aiController.ts`: Handles AI targeting and movement logic.
- ✅ `server/src/game/playerController.ts`: Handles human player movement logic.
- ✅ `server/src/game/rules.ts`: Handles core game rules (pickup, scoring, stealing) **and player collision physics/transfers (now using offset collision points)**.
- ✅ `server/src/config/constants.ts`: Defines server-specific game constants **(impulse magnitude, steal cooldown)**.
- ✅ `server/src/utils/...`: Server-specific utility functions.
- ✅ `packages/shared-schemas/src/index.ts`: Exports the shared state structure (`Player`, `FlagState`, `ArenaState`) defined using `@colyseus/schema`.
- ✅ `packages/shared-utils/src/index.ts`: Exports shared constants **(player radius)** and utility functions.
- ✅ `server/src/index.ts`: Entry point for the Colyseus server setup.
- ✅ `client/src/main.tsx`: Entry point for the React client application.
- ✅ `package.json` (in root **and packages**): Project dependencies and scripts **(root includes concurrently setup)**.
- ✅ `tsconfig.json` (in root and packages): TypeScript configurations.
- ✅ `pnpm-workspace.yaml`: Defines PNPM workspaces.
- ✅ `.env`: Environment variables
- ✅ `.gitignore`: **Includes build artifacts like .tsbuildinfo.**
- ✅ `TASKS.md`: This file.
- ✅ `client/src/components/LocationSearch.tsx`: Renders the MapTiler Geocoding control.
- ✅ `client/src/components/FloatingPanel.tsx`: Reusable component for consistent floating UI panel styling (transparency, hover).
