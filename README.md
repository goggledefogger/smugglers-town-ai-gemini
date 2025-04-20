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
- Initial state definition for scores and generic pickup items (flags/toilets).
- Collision-based pickup of items.

### Planned / Future
- Core game logic: Carrying items, scoring by returning items to team base.
- Client-side prediction for improved input responsiveness.
- Server-side collision detection (player-base, player-player).
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
│   │   ├── ArenaRoom.ts # Main game room logic
│   │   └── index.ts     # Server entry point
│   ├── package.json
│   └── tsconfig.json
├── .gitignore
├── README.md         # This file
└── TASKS.md          # Development task tracking
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request. (Placeholder - specific guidelines can be added later).

## License

This project is licensed under the MIT License. (Placeholder - confirm if this is accurate).
