# Smuggler's Town (Geo-CTF Racer) Implementation

Building a browser-based, top-down "capture-the-flag" car-combat game on a real-world map, inspired by Smuggler's Run. Using React, TypeScript, Firebase, Colyseus, and Pixi.js/Phaser. Prioritizing a client-side UI prototype first.

## Completed Tasks

- [x] Define Product Requirements & System Design (SRS, UI Doc, Gameplay Doc)
- [x] Scaffold client project structure (Vite, React, TS)
- [x] Implement basic Firebase config and Anonymous Auth flow in client (structure only, functionality deferred)

## In Progress Tasks (MVP Vertical Slices)

### Slice 1: Client-Side UI & Map Prototype
- [ ] User: Install client dependencies (`npm install` in `client/`)
- [ ] User: Create `.env` file in `client/` with placeholder Firebase credentials (or comment out Firebase init in `firebaseConfig.ts` for now)
- [ ] User: Verify client runs (`npm run dev`)
- [ ] Choose and integrate a map tile provider SDK (e.g., MapLibre GL JS, Leaflet) - Mock or live tiles
- [ ] Choose and integrate a rendering engine (Pixi.js or Phaser)
- [ ] Create a basic `GameCanvas` component in React
- [ ] Render map tiles based on a default location/view
- [ ] Create default car sprite asset
- [ ] Implement client-side input handling (Keyboard WASD/Arrows - Desktop Scheme)
- [ ] Implement *mock* client-side physics/movement (centered car, panning map - no server sync yet)
- [ ] Render car sprite on the map, responding to input
- [ ] Create basic HUD component in React (static placeholders for score/timer)

### Slice 2: Basic Backend & Real-time Setup
- [ ] User: Set up Firebase project (Auth, Firestore, Functions, Hosting) & Enable Anonymous Auth
- [ ] User: Update `.env` file in `client/` with real Firebase credentials (and uncomment init if needed)
- [ ] User: Verify client anonymous auth works
- [ ] Set up basic Colyseus server structure (`server/` directory, `package.json`, `tsconfig.json`)
- [ ] Set up basic Firebase Functions structure (`firebase/functions/` directory, `package.json`, `tsconfig.json`)
- [ ] Configure basic Firebase Hosting deployment via `firebase.json`
- [ ] Configure basic Colyseus server deployment (e.g., Dockerfile for Cloud Run)
- [ ] Configure basic Firebase Functions deployment (`firebase.json`)
- [ ] Set up initial GitHub Actions workflow for CI/CD (Client to Hosting, Server to Cloud Run, Functions)

### Slice 3: Real-time Connection & Basic Sync
- [ ] Add Colyseus client SDK to the client project
- [ ] Implement client logic to connect to a Colyseus room
- [ ] Create basic Colyseus `ArenaRoom.ts` on the server
- [ ] Define basic Colyseus State Schema (`Player` with `x`, `y`, `heading`)
- [ ] Handle player join/leave in `ArenaRoom` (`onJoin`, `onLeave`)
- [ ] Sync basic player state from server to clients and render other players (replace mock movement)

### Slice 4: Authoritative Movement
- [ ] Send client inputs to server via Colyseus messages (`INPUT`)
- [ ] Implement server-authoritative physics simulation in `ArenaRoom` game loop (`setSimulationInterval`)
- [ ] Broadcast authoritative game state (`STATE`) back to clients
- [ ] Implement client-side state reconciliation (adjust predicted state based on server state)

### Slice 5: Core Gameplay Objects & Interaction (MVP)
- [ ] Add `Base` and `Pickup` to Colyseus state schema
- [ ] Implement server logic to spawn bases and pickups at fixed/random locations
- [ ] Render bases and pickups on the client map
- [ ] Implement server-side collision detection (Car-Pickup, Car-Base)
- [ ] Implement server logic for pickup capture (touch pickup -> attach to car state)
- [ ] Implement server logic for delivery (touch own base with pickup -> score)
- [ ] Implement basic team scoring state and logic
- [ ] Implement basic match timer state and logic
- [ ] Update client HUD to display live score/timer from game state

## Future Tasks (Post-MVP)

- [ ] Implement steal mechanic (`STEAL_COOLDOWN_MS`)
- [ ] Implement boost mechanic (input, server logic, state, cooldown, visual feedback)
- [ ] Implement reset mechanic (input, server logic)
- [ ] Add mobile controls (virtual joystick, buttons) & responsive layout adjustments
- [ ] Implement Lobby system (Firebase Functions REST API for `/lobbies`, Firestore for data, React components for UI)
- [ ] Implement Matchmaking logic (Quick Play button -> find/create lobby)
- [ ] Implement Colyseus `onAuth` to verify Firebase JWT for room joins
- [ ] Implement Bot support (server-side AI players)
- [ ] Implement settings screen (key-binds, audio controls, graphics quality)
- [ ] Refine physics model (drifting, friction based on pseudo-terrain)
- [ ] Implement visual styling ("Geo-Explorer Chic")
- [ ] Add sound effects and background music
- [ ] Implement advanced auth flows (Google, Email) and profile persistence
- [ ] Implement match history/leaderboards (Firestore `matches` collection, Cloud Functions)
- [ ] Add PWA features (manifest, service worker)
- [ ] Integrate observability tools (Logging, Tracing, Sentry)
- [ ] Add advanced map layers (collision, elevation - v1.1+)
- [ ] Refine graphics (shaders, particles, 3D mode? - v1.2+)

## Implementation Plan

- **Initial Focus:** Client-side prototype using React, Vite, TypeScript, and Pixi.js/Phaser for map/sprite rendering and mock movement.
- **Client:** React SPA (Vite, TypeScript) using Pixi.js/Phaser for rendering, Zustand for UI state, React Router for navigation, Colyseus Client SDK for WebSocket communication, Firebase SDK for auth & REST calls.
- **Realtime Server:** Node.js + TypeScript application using Colyseus framework, deployed on GCP Cloud Run. Manages game rooms, authoritative physics, state synchronization.
- **Backend Services:** Firebase (Auth, Firestore, Functions, Hosting) for user management, lobby data, REST API endpoints, and static client hosting.
- **Architecture:** Client-Server authoritative model for game state. Stateless REST functions for lobby/user management. Stateful Colyseus rooms for active matches.
- **Data Flow:** Client auths with Firebase -> interacts with REST API (Functions) for lobby -> connects to Colyseus Room (Cloud Run) via WebSocket for gameplay -> game results saved via Server/Functions to Firestore.

## Relevant Files

- `client/` - React Frontend (Vite, TS, Pixi/Phaser) ✅ (scaffolded)
  - `client/src/App.tsx` ✅ (basic auth added)
  - `client/src/firebaseConfig.ts` ✅ (created, init potentially commented out)
  - `client/src/main.tsx` ✅ (created)
  - `client/src/vite-env.d.ts` ✅ (created)
  - `client/index.html` ✅ (created)
  - `client/package.json` ✅ (created)
  - `client/tsconfig.json` ✅ (created)
  - `client/vite.config.ts` ✅ (created)
  - `client/src/components/` - UI Components ⏳
  - `client/src/features/GameCanvas.tsx` - Main game rendering area ⏳
  - `client/src/game/` - Client-side game logic, rendering, input ⏳
  - `client/src/services/colyseus.ts` - Colyseus client setup ⏳ (deferred)
  - `client/src/services/api.ts` - Firebase Functions client ⏳ (deferred)
- `server/` - Colyseus Game Server (Node.js, TS) ⏳ (deferred)
  - `server/src/ArenaRoom.ts` - Core game room logic ⏳
  - `server/src/schemas/` - State definitions ⏳
  - `server/src/index.ts` - Server entry point ⏳
  - `server/package.json` ⏳
  - `server/tsconfig.json` ⏳
  - `server/Dockerfile` - For Cloud Run deployment ⏳
- `firebase/` - Firebase Backend Config & Functions ⏳ (deferred)
  - `firebase/functions/` - Cloud Functions source ⏳
    - `firebase/functions/src/index.ts` - Functions entry point ⏳
    - `firebase/functions/package.json` ⏳
    - `firebase/functions/tsconfig.json` ⏳
  - `firebase/firestore.rules` ⏳
  - `firebase/firebase.json` ⏳
- `.github/workflows/deploy.yml` - CI/CD Pipeline ⏳ (deferred)
- `TASKS.md` ✅ (this file)
- `README.md` ⏳
