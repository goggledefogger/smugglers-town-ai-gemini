# Real-World Map CTF Racer

A browser-based, real-time multiplayer "capture-the-flag" style game played on a real-world map, inspired by games like Smuggler's Run.

## Core Technologies

*   **Frontend (Client):**
    *   React + TypeScript
    *   Vite (Build Tool)
    *   MapLibre GL JS (Interactive Map Rendering)
    *   Pixi.js (2D WebGL Overlay Rendering for sprites/effects)
    *   Colyseus JavaScript Client (WebSocket Networking)
    *   Tailwind CSS (Styling - Placeholder)
*   **Backend (Server):**
    *   Node.js + TypeScript
    *   Colyseus Framework (WebSocket Server, Room Management, State Synchronization)
    *   Express (Underlying HTTP server for Colyseus)

## Architecture Overview

The game employs a standard **server-authoritative** model for real-time multiplayer gameplay.

1.  **Server (`./server`):**
    *   Runs a Colyseus game server.
    *   Manages game rooms (`ArenaRoom`).
    *   Maintains the **authoritative game state** (`ArenaState`) using `@colyseus/schema`. This includes player positions, headings, scores, etc.
    *   Receives player input (`{dx, dy}`) via WebSockets.
    *   Runs the **physics simulation** in a fixed `update` loop (currently 60Hz). Physics operates in a **2D meter-based world coordinate system** relative to a fixed origin.
    *   Calculates player velocity and position based on input and game rules (speed, acceleration).
    *   Automatically synchronizes changes in `ArenaState` back to all connected clients in the room.

2.  **Client (`./client`):**
    *   Connects to the Colyseus server via WebSockets.
    *   Receives `ArenaState` updates from the server.
    *   **Renders the Game:**
        *   Uses **MapLibre GL JS** to display the real-world map background.
        *   Uses **Pixi.js** to render sprites (cars, etc.) on a transparent overlay canvas positioned above the map.
    *   **Coordinate Mapping:**
        *   Receives player state in meters (`x`, `y`) from the server.
        *   Uses helper functions (`worldToGeo`) to convert the authoritative meter coordinates to geographic coordinates (`[Lng, Lat]`).
        *   Centers the MapLibre map on the local player's authoritative geographic coordinates (`map.setCenter`).
    *   **Sprite Positioning (in `gameLoop`):**
        *   The Pixi rendering loop (`gameLoop`) runs every animation frame.
        *   It takes the latest known authoritative server position for the local player.
        *   It converts this position to `[Lng, Lat]`.
        *   It uses MapLibre's `map.project()` function to get the correct **screen pixel coordinates** for the player relative to the *currently rendered* map view.
        *   It directly sets the Pixi sprite's `x`, `y`, and `rotation` based on the projected coordinates and server heading.
        *   *(Next Step: Re-introduce interpolation here for visual smoothness)*.
    *   **Input Handling:**
        *   Captures keyboard input (WASD/Arrows).
        *   Sends normalized direction vectors (`{dx, dy}`) to the server on every frame via the `gameLoop`.

## Setup

1.  **Prerequisites:** Node.js (v18+ recommended, check `server/package.json` for specific engine requirements), npm.
2.  **Clone Repository:** `git clone <repository-url>`
3.  **Install Dependencies:**
    *   Navigate to the `server` directory: `cd server && npm install`
    *   Navigate to the `client` directory: `cd ../client && npm install`
4.  **Environment Variables:**
    *   Create a `.env` file in the `client` directory (`client/.env`).
    *   Add your MapLibre style URL: `VITE_MAPLIBRE_STYLE_URL=YOUR_MAPLIBRE_STYLE_URL_HERE`
        *   You can get free vector styles from sources like [Maptiler Cloud](https://cloud.maptiler.com/) or self-host.

## Running the Project

1.  **Start the Server:**
    *   Navigate to the `server` directory.
    *   Run: `npm run dev`
    *   This uses `nodemon` to watch for changes and automatically restart the server.
2.  **Start the Client:**
    *   Navigate to the `client` directory.
    *   Run: `npm run dev`
    *   This starts the Vite development server.
3.  **Open in Browser:** Access the URL provided by the Vite dev server (usually `http://localhost:5173`).
