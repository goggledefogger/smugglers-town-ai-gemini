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
- [x] Resolve initial sprite positioning/synchronization issues on client refresh
- [x] Implement server-side collision detection (player-item, player-player, player-base)
- [x] Implement core game logic (single generic item pickup, player-player item stealing, scoring at own base)
- [x] Add simple AI opponents (server-side) (Basic targeting & movement)
- [x] Refactor server room logic into separate modules (constants, helpers, controllers, rules)
- [x] Implement manual AI spawning via client message (`add_ai`)
- [x] Add basic UI buttons for triggering AI spawn
- [x] Add navigation arrow HUD element pointing towards the current objective (item, carrier, or base)
- [x] Investigate and fix team persistence / orphan car bug on refresh (including base collision timing issues)
- [x] Modify item transfer logic: Allow transfer on collision between teammates (not just opponents)
- [x] Modify scoring: Make Red/Blue scores persistent totals across rounds
- [x] Restructure project into packages (client, server, shared-utils, shared-schemas)
- [x] Create shared utility package (`@smugglers-town/shared-utils`)
- [x] Move shared constants (Base positions, Coordinates, etc.) to `shared-utils`
- [x] Move shared helper functions (`lerp`, `angleLerp`, `distSq`) to `shared-utils`
- [x] Update client and server to import from shared packages
- [x] Fix path alias and build issues related to shared packages

## In Progress Tasks

- [ ] Improve HUD with game state info (score, timer✅, etc.)
- [ ] Refine player/item sprite graphics/animations (Golden Toilet ✅ - Basic GFX added)
- [ ] Move remaining client coordinate utilities (`worldToGeo`, etc.) to `shared-utils`

## Future Tasks

- [ ] Implement multiple simultaneous items (e.g., 2-5 toilets):
    - Pseudo-random spawn locations within defined area.
    - Track status for each item individually.
    - Game round logic: Respawn all items only after *all* have been scored.
    - Update HUD/UI to reflect multiple item states (or nearest/relevant one).
    - Update navigation arrow logic for multiple potential targets.
- [ ] Address schema duplication (create shared package or use monorepo tools) - POSTPONED (needs design)
- [ ] Improve HUD with game state info (score, timer✅, etc.)
- [ ] Refine player/item sprite graphics/animations (Golden Toilet ✅ - Basic GFX added)
- [ ] Add visual effects (e.g., speed lines, collision sparks, toilet smoke)
- [ ] Sound effects
- [ ] Database integration (player accounts, stats persistence - if needed)
- [ ] Deployment configuration (client and server)
- [ ] Address `npm audit` vulnerabilities
- [ ] Implement Client-Side Prediction (CSP) for improved responsiveness
- [ ] Implement 'hot-swap' refresh (immediate replacement of old player instance)
- [ ] Add different car types (visuals + performance: e.g., fast/drifty vs slow/grippy)

## Implementation Plan

The game uses a server-authoritative architecture with client-side interpolation. The client renders the game world based on state updates received from the server and sends user input.

- **Server (`packages/server/`)**: Node.js with Colyseus. Manages the game simulation (`ArenaRoom.ts`) in a fixed update loop. Uses shared schemas (`@smugglers-town/shared-schemas`) for state and shared utilities (`@smugglers-town/shared-utils`) for constants/helpers. Handles player connections, input, authoritative physics calculations, collision detection, game rules, and AI control.
- **Client (`packages/client/`)**: React with Vite, TypeScript, PixiJS, and MapLibre GL JS. The `GameCanvas.tsx` component manages rendering, connection to the server, input handling, and displaying the game state. Uses shared schemas (`@smugglers-town/shared-schemas`) and utilities (`@smugglers-town/shared-utils`). Converts server meter coordinates to geographic coordinates (`worldToGeo` - currently local util) for map positioning and sprite projection. Interpolates visual elements between state updates.

### Relevant Files

- ✅ `client/src/features/GameCanvas.tsx`: Main React component handling map/canvas rendering, Pixi setup, game loop, input handling, and Colyseus connection/state updates, **and rendering UI components (HUD, AIControls)**. Includes coordinate conversion, interpolation, and logic for correct initial sprite placement after connection/refresh.
- ✅ `client/src/components/HUD.tsx`: Displays game scores.
- ✅ `client/src/components/AIControls.tsx`: Displays buttons to add AI players.
- ✅ `client/src/hooks/...`: Various hooks for Colyseus connection, input, map, Pixi app, and game loop logic.
- ✅ `server/src/ArenaRoom.ts`: Colyseus Room handler managing game state, player lifecycle, receiving input, running the server-side game simulation loop (delegating logic to controllers/rules).
- ✅ `server/src/game/aiController.ts`: Handles AI targeting and movement logic.
- ✅ `server/src/game/playerController.ts`: Handles human player movement logic.
- ✅ `server/src/game/rules.ts`: Handles core game rules (pickup, scoring, stealing).
- ✅ `server/src/config/constants.ts`: Defines server-specific game constants.
- ✅ `server/src/utils/...`: Server-specific utility functions.
- ✅ `packages/shared-schemas/src/index.ts`: Exports the shared state structure (`Player`, `FlagState`, `ArenaState`) defined using `@colyseus/schema`.
- ✅ `packages/shared-utils/src/index.ts`: Exports shared constants and utility functions.
- ✅ `server/src/index.ts`: Entry point for the Colyseus server setup.
- ✅ `client/src/main.tsx`: Entry point for the React client application.
- ✅ `package.json` (in root and packages): Project dependencies and scripts.
- ✅ `tsconfig.json` (in root and packages): TypeScript configurations.
- ✅ `pnpm-workspace.yaml`: Defines PNPM workspaces.
- ✅ `.env`: Environment variables (e.g., `VITE_MAPLIBRE_STYLE_URL`).
- ✅ `TASKS.md`: This file.
