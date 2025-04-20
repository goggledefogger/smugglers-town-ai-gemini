# Smuggler's Town - Feature Implementation

Core gameplay loop and networking implementation for the Real-World Map CTF Racer.

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

## In Progress Tasks

- [x] Implement correct team assignment and client-side color display
- [x] Refine server-side movement physics (acceleration, friction, turning) - Added basic drag

## Future Tasks

- [ ] Address schema duplication (create shared package or use monorepo tools) - POSTPONED (needs design)
- [ ] Implement Client-Side Prediction (CSP) for improved responsiveness
- [ ] Implement server-side collision detection (player-player, player-object)
- [ ] Add game state elements (pickups, bases, flags, scores, timers) to `ArenaState`
- [ ] Implement core CTF game logic (picking up, carrying, capturing flags)
- [ ] Add simple AI opponents (server-side)
- [ ] Improve HUD with game state info (score, timer, etc.)
- [ ] Refine player sprite graphics/animations
- [ ] Add visual effects (e.g., speed lines, collision sparks)
- [ ] Sound effects
- [ ] Database integration (player accounts, stats persistence - if needed)
- [ ] Deployment configuration (client and server)
- [ ] Address `npm audit` vulnerabilities
- [ ] Address schema duplication (create shared package or use monorepo tools) - POSTPONED (needs design)

## Implementation Plan

The game uses a server-authoritative architecture with client-side interpolation. The client renders the game world based on state updates received from the server and sends user input.

- **Server (`server/`)**: Node.js with Colyseus. Manages the game simulation (`ArenaRoom.ts`) in a fixed update loop (`setSimulationInterval`). Player state (`ArenaState.ts`) uses meters relative to a world origin. Handles player connections, input, and authoritative physics calculations.
- **Client (`client/`)**: React with Vite, TypeScript, PixiJS, and MapLibre GL JS. The `GameCanvas.tsx` component manages rendering, connection to the server, input handling, and displaying the game state. It converts server meter coordinates to geographic coordinates (`worldToGeo`) for map positioning and sprite projection. Interpolates (`lerp`, `angleLerp`) visual elements between state updates for smoothness.

### Relevant Files

- ✅ `client/src/features/GameCanvas.tsx`: Main React component handling map/canvas rendering, Pixi setup, game loop, input handling, and Colyseus connection/state updates. Includes coordinate conversion and interpolation.
- ✅ `server/src/ArenaRoom.ts`: Colyseus Room handler managing game state, player lifecycle, receiving input, and running the server-side game simulation loop (meter-based physics).
- ✅ `server/src/schemas/ArenaState.ts`: Defines the shared state structure (`Player`, `ArenaState`) synchronized between server and clients using `@colyseus/schema`.
- ⚠️ `client/src/schemas/ArenaState.ts`: (Temporary) Duplicated schema definition for the client. Needs refactoring.
- ✅ `server/src/index.ts`: Entry point for the Colyseus server setup.
- ✅ `client/src/main.tsx`: Entry point for the React client application.
- ✅ `server/package.json`, `client/package.json`: Project dependencies.
- ✅ `server/tsconfig.json`, `client/tsconfig.json`: TypeScript configurations.
- ✅ `.env`: Environment variables (e.g., `VITE_MAPLIBRE_STYLE_URL`).
- ✅ `TASKS.md`: This file.
