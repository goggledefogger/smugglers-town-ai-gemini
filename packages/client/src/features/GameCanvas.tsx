import React, { useRef, useState, useCallback, useEffect } from 'react';
import maplibregl, { Map, LngLat, Point } from 'maplibre-gl';
import * as PIXI from 'pixi.js';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Client, Room } from 'colyseus.js'; // Re-enabled
import { v4 as uuidv4 } from 'uuid'; // Import uuid
import HUD from '../components/HUD'; // <-- Use default import
import AIControls from '../components/AIControls'; // <-- Use default import
import { Player, ArenaState, FlagState } from "@smugglers-town/shared-schemas"; // <-- Remove ZoneState import
import goldenToiletUrl from '/assets/golden-toilet.svg'; // <-- Import the SVG
import { worldToGeo, geoToWorld, lerp, angleLerp, metersPerDegreeLngApprox, ORIGIN_LAT, METERS_PER_DEGREE_LAT_APPROX, ORIGIN_LNG } from '../utils/coordinateUtils'; // Corrected path to assumed utils dir

// Map and Style
// Read style URL from environment variable
const MAP_STYLE_URL = import.meta.env.VITE_MAPLIBRE_STYLE_URL;
if (!MAP_STYLE_URL) {
    console.error("ERROR: VITE_MAPLIBRE_STYLE_URL environment variable is not set!");
    // Potentially fall back to a default or throw an error
}
const INITIAL_CENTER: [number, number] = [-73.985, 40.758]; // Times Square, NYC (Lng, Lat)
const INITIAL_ZOOM = 19; // Zoom closer (Increased from 17)


// Game Constants - Focus on Pixel Speed for now
// const MAX_SPEED_MPS = 14; // Target real-world speed (for later)
// const PIXELS_PER_METER = 8; // Removing this direct link for now
const MAX_SPEED_PIXELS = 250; // TUNABLE: Target pixels/second panning speed
const ACCEL_RATE = 10; // TUNABLE: How quickly we reach max speed (higher = faster)
const TURN_SMOOTH = 12;

// Client-side visual tuning
const INTERPOLATION_FACTOR = 0.3; // Keep the factor from before
const CAR_WIDTH = 10; // Reduced from 20
const CAR_HEIGHT = 20; // Reduced from 40

// Colyseus Endpoint
const COLYSEUS_ENDPOINT = 'ws://localhost:2567'; // Re-enabled

// Session Storage Key (Changed from Local Storage)
const SESSION_TAB_ID_KEY = 'smugglersTown_sessionTabId';

// Mirror Server Game Logic Constants (needed for base rendering)
// const BASE_DISTANCE = 150; // Meters from origin along X axis - REMOVED
// const Y_OFFSET = 5; // Small vertical offset from center line - REMOVED
// const BASE_RADIUS = 40; // Meters (for scoring/rendering) - REMOVED

// --- Use Server Constants --- (We'll assume these are known or derived from state later)
// For rendering purposes, use the server's values:
const SERVER_BASE_DISTANCE = 80; // meters
const SERVER_Y_OFFSET = 0; // meters
// const SERVER_BASE_RADIUS = 10; // meters (sqrt of server's BASE_RADIUS_SQ=100) <- Collision radius - REMOVED (No longer needed here)
const VISUAL_BASE_RADIUS = 30; // meters <- Should match sqrt(server BASE_RADIUS_SQ)
// const SERVER_COLLISION_RADIUS = 38.5; // meters <- Actual collision radius from server (for debugging viz) - REMOVED

// --- Base Positions (Client-side copy for rendering/UI logic) ---
const RED_BASE_POS = { x: -SERVER_BASE_DISTANCE, y: SERVER_Y_OFFSET };
const BLUE_BASE_POS = { x: SERVER_BASE_DISTANCE, y: -SERVER_Y_OFFSET };
// ------------------------------------------------------------------

// Import Hooks
import { useColyseus } from '../hooks/useColyseus';
import { useInputHandling } from '../hooks/useInputHandling';
import { useMapLibre } from '../hooks/useMapLibre';
import { usePixiApp, PixiRefs } from '../hooks/usePixiApp'; // Keep PixiRefs for type safety
import { useGameLoop } from '../hooks/useGameLoop';

// Helper to draw the car sprite
function drawCar(graphics: PIXI.Graphics, team: string) {
    graphics.clear(); // Clear previous drawing
    const color = team === 'Red' ? 0xff0000 : 0x0000ff; // Red or Blue
    const outlineColor = 0xffffff;

    graphics
        .rect(0, 0, CAR_WIDTH, CAR_HEIGHT).fill({ color: color })
        .poly([CAR_WIDTH / 2, -5, CAR_WIDTH, 10, 0, 10]).fill({ color: outlineColor }); // White arrow
    // Ensure pivot is set (might be redundant if set once at creation, but safe)
    graphics.pivot.set(CAR_WIDTH / 2, CAR_HEIGHT / 2);
}

// --- Component ---
const GameCanvas: React.FC = () => {
    // Refs for DOM containers
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const pixiContainerRef = useRef<HTMLDivElement>(null);

    // --- Hooks ---

    const {
        sessionId,
        players,
        items,
        itemsScoredCount,
        scores,
        gameTimeRemaining,
        isConnected,
        error: colyseusError,
        sendInput,
        addAi
        // TODO: Expose message queue or callbacks from useColyseus for water_reset etc.
    } = useColyseus();

    const inputVector = useInputHandling();
    const mapInstance = useMapLibre({ mapContainerRef });
    const pixiRefs = usePixiApp({
        pixiContainerRef,
        onPixiReady: () => setIsPixiReady(true) // Set flag when Pixi is ready
    });

    // Local Component State
    const [isPixiReady, setIsPixiReady] = useState(false);
    const [showResetMessage, setShowResetMessage] = useState(false);
    const [localPlayerTeam, setLocalPlayerTeam] = useState<'Red' | 'Blue' | undefined>(undefined);

    // TODO: Implement message handling from useColyseus
    // useEffect(() => { ... listen for water_reset ... });

    // Derive local player team for HUD
    useEffect(() => {
        if (sessionId && players.has(sessionId)) {
            const team = players.get(sessionId)?.team;
            setLocalPlayerTeam(team === 'Red' || team === 'Blue' ? team : undefined);
        } else {
            setLocalPlayerTeam(undefined);
        }
    }, [sessionId, players]);

    // Main Game Loop Hook
    useGameLoop({
        pixiRefs,
        mapInstance,
        sessionId,
        players,
        items,
        isConnected,
        sendInput,
        inputVector,
        isPixiReady, // Pass flag to game loop hook
        // updateHudState removed
    });

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }} className="z-0">
            {/* Map & Canvas Layers */}
            <div ref={mapContainerRef} style={{ position: 'absolute', top: 0, bottom: 0, width: '100%', height: '100%' }} className="z-10" />
            <div ref={pixiContainerRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }} className="z-20">
                {/* Pixi canvas appended here by usePixiApp */}
      </div>

            {/* UI Elements */}
      <HUD
        redScore={scores.red}
        blueScore={scores.blue}
        gameTimeRemaining={gameTimeRemaining}
                localPlayerTeam={localPlayerTeam}
                itemsScoredCount={itemsScoredCount} // Use scored count
            />
            <AIControls onAddAi={addAi} />

            {/* Colyseus Connection/Error Info (Optional Debug) */}
            <div style={{
                 position: 'absolute', bottom: '10px', left: '10px',
                 backgroundColor: 'rgba(0,0,0,0.5)', color: 'white', padding: '5px', borderRadius: '3px', fontSize: '0.8em', zIndex: 50
             }}>
                 {isConnected ? `Connected (ID: ${sessionId})` : 'Disconnected'}
                 {colyseusError && <div style={{ color: 'red' }}>Error: {colyseusError}</div>}
            </div>

            {/* Water Reset Message (Keep local state for now) */}
      {showResetMessage && (
        <div style={{
                    position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
                    padding: '10px 20px', backgroundColor: 'rgba(255, 0, 0, 0.7)', color: 'white',
                    borderRadius: '5px', zIndex: 1000, pointerEvents: 'none'
        }}>
          SPLASH! You hit the water!
        </div>
      )}
    </div>
  );
};

export default GameCanvas;
