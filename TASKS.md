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
- [x] Implement client-side conversion (`worldToGeo`) between server meters and map Lat/Lng
- [x] Implement map centering based on authoritative local player state
- [x] Resolve core sprite positioning issues by projecting in `gameLoop`
- [x] Add `nodemon` for automatic server restarts during development
- [x] Implement synchronized client-side interpolation (Map center + Local sprite)

## In Progress Tasks

- [ ] Implement rendering/interpolation for other players' sprites

## Future Tasks

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
- [ ] Code sharing between client/server (e.g., using monorepo, shared package)

## Implementation Plan

The game uses a server-authoritative architecture. The client renders the game world based on state updates received from the server and sends user input. The server manages the game simulation, including physics, collisions, and game rules.

### Relevant Files

- `client/src/features/GameCanvas.tsx`: Main React component handling map/canvas rendering, Pixi setup, game loop, input handling, and Colyseus connection/state updates.
- `server/src/ArenaRoom.ts`: Colyseus Room handler managing game state, player lifecycle, receiving input, and running the server-side game simulation loop.
- `server/src/schemas/ArenaState.ts`: Defines the shared state structure (`Player`, `ArenaState`) synchronized between server and clients using `@colyseus/schema`.
- `client/src/schemas/ArenaState.ts`: (Temporary) Duplicated schema definition for the client.
- `server/src/index.ts`: Entry point for the Colyseus server setup.
- `client/src/main.tsx`: Entry point for the React client application.
- `server/package.json`, `client/package.json`: Project dependencies.
- `server/tsconfig.json`, `client/tsconfig.json`: TypeScript configurations.
- `.env`: Environment variables (e.g., `VITE_MAPLIBRE_STYLE_URL`).
