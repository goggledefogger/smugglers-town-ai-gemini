import React, { useRef, useEffect, useState, useCallback } from 'react';
import maplibregl, { Map, LngLat, Point } from 'maplibre-gl';
import * as PIXI from 'pixi.js';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Client, Room } from 'colyseus.js'; // Re-enabled
import HUD from '../components/HUD'; // Re-enabled
import { ArenaState, Player } from '../schemas/ArenaState'; // Re-enabled

// Map and Style
// Read style URL from environment variable
const MAP_STYLE_URL = import.meta.env.VITE_MAPLIBRE_STYLE_URL;
if (!MAP_STYLE_URL) {
    console.error("ERROR: VITE_MAPLIBRE_STYLE_URL environment variable is not set!");
    // Potentially fall back to a default or throw an error
}
const INITIAL_CENTER: [number, number] = [-73.985, 40.758]; // Times Square, NYC (Lng, Lat)
const INITIAL_ZOOM = 17; // Zoom closer

// World Origin (matches initial map center)
const ORIGIN_LNG = INITIAL_CENTER[0];
const ORIGIN_LAT = INITIAL_CENTER[1];
const METERS_PER_DEGREE_LAT_APPROX = 111320;

// Game Constants - Focus on Pixel Speed for now
// const MAX_SPEED_MPS = 14; // Target real-world speed (for later)
// const PIXELS_PER_METER = 8; // Removing this direct link for now
const MAX_SPEED_PIXELS = 250; // TUNABLE: Target pixels/second panning speed
const ACCEL_RATE = 10; // TUNABLE: How quickly we reach max speed (higher = faster)
const TURN_SMOOTH = 12;

// Client-side visual tuning
const INTERPOLATION_FACTOR = 0.3; // Keep the factor from before

// Colyseus Endpoint
const COLYSEUS_ENDPOINT = 'ws://localhost:2567'; // Re-enabled

// --- Helper Functions ---
function lerp(start: number, end: number, factor: number): number {
  return start + factor * (end - start);
}

function angleLerp(startAngle: number, endAngle: number, factor: number): number {
  const delta = endAngle - startAngle;
  const shortestAngle = ((delta + Math.PI) % (2 * Math.PI)) - Math.PI;
  return startAngle + factor * shortestAngle;
}

// Helper to get meters per degree longitude at a given latitude
function metersPerDegreeLngApprox(latitude: number): number {
    return METERS_PER_DEGREE_LAT_APPROX * Math.cos(latitude * Math.PI / 180);
}

// Approximate conversion from world meters (relative to origin) to Geo coords
function worldToGeo(x_meters: number, y_meters: number): [number, number] { // [lng, lat]
    const metersPerLng = metersPerDegreeLngApprox(ORIGIN_LAT); // Use origin lat for approximation
    if (!isFinite(metersPerLng) || metersPerLng === 0) return [ORIGIN_LNG, ORIGIN_LAT]; // Avoid division by zero
    const deltaLng = x_meters / metersPerLng;
    const deltaLat = y_meters / METERS_PER_DEGREE_LAT_APPROX;
    return [ORIGIN_LNG + deltaLng, ORIGIN_LAT + deltaLat];
}

// --- Component ---
interface GameCanvasProps {}
interface InputState { up: boolean; down: boolean; left: boolean; right: boolean; }
type ArenaRoomType = Room<ArenaState>; // Re-enabled

const GameCanvas: React.FC<GameCanvasProps> = () => {
  // --- Refs ---
  const mapContainer = useRef<HTMLDivElement>(null);
  const pixiContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<Map | null>(null);
  const pixiApp = useRef<PIXI.Application | null>(null);
  const isMounted = useRef(false);
  const pixiInitComplete = useRef(false);
  const inputState = useRef<InputState>({ up: false, down: false, left: false, right: false });
  const carSprite = useRef<PIXI.Graphics | null>(null);
  const otherPlayerSprites = useRef<{ [sessionId: string]: PIXI.Graphics }>({});
  const allPlayersServerState = useRef<{ [sessionId: string]: Player }>({}); // Use object for state
  const mapTargetCenter = useRef<LngLat | null>(null);
  const colyseusClient = useRef<Client | null>(null);
  const gameRoom = useRef<ArenaRoomType | null>(null);

  // Debug refs for local-only panning test
  const debugLocalX = useRef<number>(0);
  const debugLocalY = useRef<number>(0);
  const debugSpeed = 5; // Meters per frame equivalent for testing

  // --- Game Loop ---
  const gameLoop = useCallback((ticker: PIXI.Ticker) => {
    const normalizedDeltaFactor = ticker.deltaMS / (1000 / 60);
    const lerpFactor = Math.min(INTERPOLATION_FACTOR * normalizedDeltaFactor, 1.0);

    // --- Send Input ---
    if (gameRoom.current) {
        const input = inputState.current;
        const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
        gameRoom.current.send("input", { dx, dy });
    }

    // --- Map Interpolation ---
    if (mapInstance.current && mapTargetCenter.current) {
        const currentMap = mapInstance.current;
        const currentCenter = currentMap.getCenter();
        const targetCenter = mapTargetCenter.current;
        const nextLng = lerp(currentCenter.lng, targetCenter.lng, lerpFactor);
        const nextLat = lerp(currentCenter.lat, targetCenter.lat, lerpFactor);
        if (Math.abs(currentCenter.lng - nextLng) > 1e-7 || Math.abs(currentCenter.lat - nextLat) > 1e-7) {
             try { currentMap.setCenter([nextLng, nextLat]); } catch (e) { console.warn("Error setting interpolated map center:", e); }
        }
    }

    // --- Sprite Interpolation (Projecting Target Here) ---
    if (pixiApp.current && mapInstance.current) {
        const currentMap = mapInstance.current;

        // Log keys once per frame before loop if needed
        // console.log("Other Sprites Keys:", Object.keys(otherPlayerSprites.current));

        // Iterate using Object.keys
        Object.keys(allPlayersServerState.current).forEach((sessionId: string) => {
            const playerState = allPlayersServerState.current[sessionId];
            const isLocalPlayer = sessionId === gameRoom.current?.sessionId;
            const sprite = isLocalPlayer ? carSprite.current : otherPlayerSprites.current[sessionId];

            // *** DEBUG LOGGING START ***
            // console.log(`[GameLoop] Processing SID: ${sessionId}, Local?: ${isLocalPlayer}, Room SID: ${gameRoom.current?.sessionId}, Sprite Found?: ${!!sprite}, OtherSpriteKeys: ${JSON.stringify(Object.keys(otherPlayerSprites.current))}`);
            // *** DEBUG LOGGING END ***

            if (!sprite) {
                if (!isLocalPlayer) console.warn(`[GameLoop] Sprite missing for remote player: ${sessionId}`);
                return;
            }

            if (playerState && isFinite(playerState.x) && isFinite(playerState.y) && isFinite(playerState.heading)) {
                try {
                    const [targetLng, targetLat] = worldToGeo(playerState.x, playerState.y);
                    const targetScreenPos = currentMap.project([targetLng, targetLat]);
                    if (!isFinite(targetScreenPos?.x) || !isFinite(targetScreenPos?.y)) {
                         throw new Error("Invalid projected screen pos in gameLoop");
                    }
                    const targetRotation = -playerState.heading + Math.PI / 2;

                    // Interpolate Sprite towards target
                    sprite.x = lerp(sprite.x, targetScreenPos.x, lerpFactor);
                    sprite.y = lerp(sprite.y, targetScreenPos.y, lerpFactor);
                    sprite.rotation = angleLerp(sprite.rotation, targetRotation, lerpFactor);
                    sprite.visible = true;

                } catch (e) {
                    console.warn(`Error updating sprite ${sessionId} in gameLoop:`, e);
                    sprite.visible = false;
                 }
            } else {
                sprite.visible = false;
            }
        });
    }
  }, []);

  // Input Handlers (Keep)
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
      switch (event.key) {
          case 'w': case 'ArrowUp': inputState.current.up = true; break;
          case 's': case 'ArrowDown': inputState.current.down = true; break;
          case 'a': case 'ArrowLeft': inputState.current.left = true; break;
          case 'd': case 'ArrowRight': inputState.current.right = true; break;
      }
  }, []);
  const handleKeyUp = useCallback((event: KeyboardEvent) => {
       switch (event.key) {
          case 'w': case 'ArrowUp': inputState.current.up = false; break;
          case 's': case 'ArrowDown': inputState.current.down = false; break;
          case 'a': case 'ArrowLeft': inputState.current.left = false; break;
          case 'd': case 'ArrowRight': inputState.current.right = false; break;
      }
  }, []);

  // Colyseus Connection Logic (Restore)
  const connectToServer = useCallback(async () => {
    if (gameRoom.current || !isMounted.current) return;
    console.log(`Attempting to connect to Colyseus server at ${COLYSEUS_ENDPOINT}...`);
    colyseusClient.current = new Client(COLYSEUS_ENDPOINT);
    try {
        const room = await colyseusClient.current.joinOrCreate<ArenaState>('arena', {});
        gameRoom.current = room;
        console.log(`Joined room '${room.name}' successfully! SessionId: ${room.sessionId}`);

        room.onStateChange((state: ArenaState) => {
            if (!mapInstance.current || !pixiApp.current || !isMounted.current) return;

            const incomingPlayerIds = new Set<string>();
            const newState: { [sessionId: string]: Player } = {};

            // Update state for current players
            state.players.forEach((player, sessionId) => {
                incomingPlayerIds.add(sessionId);
                // Store the actual Player instance
                newState[sessionId] = player;
            });

            // Update the ref object
            allPlayersServerState.current = newState;

            // Update Map Target Center based on local player
            const localPlayerState = allPlayersServerState.current[room.sessionId];
            if (localPlayerState && isFinite(localPlayerState.x) && isFinite(localPlayerState.y)) {
                 try {
                    const [targetLng, targetLat] = worldToGeo(localPlayerState.x, localPlayerState.y);
                    if (!isFinite(targetLng) || !isFinite(targetLat)) throw new Error("Invalid target LngLat");
                    mapTargetCenter.current = new LngLat(targetLng, targetLat);
                 } catch(e) {
                    console.warn("Error calculating map target center:", e);
                    mapTargetCenter.current = null;
                 }
            } else {
                mapTargetCenter.current = null; // Clear target if local state is invalid
            }

            // --- Create/Remove Other Player Sprites ---
            incomingPlayerIds.forEach(sessionId => {
                if (sessionId === room.sessionId) return;
                let sprite = otherPlayerSprites.current[sessionId];
                if (!sprite && pixiApp.current?.stage) {
                    // Check if player state actually exists before creating sprite?
                    // Although it should if the key is in incomingPlayerIds
                    console.log(`Creating sprite for player ${sessionId}`);
                    const otherCarWidth = 20; const otherCarHeight = 40;
                    // --- Create Blue Sprite ---
                    sprite = new PIXI.Graphics()
                        .rect(0, 0, otherCarWidth, otherCarHeight).fill({ color: 0x0000ff }) // Blue rectangle
                        .poly([ otherCarWidth / 2, -5, otherCarWidth, 10, 0, 10]).fill({ color: 0xffffff }); // White arrow
                    // --- End Create Blue Sprite ---
                    sprite.pivot.set(otherCarWidth / 2, otherCarHeight / 2);
                    sprite.x = -1000; sprite.y = -1000; sprite.visible = false;
                    pixiApp.current.stage.addChild(sprite);
                    otherPlayerSprites.current[sessionId] = sprite;
                }
            });
            const currentSpriteIds = Object.keys(otherPlayerSprites.current);
            currentSpriteIds.forEach(sessionId => {
                if (!incomingPlayerIds.has(sessionId)) { // Use incomingPlayerIds for check
                    console.log(`Removing sprite for player who left: ${sessionId}`);
                    const spriteToRemove = otherPlayerSprites.current[sessionId];
                    if (spriteToRemove) { /* ... destroy sprite ... */ }
                    delete otherPlayerSprites.current[sessionId];
                }
            });
        });

        room.onLeave((code: number) => { /* ... */ });
        room.onError((code: number, message?: string) => { /* ... */ });

    } catch (e) { console.error("Failed to join or create room:", e); }
  }, []);

  // useEffect (setup/cleanup) - Restore connection call, sprite creation
  useEffect(() => {
      isMounted.current = true;
      pixiInitComplete.current = false;
      let map: Map | null = null;
      let app: PIXI.Application | null = null;
      let listenersAdded = false;
      let tickerAdded = false;

      if (!mapContainer.current || !pixiContainer.current) return;
      const currentMapContainer = mapContainer.current;
      const currentPixiContainer = pixiContainer.current;

      console.log("Starting initialization (Restoring Full Mode)...");

      try {
        map = new Map({ container: currentMapContainer, style: MAP_STYLE_URL, center: INITIAL_CENTER, zoom: INITIAL_ZOOM, interactive: false });
        mapInstance.current = map;
      } catch (error) { console.error("Map init error:", error); return; }

      app = new PIXI.Application();
      pixiApp.current = app;

      const setupPixi = async () => {
          try {
            await app!.init({ resizeTo: currentPixiContainer, backgroundAlpha: 0, resolution: window.devicePixelRatio || 1, autoDensity: true });
            if (!isMounted.current) return;
            pixiInitComplete.current = true;
            console.log("Pixi init ok.");
            currentPixiContainer.appendChild(app!.canvas);

            // Restore car sprite creation
            console.log("Setting up Pixi stage...");
            const carWidth = 20; const carHeight = 40;
            const carGfx = new PIXI.Graphics() // Red
                .rect(0, 0, carWidth, carHeight).fill({ color: 0xff0000 })
                .poly([ carWidth / 2, -5, carWidth, 10, 0, 10]).fill({ color: 0xffffff });
            carGfx.pivot.set(carWidth / 2, carHeight / 2);
            carGfx.x = -1000; carGfx.y = -1000; // Start off-screen
            app!.stage.addChild(carGfx);
            carSprite.current = carGfx;
            console.log("Car sprite added.");

            app!.ticker.add(gameLoop);
            tickerAdded = true;
            console.log("Game loop added.");
          } catch (error) { console.error("Pixi init error:", error); return; }
      };

      map.on('load', () => {
          if (!isMounted.current) return;
          console.log('Map loaded.');
          setupPixi().then(() => {
              if (!isMounted.current || !pixiInitComplete.current) return;
              console.log('Pixi setup complete.');
              window.addEventListener('keydown', handleKeyDown);
              window.addEventListener('keyup', handleKeyUp);
              listenersAdded = true;
              console.log("Input listeners added.");
              // Re-enable connection to server
              if (isMounted.current) {
                  connectToServer();
              }
          }).catch(console.error);
      });
      map.on('error', (e) => console.error('MapLibre error:', e));

      return () => {
        console.log("Running cleanup (Full Mode)...", tickerAdded);
        isMounted.current = false;
        if (listenersAdded) {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        }
        if (pixiApp.current && pixiInitComplete.current) { // Keep the init check
            if (tickerAdded && pixiApp.current.ticker) {
                pixiApp.current.ticker.remove(gameLoop);
            }
            console.log("Destroying initialized Pixi app...");
            pixiApp.current.destroy(true, { children: true, texture: true });
        } else if (pixiApp.current) {
             console.log("Pixi app ref exists but init incomplete, skipping destroy.");
        }
        pixiApp.current = null;
        if (mapInstance.current) {
            console.log("Removing MapLibre map...");
            mapInstance.current.remove();
            mapInstance.current = null;
        }
        // Leave Colyseus room
        if (gameRoom.current) {
            console.log("Leaving Colyseus room...");
            gameRoom.current.leave();
            gameRoom.current = null;
        }
        colyseusClient.current = null;
        // Reset refs
        carSprite.current = null;
        otherPlayerSprites.current = {};
        inputState.current = { up: false, down: false, left: false, right: false };
        // Clear the new state ref
        allPlayersServerState.current = {}; // Clear object ref
        console.log("Cleanup finished.");
      };
  }, [connectToServer, gameLoop, handleKeyDown, handleKeyUp]); // Restore dependencies

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <div ref={mapContainer} style={{ position: 'absolute', top: 0, bottom: 0, width: '100%', height: '100%' }} />
      <div ref={pixiContainer} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        {/* Pixi canvas will be appended here */}
      </div>
      <HUD /> {/* Re-enabled */}
    </div>
  );
};

export default GameCanvas;
