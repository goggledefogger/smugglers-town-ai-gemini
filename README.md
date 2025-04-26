# Smuggler's Town AI

A real-time multiplayer web game POC built with React, PixiJS, MapLibre GL JS, and Colyseus. Players control vehicles on a real-world map, competing to retrieve items and return them to their base.

## Features

### Current
- Real-time synchronization of player position and heading using Colyseus.
- Map rendering using MapLibre GL JS centered on a real-world location (Times Square, NYC).
- 2D vehicle rendering overlay using PixiJS.
- Server-authoritative movement with client-side interpolation for smoothness.
- Keyboard controls (WASD/Arrows) for vehicle movement.
- Gamepad support (USB controllers) via standard browser API, prioritizing gamepad over keyboard input.
- Meter-based coordinate system on the server, translated to GeoJSON for map display.
- Client converts server coordinates to GeoJSON, uses MapLibre projection for Pixi sprite placement, and handles initial synchronization on refresh.
- Car sprites loaded from a single SVG asset, dynamically rotated to match heading and tinted by team color.
- Animated toilet item sprites using the smoking_toilet.gif and PixiJS GIF plugin, including collision pickup and carry visuals.
- Vortex visual effect for scored toilets now appears at the exact location where the toilet was returned (using the last carried position), not at the center of the base or attached to the car.
- Basic client-server structure with TypeScript on both ends.
- Team assignment with persistence across refreshes (per browser tab).
- Initial state definition for scores and a single generic pickup item.
- Server-side collision detection (player-item, player-player, player-base).
- Core gameplay loop: Generic item pickup, player-vs-player item stealing, scoring by returning the item to team base.
- Basic server-side AI opponent with simple targeting logic (pursues item carrier or item, returns to base).
- Basic server-side physics response for player-player collisions (bouncing).
- Item transfer occurs on any player-player collision (including teammates), respecting cooldown.
- Enforced one-item-per-player limit: Players can no longer pick up or steal additional items while already carrying one.
- Location search bar to find and jump to specific map locations (using MapTiler Geocoding).
- More accurate player-player collision detection (tuned offset collision point).
- Predictive Road Check: Server anticipates player movement to provide slightly earlier on/off-road status updates for smoother visual feedback.

### Planned / Future
- Client-side prediction for improved input responsiveness.
- Simple AI opponents.
- Improved HUD with game state display (timer, etc.).
- Sound effects.
- Shared code strategy (monorepo or shared package) to avoid schema duplication.
- Deployment configuration.

## Tech Stack

- **Frontend (Client):**
    - React 18
    - Vite
    - TypeScript
    - PixiJS (v8)
    - MapLibre GL JS (v4)
    - Colyseus JavaScript Client (`colyseus.js`)
    - Tailwind CSS (for HUD)
- **Backend (Server):**
    - Node.js (v18+ recommended, v20 specified in `package.json`)
    - TypeScript
    - Colyseus (`@colyseus/core`, `@colyseus/schema`)
    - `nodemon` (for development)
- **Development:**
    - `npm` (Node Package Manager)
    - `pnpm` (for workspace management)

## Getting Started

### Prerequisites
- Node.js (v18 or v20 recommended)
- `pnpm` (Install globally: `npm install -g pnpm`)

### Setup
1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd smugglers-town-ai-gemini
    ```
2.  **Environment Variables:**
    - Create a `.env` file in the `packages/client/` directory
    - Create a `.env` file in the `packages/server/` directory
    - Replace variable values in both
3.  **Install Dependencies:**
    - From the **root directory** (`smugglers-town-ai-gemini`), install all dependencies for all packages using `pnpm`:
      ```bash
      pnpm install
      ```

### Running Locally
1.  **Start the Colyseus Server:**
    - From the **root directory**, run the server's dev script:
      ```bash
      pnpm --filter server dev
      ```
    - The server will start (usually on `ws://localhost:2567`) and automatically restart on file changes thanks to `nodemon`.
2.  **Start the React Client:**
    - From the **root directory**, run the client's dev script:
      ```bash
      pnpm --filter client dev
      ```
    - Vite will build the client and provide a local URL `http://localhost:3010`.
3.  **Open the Game:**
    - Open the client URL in your web browser.
    - Open a second tab/browser to the same URL to see multiplayer functionality.

> **Important Note on Shared Packages:** This project uses shared packages (`packages/shared-schemas`, `packages/shared-utils`). If you make changes to the code within these shared packages, you **must** rebuild the specific shared package *before* the changes will be reflected in the `client` or `server`. Use the following command (replace `<package-name>` with the actual package name like `@smugglers-town/shared-utils`):
>
> ```bash
> pnpm --filter <package-name> build
> ```
>
> For continuous development, you can run the build in watch mode in a separate terminal:
>
> ```bash
> pnpm --filter <package-name> build --watch
> ```

## Project Structure

```
. Smugglers Town AI (Monorepo Root)
├── packages/
│   ├── client/           # React Frontend (Vite, TS, PixiJS, MapLibre)
│   │   ├── src/          # Client source code (components, hooks, features)
│   │   ├── public/       # Static assets
│   │   ├── .env          # Client environment variables (needs creation)
│   │   ├── index.html
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── server/           # Colyseus Backend (Node.js, TS)
│   │   ├── src/          # Server source code (ArenaRoom, game logic, utils)
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── shared-schemas/   # Shared Colyseus state schemas (@smugglers-town/shared-schemas)
│   │   ├── src/          # Schema definitions (ArenaState, Player, FlagState)
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── shared-utils/     # Shared constants and utility functions (@smugglers-town/shared-utils)
│   │   ├── src/          # Constants, coordinate utils, math helpers
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── .gitignore
│   ├── pnpm-workspace.yaml # Defines the workspaces
│   ├── package.json        # Root package.json (may contain root scripts)
│   └── README.md         # This file
└── TASKS.md          # Development task tracking
```

## Client Rendering & UI Layering

The client uses three distinct layers for rendering visuals:

1.  **Base Map Layer (MapLibre GL JS):**
    *   **Purpose:** Displays the underlying real-world map (roads, buildings, water, terrain).
    *   **Coordinates:** Geographic (Latitude, Longitude).
    *   **Updates:** Handles map tile loading, rendering, panning, and zooming.

2.  **Game Object Overlay Layer (PixiJS):**
    *   **Purpose:** Renders dynamic game entities positioned *within the game world* (players, items, bases, visual zones).
    *   **Technology:** PixiJS canvas overlaying the map.
    *   **Coordinates:** Server uses Meters (relative to a world origin). Client converts Meters -> Lat/Lng -> Screen Pixels in the `gameLoop` using `worldToGeo` and `map.project()` for precise positioning on the map.
    *   **Updates:** Redrawn every frame in the `gameLoop` for smooth, map-synchronized movement and placement.
    *   **Important:** To correctly position a PixiJS object (like a Sprite or Graphics) on the map, you *must* perform the Meter -> Lat/Lng -> Screen Pixel conversion within the `gameLoop` and apply the resulting **screen pixel coordinates** to the object's `x` and `y` properties (for sprites/positioned objects) or use them directly in drawing commands like `moveTo/lineTo` (for graphics). This ensures the object stays aligned with the map as it pans and zooms.
    *   **Note:** The base map zoom level and client-side sprite sizes (`CAR_WIDTH`, `CAR_HEIGHT`, item scale) have been adjusted in `GameCanvas.tsx` for better visual scale.
    *   Includes a dynamic navigation arrow fixed to the top-center of the screen, pointing towards the current objective (item, carrier, or player's base).

3.  **HUD/Static UI Layer (React/HTML/CSS):**
    *   **Purpose:** Displays informational elements and controls *not* tied to specific world locations (scores, timers, status messages, controls like AI spawn buttons, map style dropdown, location search bar).
    *   **Technology:** Standard React components, HTML, CSS (Tailwind).
    *   **Coordinates:** Standard CSS positioning (relative to the viewport/container).
    *   **Updates:** Driven by React state changes based on server data or user input.
    *   **Positioning Strategy:**
        *   **Floating Panel Containers:** The main containers for floating UI elements (e.g., the `div` holding the HUD, the `div` holding the right-side controls including AI buttons and the map style dropdown, the `div` holding the location search bar in `GameCanvas.tsx`) use **inline `style` props** for absolute positioning relative to the viewport (`position: 'absolute'`, `top`, `left`, `right`, `bottom`, `transform`). This provides reliable placement over the map/canvas layers.
        *   **Internal Component Layout:** Components *inside* these containers (e.g., `HUD`, `AIControls`, `MapStyleSelector`, `FloatingPanel`) use standard layout methods (like Flexbox or simple stacking, often via Tailwind utilities like `flex`, `gap`, `p-*`, `rounded`, etc.) to arrange their own content. They do **not** typically define their own absolute positioning.
        *   **React-to-PixiJS Positioning (e.g., Navigation Arrow):** For PixiJS elements (like the navigation arrow) that need to be positioned relative to React UI elements (like the HUD), a measurement approach is used:
            1. A React `ref` is attached to the relevant UI element container (e.g., the HUD's wrapper `div`).
            2. A `useEffect` hook measures the element's dimensions (`offsetHeight`).
            3. The dimension is stored in React state and passed as a prop to the relevant PixiJS hook (`useGameLoop`).
            4. The PixiJS hook calculates the sprite's screen position dynamically based on the passed dimension and desired margins (e.g., `arrowScreenY = HUD_TOP_OFFSET + hudHeight + ARROW_MARGIN`). This avoids hardcoded pixel values and ensures the PixiJS element adapts to the UI element's size.
        *   **Third-Party Component Styling (e.g., Location Search):** Integrating third-party UI components (like the MapTiler Geocoding control) into the floating panel style required specific CSS overrides in `src/index.css` to force transparency on its internal elements and apply custom background/hover effects to its container, ensuring visual consistency.

#### Location Changing & World Origin

Changing the active game location involves coordinating the server's world origin with the client's map view:

1.  **World Origin:** The server maintains a `worldOriginLng` and `worldOriginLat` in its `ArenaState`. All game object positions (players, items) are relative to this origin in meters.
2.  **Location Search:** The `LocationSearch` component (using MapTiler Geocoding) allows users to find and select new locations via a search bar UI element.
3.  **Client Action (`pick` event):** When a user *picks* a final location:
    *   The `set_world_origin` message is sent to the server with the new coordinates.
    *   The `onResultSelected` callback is triggered, telling `GameCanvas` to temporarily set `isFollowingPlayer` to `false`.
    *   The Geocoding control's built-in `flyTo` animation handles the visual map transition.
4.  **Server Update:** The server receives `set_world_origin`, updates its `ArenaState`, and broadcasts the change to all clients.
5.  **Animation End (`moveend` event):** Once the control's `flyTo` finishes:
    *   The `mapInstance.setZoom(19)` call ensures the correct final zoom level.
    *   The `onNavigationFinished` callback is triggered, telling `GameCanvas` to set `isFollowingPlayer` back to `true`.
6.  **Synchronization:** The client's game loop (`useGameLoop`) now uses the updated `worldOriginLng`/`Lat` from the server state to correctly calculate sprite positions relative to the new map center. Player following resumes, keeping the local player centered in the view at the correct zoom level.

This process ensures that the game simulation remains synchronized with the server's authoritative state while providing a smooth visual transition for the user initiating the change.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request. (Placeholder - specific guidelines can be added later).

## License

This project is licensed under the MIT License. (Placeholder - confirm if this is accurate).

## Debugging Tips (React Hooks & State Flow)
*   **Props vs Refs in Hooks:** When passing data into a custom hook that needs to react to changes (e.g., inside a `useEffect`), ensure you pass the actual state variable prop, not `someRef.current`. Passing `someRef.current` provides a snapshot and won't trigger the hook's effect when the underlying data changes later. Passing the state variable ensures the hook re-runs when the prop identity changes.
*   **State Updates & Effects:** Remember that `useEffect` runs after the render. If updating state based on server data (like in `useColyseus`), ensure non-primitive state (objects, arrays, Maps) is updated by creating *new* instances so that hooks depending on that state re-run correctly.

## Adding New Gameplay Elements (Development Notes)

Adding new interactive elements (e.g., different pickups, obstacles, capture points) generally follows these steps:

1.  **Define State (Schema):**
    *   Add the necessary state properties for the new element to a `Schema` class (e.g., `ItemState`, `ObstacleState`) in `server/src/schemas/ArenaState.ts`.
    *   Include properties like position (`x`, `y` in meters), status, owner/carrier ID, etc.
    *   Add an instance of this new schema type to the main `ArenaState` class in `packages/shared-schemas/src/ArenaState.ts`.
    *   Ensure the schema is compiled (`pnpm --filter @smugglers-town/shared-schemas build`).

2.  **Implement Server Logic (`server/src/ArenaRoom.ts`):**
    *   **Initialization (`onCreate`):** Set the initial state (position, status) for the new element(s).
    *   **Update Loop (`update`):**
        *   Add collision checks between players and the new element using the defined world coordinates (meters) and radii.
        *   Implement the game logic that happens on collision (e.g., picking up, triggering an effect, modifying player state, modifying element state).
        *   Handle any necessary state resets or position updates for the element (e.g., moving with a carrier, resetting after scoring).
    *   **Lifecycle (`onLeave`, etc.):** Handle cases where a player carrying/interacting with the element leaves the game.

3.  **Implement Client Rendering (`client/src/features/GameCanvas.tsx`):**
    *   **Create Sprite Placeholder (`setupPixi` in `useEffect`)

**Predictive Road Check:**
*   **How it works:** To improve the timing of visual feedback (like dust trails and speed boosts) when moving between roads and off-road areas, the server performs a *predictive* check. In each tick, it calculates where the player is *likely* to be slightly ahead in time (controlled by `PREDICTION_LOOKAHEAD_FACTOR` in the player controllers). It uses this predicted future position to query the map service for road data *before* the player actually arrives there. The result of this query (whether the *predicted* location is on a road) is then used in the *next* tick to determine the player's speed limit and `isOnRoad` status.
*   **Current Value:** The `PREDICTION_LOOKAHEAD_FACTOR` is currently set quite high (e.g., 12 in the controllers) for experimentation, significantly anticipating movement.
*   **Limitations & Improvements:** While this server-side prediction helps, there's still a small inherent delay due to the asynchronous nature of the map query. For truly instant visual feedback precisely aligned with the player's actions, implementing client-side prediction (CSP) would be necessary. CSP involves the client predicting its own movement and road status changes locally before confirming with the server.
