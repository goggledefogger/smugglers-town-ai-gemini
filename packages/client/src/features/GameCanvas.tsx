import { useRef, useState, useEffect, useCallback } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CAR_HEIGHT } from '@smugglers-town/shared-utils';

// Hooks
import { useMapLibre } from '../hooks/useMapLibre';
import { usePixiApp } from '../hooks/usePixiApp';
import { useColyseus } from '../hooks/useColyseus';
import { useInputManager } from '../hooks/useInputManager';
import { useGameLoop } from '../hooks/useGameLoop';
import { useDustParticles } from '../hooks/useDustParticles';
import { useSmoothedServerTime } from '../hooks/useSmoothedServerTime';

// Components
import HUD from '../components/HUD';
import AIControls from '../components/AIControls';
import MapStyleSelector from '../components/MapStyleSelector';
import { LocationSearch } from '../components/LocationSearch';
import { FloatingPanel } from '../components/FloatingPanel';

const API_KEY = import.meta.env.VITE_MAPTILER_API_KEY;

// Default map style ID for initial rendering
const DEFAULT_MAP_STYLE_ID = 'winter-v2';

export function GameCanvas() {
    // --- Refs --- (Keep separate from state if not causing re-renders)
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const pixiContainerRef = useRef<HTMLDivElement>(null);
    const hudWrapperRef = useRef<HTMLDivElement>(null);

    // --- State --- (Causes re-renders when changed)
    const [currentMapStyleId, setCurrentMapStyleId] = useState<string>(DEFAULT_MAP_STYLE_ID);
    const [isPixiReady, setIsPixiReady] = useState(false);
    const [showDebug, setShowDebug] = useState(false);
    const [isFollowingPlayer, setIsFollowingPlayer] = useState(true);
    const [hudHeight, setHudHeight] = useState<number>(60);

    // --- Hooks --- (Order can matter)
    const mapInstanceRef = useMapLibre({
        mapContainerRef,
        currentMapStyleId, // Pass current style ID state
    });

    // Stable callback for Pixi readiness
    const handlePixiReady = useCallback(() => setIsPixiReady(true), []);

    const pixiRefs = usePixiApp({
        pixiContainerRef,
        onPixiReady: handlePixiReady,
        carHeight: CAR_HEIGHT,
    });

    const colyseusState = useColyseus();
    const { // Destructure only what's needed from Colyseus return
        sessionIdRef,
        room,
        players,
        itemsScoredCount,
        scores,
        gameTimeRemaining,
        isConnected,
        error: colyseusError,
        sendInput,
        addAiPlayer,
        arenaStateRef,
    } = colyseusState;

    const { inputVector } = useInputManager();

    // --- Use the smoothed timer hook ---
    const smoothedGameTime = useSmoothedServerTime(gameTimeRemaining);
    // ---------------------------------

    // --- Derived State --- (Move localPlayerTeam up)
    const derivedTeam = players.get(sessionIdRef.current ?? '')?.team;
    const localPlayerTeam = derivedTeam === 'none' ? undefined : derivedTeam;

    // --- Effect to measure HUD height ---
    useEffect(() => {
        if (hudWrapperRef.current) {
            setHudHeight(hudWrapperRef.current.offsetHeight);
        }
        // Re-run if potential height-affecting props change
    }, [scores, gameTimeRemaining, localPlayerTeam, itemsScoredCount]); // Now localPlayerTeam is defined
    // -------------------------------------

    // --- Memoized Callback for LocationSearch ---
    const handleLocationSelected = useCallback(() => {
        console.log("[GameCanvas] Location selected, disabling player follow.");
        setIsFollowingPlayer(false);
    }, []); // Empty dependency array: function identity is stable
    // -------------------------------------------

    // --- Callback to re-enable following after map navigation ---
    const handleNavigationFinished = useCallback(() => {
        console.log("[GameCanvas] Map navigation finished, re-enabling player follow.");
        setIsFollowingPlayer(true);
    }, []); // Empty dependency array: function identity is stable
    // -----------------------------------------------------------

    // --- Game Loop Hook --- (Run after other hooks have initialized)
    useGameLoop({
        pixiRefs,
        mapInstance: mapInstanceRef,
        sessionId: sessionIdRef.current,
        arenaStateRef,
        isConnected,
        sendInput,
        inputVector,
        isPixiReady,
        carHeight: CAR_HEIGHT,
        isFollowingPlayer,
        hudHeight,
    });

    // --- Dust Particles Hook ---
    useDustParticles({
        app: pixiRefs.current?.app ?? null,
        players,
        pixiRefs,
        sessionIdRef,
        carHeight: CAR_HEIGHT,
    });

    return (
        <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
            {/* Map & Pixi Container Layers */}
            <div ref={mapContainerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            <div ref={pixiContainerRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />

            {/* Location Search Control */}
            {mapInstanceRef.current && API_KEY && (
                <div
                    style={{ position: 'absolute', top: 10, left: 10, zIndex: 20 }}
                    className="shadow-lg rounded p-1"
                 >
                    <LocationSearch
                        mapInstance={mapInstanceRef.current}
                        apiKey={API_KEY}
                        onResultSelected={handleLocationSelected}
                        onNavigationFinished={handleNavigationFinished}
                        room={room}
                    />
                </div>
            )}

            {/* HUD Centered at Top */}
            <div
                ref={hudWrapperRef}
                style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 15 }}
            >
                <FloatingPanel
                    className="rounded shadow-md px-4 py-2 min-w-[220px] max-w-[320px]"
                    style={{ backdropFilter: 'blur(2px)', opacity: 0.6 }}
                >
                    <HUD
                        redScore={scores.red}
                        blueScore={scores.blue}
                        localPlayerTeam={localPlayerTeam}
                        gameTimeRemaining={smoothedGameTime}
                        itemsScoredCount={itemsScoredCount}
                    />
                </FloatingPanel>
            </div>

            {/* --- Absolute Positioned UI Elements --- */}
            <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10 }} className="flex flex-col space-y-2 items-end">
                <FloatingPanel className="rounded mb-1">
                    <AIControls onAddAi={addAiPlayer} />
                </FloatingPanel>
                {API_KEY && mapInstanceRef.current && (
                    <FloatingPanel className="rounded mb-1">
                        <MapStyleSelector
                            currentStyleId={currentMapStyleId}
                            onStyleChange={setCurrentMapStyleId}
                        />
                    </FloatingPanel>
                )}
                <FloatingPanel className="rounded">
                    <button
                        onClick={() => setShowDebug(prev => !prev)}
                        className="bg-transparent text-white p-1 px-2 rounded text-xs opacity-80 hover:opacity-100 shadow"
                    >
                        {showDebug ? 'Hide' : 'Show'} Debug
                    </button>
                </FloatingPanel>
            </div>

            {/* Bottom-Left Status */}
            <div style={{ position: 'absolute', bottom: '10px', left: '10px', zIndex: 30 }}>
                <FloatingPanel className="p-2 rounded text-white text-xs shadow-md min-w-[180px]">
                    {isConnected ? `Status: Connected (ID: ${sessionIdRef.current ?? 'N/A'})` : 'Status: Disconnected'}
                    {colyseusError && <div style={{ marginTop: '0.25rem', color: '#fde047' }}>Error: {colyseusError}</div>}
                </FloatingPanel>
            </div>

            {/* Debug Panel Placeholder */}
            {showDebug && (
                <div style={{ position: 'absolute', bottom: '40px', left: '10px', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '5px', fontSize: '10px', zIndex: 30, maxHeight: '40%', overflowY: 'auto' }}>
                    <p>Debug Panel Placeholder</p>
                    <p>Session ID: {sessionIdRef.current ?? 'N/A'}</p>
                    <p>Map Style ID: {currentMapStyleId}</p>
                    <p>Pixi Ready: {isPixiReady ? 'Yes' : 'No'}</p>
                    <p>Players: {players.size}</p>
                    <p>Following Player: {isFollowingPlayer ? 'Yes' : 'No'}</p>
                    {!isFollowingPlayer && (
                        <button
                            onClick={() => setIsFollowingPlayer(true)}
                            className="mt-2 bg-blue-600 hover:bg-blue-700 text-white p-1 rounded text-xs"
                        >
                            Re-Follow Player
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
