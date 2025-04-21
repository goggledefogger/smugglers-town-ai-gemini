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
    - Tailwind CSS (for HUD - planned)
- **Backend (Server):**
    - Node.js (v18+ recommended, v20 specified in `package.json`)
    - TypeScript
    - Colyseus (`@colyseus/core`, `@colyseus/schema`)
    - `nodemon` (for development)
- **Development:**
    - `npm` (Node Package Manager)

## Getting Started

### Prerequisites
- Node.js (v18 or v20 recommended)
- npm

### Setup
1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd smugglers-town-ai-gemini
    ```
2.  **Environment Variables:**
    - Create a `.env` file in the `client/` directory:
      ```
      VITE_MAPLIBRE_STYLE_URL="YOUR_MAPLIBRE_STYLE_URL"
      ```
    - Replace `"YOUR_MAPLIBRE_STYLE_URL"` with a valid MapLibre style URL (e.g., from MapTiler Cloud, Stadia Maps, etc.).
3.  **Install Dependencies:**
    - Install server dependencies:
      ```bash
      cd server
      npm install
      ```
    - Install client dependencies:
      ```bash
      cd ../client
      npm install
      ```

### Running Locally
1.  **Start the Colyseus Server:**
    - Open a terminal in the `server/` directory:
      ```bash
      npm run dev
      ```
    - The server will start (usually on `ws://localhost:2567`) and automatically restart on file changes thanks to `nodemon`.
2.  **Start the React Client:**
    - Open a second terminal in the `client/` directory:
      ```bash
      npm run dev
      ```
    - Vite will build the client and provide a local URL (usually `http://localhost:5173`).
3.  **Open the Game:**
    - Open the client URL in your web browser.
    - Open a second tab/browser to the same URL to see multiplayer functionality.

## Project Structure

```
.
├── client/           # React Frontend (Vite, TypeScript, PixiJS, MapLibre)
│   ├── public/
│   │   ├── components/ # React UI components (e.g., HUD)
│   │   ├── features/   # Core game logic (e.g., GameCanvas)
│   │   ├── schemas/    # (Temporary) Duplicated Colyseus schemas
│   │   └── ...
│   ├── .env          # Client environment variables (needs creation)
│   ├── index.html
│   ├── package.json
│   └── tsconfig.json
├── server/           # Colyseus Backend (Node.js, TypeScript)
│   ├── src/
│   │   ├── schemas/    # Authoritative Colyseus state schemas
│   │   ├── ArenaRoom.ts # Main game room logic, including player lifecycle, input handling, physics, collision detection, game rules, and AI control.
│   │   └── index.ts     # Server entry point
│   ├── package.json
│   └── tsconfig.json
├── .gitignore
├── README.md         # This file
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

3.  **HUD/Static UI Layer (React/HTML/CSS):**
    *   **Purpose:** Displays informational elements and controls *not* tied to specific world locations (scores, timers, buttons, status messages).
    *   **Technology:** Standard React components, HTML, CSS.
    *   **Coordinates:** Standard CSS positioning (relative to the viewport/container).
    *   **Updates:** Driven by React state changes based on server data or user input.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request. (Placeholder - specific guidelines can be added later).

## License

This project is licensed under the MIT License. (Placeholder - confirm if this is accurate).

## Adding New Gameplay Elements (Development Notes)

Adding new interactive elements (e.g., different pickups, obstacles, capture points) generally follows these steps:

1.  **Define State (Schema):**
    *   Add the necessary state properties for the new element to a `Schema` class (e.g., `ItemState`, `ObstacleState`) in `server/src/schemas/ArenaState.ts`.
    *   Include properties like position (`x`, `y` in meters), status, owner/carrier ID, etc.
    *   Add an instance of this new schema type to the main `ArenaState` class.
    *   **(Temporary):** Duplicate these schema changes in `client/src/schemas/ArenaState.ts`.

2.  **Implement Server Logic (`server/src/ArenaRoom.ts`):**
    *   **Initialization (`onCreate`):** Set the initial state (position, status) for the new element(s).
    *   **Update Loop (`update`):**
        *   Add collision checks between players and the new element using the defined world coordinates (meters) and radii.
        *   Implement the game logic that happens on collision (e.g., picking up, triggering an effect, modifying player state, modifying element state).
        *   Handle any necessary state resets or position updates for the element (e.g., moving with a carrier, resetting after scoring).
    *   **Lifecycle (`onLeave`):** Handle cases where a player carrying/interacting with the element leaves the game.

3.  **Implement Client Rendering (`client/src/features/GameCanvas.tsx`):**
    *   **Create Sprite Placeholder (`setupPixi` in `useEffect`):** Create a `PIXI.Graphics` or `PIXI.Sprite` object for the element, start it off-screen and invisible, and store it in a `useRef`.
    *   **Get State:** Access the element's state directly from the `gameRoom.current.state` object within the `gameLoop`.
    *   **Initial Placement (`gameLoop` - `!initialPlacementDone` block):**
        *   On the first frame after connection, get the element's world position (`x`, `y`) from the state.
        *   Convert meters to Geo (`worldToGeo`).
        *   Project Geo to screen coordinates (`map.project`).
        *   Set the sprite's `x`, `y`, and `visible` properties directly (no interpolation).
    *   **Update Position/Visibility (`gameLoop` - regular update):**
        *   Get the element's current world position and status from the state.
        *   Convert/Project to get the target screen position.
        *   Update the sprite's `x` and `y` using interpolation (`lerp`) towards the target screen position.
        *   Set the sprite's `visible` property based on its status (e.g., hide if carried and rendered attached to player, show if at base/dropped).
        *   If the element should visually attach to a player (like the current item), calculate its position relative to the carrier sprite's screen coordinates and rotation.

4.  **Coordinate System Reminder:** The server operates purely in meters relative to the world origin (`ORIGIN_LNG`, `ORIGIN_LAT`). The client is responsible for converting these meter coordinates to Lng/Lat for MapLibre projection to get the correct screen coordinates for Pixi rendering.

5.  **Base Radius Sync:** Ensure the visual base radius on the client (`client/src/features/GameCanvas.tsx::VISUAL_BASE_RADIUS`) matches the intended collision radius on the server (`sqrt(server/src/config/constants.ts::BASE_RADIUS_SQ)`). The server collision logic uses the player's front point against this radius.
