# Smuggler's Town AI

A real-time multiplayer web game POC built with React, PixiJS, MapLibre GL JS, and Colyseus. Players control vehicles on a real-world map, competing to retrieve items and return them to their base.

## Features

### Current
- Real-time synchronization of player position and heading using Colyseus.
- Map rendering using MapLibre GL JS centered on a real-world location (Times Square, NYC).
- 2D vehicle rendering overlay using PixiJS.
- Server-authoritative movement with client-side interpolation for smoothness.
- Keyboard controls (WASD/Arrows) for vehicle movement.
- Meter-based coordinate system on the server, translated to GeoJSON for map display.
- Client converts server coordinates to GeoJSON, uses MapLibre projection for Pixi sprite placement, and handles initial synchronization on refresh.
- Basic client-server structure with TypeScript on both ends.
- Team assignment with persistence across refreshes (per browser tab).
- Initial state definition for scores and a single generic pickup item.
- Server-side collision detection (player-item, player-player, player-base).
- Core gameplay loop: Generic item pickup, player-vs-player item stealing, scoring by returning the item to team base.
- Basic server-side AI opponent with simple targeting logic (pursues item carrier or item, returns to base).
- Basic server-side physics response for player-player collisions (bouncing).
- Item transfer occurs on any player-player collision (including teammates), respecting cooldown.

### Planned / Future
- Client-side prediction for improved input responsiveness.
- Simple AI opponents.
- Improved HUD with game state display (timer, etc.).
- Refined visuals (Golden Toilet item, smoke effects) and sound effects.
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
    *   **Purpose:** Displays informational elements and controls *not* tied to specific world locations (scores, timers, buttons, status messages).
    *   **Technology:** Standard React components, HTML, CSS.
    *   **Coordinates:** Standard CSS positioning (relative to the viewport/container).
    *   **Updates:** Driven by React state changes based on server data or user input.
    *   **Positioning Note:** Due to unresolved issues with Tailwind CSS positioning utilities (`absolute`, `top-*`, `left-*`, etc.) within this project setup, absolutely positioned UI elements (like the HUD, AI Controls, Map Selector, Debug Info) should use **inline `style` props** for `position`, `top`, `left`, `right`, `bottom`. Other styling (colors, padding, text, borders) should still use standard Tailwind `className` utilities.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request. (Placeholder - specific guidelines can be added later).

## License

This project is licensed under the MIT License. (Placeholder - confirm if this is accurate).

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
    *   **Create Sprite Placeholder (`setupPixi` in `useEffect`
