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

## In Progress Tasks

(Empty)

## Future Tasks

- [ ] Implement Client-Side Prediction (CSP) for improved responsiveness
- [ ] Address schema duplication (create shared package or use monorepo tools) - POSTPONED (needs design)
- [ ] Add simple AI opponents (server-side)
- [ ] Improve HUD with game state info (score, timer, etc.)
- [ ] Refine player sprite graphics/animations (Golden Toilet!)
- [ ] Add visual effects (e.g., speed lines, collision sparks, toilet smoke)
- [ ] Sound effects
- [ ] Database integration (player accounts, stats persistence - if needed)
- [ ] Deployment configuration (client and server)
- [ ] Address `npm audit` vulnerabilities

## Implementation Plan

The game uses a server-authoritative architecture with client-side interpolation. The client renders the game world based on state updates received from the server and sends user input.

- **Server (`server/`)**: Node.js with Colyseus. Manages the game simulation (`ArenaRoom.ts`) in a fixed update loop (`setSimulationInterval`). Player state (`ArenaState.ts`) uses meters relative to a world origin. Handles player connections, input, authoritative physics calculations, collision detection (player-item, player-player, player-base), single item pickup/stealing logic, and scoring logic.
- **Client (`client/`)**: React with Vite, TypeScript, PixiJS, and MapLibre GL JS. The `GameCanvas.tsx` component manages rendering, connection to the server, input handling, and displaying the game state. It converts server meter coordinates to geographic coordinates (`worldToGeo`) for map positioning and sprite projection. Interpolates (`lerp`, `angleLerp`) visual elements between state updates for smoothness. Contains specific logic in the `gameLoop` to handle correct initial sprite placement after connection/refresh, ensuring map/stage are centered before placing sprites based on the first received server state.

### Relevant Files

- ✅ `client/src/features/GameCanvas.tsx`: Main React component handling map/canvas rendering, Pixi setup, game loop, input handling, and Colyseus connection/state updates. Includes coordinate conversion, interpolation, and logic for correct initial sprite placement after connection/refresh.
- ✅ `server/src/ArenaRoom.ts`: Colyseus Room handler managing game state, player lifecycle, receiving input, running the server-side game simulation loop, and implementing core game rules (collisions, pickup, stealing, scoring).
- ✅ `server/src/schemas/ArenaState.ts`: Defines the shared state structure (`Player`, `FlagState`, `ArenaState`) synchronized between server and clients using `@colyseus/schema`. Includes a single generic item.
- ⚠️ `client/src/schemas/ArenaState.ts`: (Temporary) Duplicated schema definition for the client. Needs refactoring to match server (single item).
- ✅ `server/src/index.ts`: Entry point for the Colyseus server setup.
- ✅ `client/src/main.tsx`: Entry point for the React client application.
- ✅ `server/package.json`, `client/package.json`: Project dependencies.
- ✅ `server/tsconfig.json`, `client/tsconfig.json`: TypeScript configurations.
- ✅ `.env`: Environment variables (e.g., `VITE_MAPLIBRE_STYLE_URL`).
- ✅ `TASKS.md`: This file.
