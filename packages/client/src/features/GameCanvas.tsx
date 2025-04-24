import React, { useRef, useState, useEffect, useCallback } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import HUD from '../components/HUD'; // <-- Use default import
import AIControls from '../components/AIControls'; // <-- Use default import
import MapStyleSelector from '../components/MapStyleSelector'; // <-- ADDED
import { useColyseus } from '../hooks/useColyseus';
import { useInputManager } from '../hooks/useInputManager';
import { useMapLibre } from '../hooks/useMapLibre';
import { usePixiApp } from '../hooks/usePixiApp'; // Keep PixiRefs for type safety
import { useGameLoop } from '../hooks/useGameLoop';

// Map and Style
// Use a default style ID initially, will be refactored to read from env/state
const DEFAULT_MAP_STYLE_ID = 'streets-v2';

// --- Visual Constants ---
const CAR_HEIGHT = 75; // Define only the height

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

    const { inputVector } = useInputManager();

    // Local Component State
    const [currentMapStyleId, setCurrentMapStyleId] = useState<string>(DEFAULT_MAP_STYLE_ID);
    const [isPixiReady, setIsPixiReady] = useState(false);
    const [showResetMessage] = useState(false);
    const [localPlayerTeam, setLocalPlayerTeam] = useState<'Red' | 'Blue' | undefined>(undefined);

    // MapLibre Hook (pass currentMapStyleId state)
    const mapInstance = useMapLibre({ mapContainerRef, currentMapStyleId });

    // Stable callback for when Pixi is ready
    const handlePixiReady = useCallback(() => {
        console.log("[GameCanvas handlePixiReady] Setting isPixiReady to true");
        setIsPixiReady(true);
    }, []); // Empty dependency array ensures the function identity is stable

    const pixiRefs = usePixiApp({
        pixiContainerRef,
        onPixiReady: handlePixiReady, // Pass the stable callback
        carHeight: CAR_HEIGHT, // Pass only height
    });

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
        carHeight: CAR_HEIGHT, // Pass only height
        // updateHudState removed
    });

  return (
    <div className="relative w-full h-screen z-0">
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
            <MapStyleSelector // <-- ADDED
                currentStyleId={currentMapStyleId}
                onStyleChange={setCurrentMapStyleId}
            />

            {/* Colyseus Connection/Error Info (Optional Debug) */}
            {/* Use inline style positioning, Tailwind for others - Remove debug border */}
            <div
                style={{ position: 'absolute', top: '1rem', left: '1rem' }} // ~ top-4 left-4
                className="p-2 bg-gray-800 bg-opacity-70 rounded text-white text-xs shadow-md z-30" // Removed border
            >
                 {isConnected ? `Connected (ID: ${sessionId})` : 'Disconnected'}
                 {colyseusError && <div style={{ marginTop: '0.25rem', color: '#fde047' }}>Error: {colyseusError}</div>} {/* ~mt-1 text-yellow-300 */}
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
