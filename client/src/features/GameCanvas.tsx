import React, { useRef, useEffect, useState, useCallback } from 'react';
import maplibregl, { Map, LngLat, Point } from 'maplibre-gl';
import * as PIXI from 'pixi.js';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Client, Room } from 'colyseus.js'; // Re-enabled
import { v4 as uuidv4 } from 'uuid'; // Import uuid
import HUD from '../components/HUD'; // <-- Use default import
import AIControls from '../components/AIControls'; // <-- Use default import
import { Player, ArenaState, FlagState } from "../schemas/ArenaState"; // <-- Remove ZoneState import
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
  const itemSprite = useRef<PIXI.Sprite | null>(null);
  const initialStateProcessed = useRef<boolean>(false);
  const initialPlacementDone = useRef<boolean>(false);
  // Refs for static base sprites
  const redBaseSprite = useRef<PIXI.Graphics | null>(null);
  const blueBaseSprite = useRef<PIXI.Graphics | null>(null);
  // --- Debug Refs ---
  const debugCarrierSprite = useRef<PIXI.Graphics | null>(null);
  const debugStealerSprite = useRef<PIXI.Graphics | null>(null);
  const debugMarkerTimeout = useRef<NodeJS.Timeout | null>(null);
  // --- Navigation Arrow Ref ---
  const navigationArrowSprite = useRef<PIXI.Graphics | null>(null);
  // ------------------

  // --- State ---
  const [scores, setScores] = useState<{ red: number; blue: number }>({ red: 0, blue: 0 });
  const [gameTimeRemaining, setGameTimeRemaining] = useState<number | undefined>(undefined);
  const [showResetMessage, setShowResetMessage] = useState(false); // <-- Add state for reset message

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

    // --- Initial Placement on First Frame with State ---
    if (!initialPlacementDone.current) {
        // Ensure gameRoom is available here
        if (!gameRoom.current || !gameRoom.current.sessionId) {
            return;
        }

        const localSessionId = gameRoom.current.sessionId;
        const localPlayerState = allPlayersServerState.current[localSessionId];

        if (localPlayerState && isFinite(localPlayerState.x) && isFinite(localPlayerState.y)) {
            try {
                const [targetLng, targetLat] = worldToGeo(localPlayerState.x, localPlayerState.y);
                if (!isFinite(targetLng) || !isFinite(targetLat)) throw new Error("Invalid LngLat from worldToGeo for initial center");

                // Define currentMap, currentStage, currentScreen here
                const currentMap = mapInstance.current!;
                const currentStage = pixiApp.current!.stage;
                const currentScreen = pixiApp.current!.screen;

                // Force Map Center
                currentMap.setCenter([targetLng, targetLat]);

                // Force Stage Center
                const playerScreenPos = currentMap.project([targetLng, targetLat]);
                if (!playerScreenPos || !isFinite(playerScreenPos.x) || !isFinite(playerScreenPos.y)) {
                    throw new Error("Failed to project local player for initial stage centering");
                }
                currentStage.pivot.set(playerScreenPos.x, playerScreenPos.y);
                currentStage.position.set(currentScreen.width / 2, currentScreen.height / 2);

                // Place Player Sprites Directly
                Object.keys(allPlayersServerState.current).forEach((pId) => {
                    const pState = allPlayersServerState.current[pId];
                    // Add null check for gameRoom.current
                    const sprite = pId === gameRoom.current?.sessionId ? carSprite.current : otherPlayerSprites.current[pId];
                    if (pState && sprite && isFinite(pState.x) && isFinite(pState.y)) {
                        try {
                            const [pLng, pLat] = worldToGeo(pState.x, pState.y);
                            const screenPos = currentMap.project([pLng, pLat]);
                            sprite.x = screenPos.x;
                            sprite.y = screenPos.y;
                            sprite.rotation = -pState.heading + Math.PI / 2;
                            drawCar(sprite, pState.team); // Ensure correct color
                            sprite.visible = true;
                        } catch (placeError) {
                            console.warn(`    Error placing player ${pId} initially:`, placeError);
                            if(sprite) sprite.visible = false;
                        }
                    }
                });

                // Place Single Item Sprite Directly
                // Add null check for gameRoom.current
                const itemState = gameRoom.current?.state.item;
                const currentItemSprite = itemSprite.current; // Use single item sprite ref
                if (itemState && currentItemSprite && (itemState.status === 'atBase' || itemState.status === 'dropped') && isFinite(itemState.x) && isFinite(itemState.y)) {
                   try {
                       const [iLng, iLat] = worldToGeo(itemState.x, itemState.y);
                       // Ensure scale is set (adjust as needed)
                       currentItemSprite.scale.set(0.5); // Assuming original SVG size is reasonable
                       const screenPos = currentMap.project([iLng, iLat]);
                       currentItemSprite.x = screenPos.x;
                       currentItemSprite.y = screenPos.y;
                       currentItemSprite.visible = true;
                   } catch (placeError) {
                       console.warn(`    Error placing item initially:`, placeError);
                       if(currentItemSprite) currentItemSprite.visible = false;
                   }
                } else if (currentItemSprite) {
                    currentItemSprite.visible = false; // Hide if carried or invalid pos
                }

                initialPlacementDone.current = true;
                return; // Skip the rest of the loop for this first placement frame
            } catch (e) {
                console.warn("Error calculating initial placement:", e);
                initialPlacementDone.current = false;
            }
        } else {
            // mapTargetCenter.current = null; // Keep this commented unless needed
        }
    }
    // --- End Initial Placement Logic ---

    // --- Regular Update Logic (Interpolation, Input) ---
    if (pixiApp.current && mapInstance.current) {
        const currentMap = mapInstance.current;

        // Update Player Sprites
        Object.keys(allPlayersServerState.current).forEach((sessionId: string) => {
            const playerState = allPlayersServerState.current[sessionId];
            const isLocalPlayer = sessionId === gameRoom.current?.sessionId;
            const sprite = isLocalPlayer ? carSprite.current : otherPlayerSprites.current[sessionId];

            if (!sprite) {
                if (!isLocalPlayer) console.warn(`[GameLoop] Sprite missing for remote player: ${sessionId}`);
                return;
            }

            if (playerState && isFinite(playerState.x) && isFinite(playerState.y) && isFinite(playerState.heading)) {
                try {
                    // Use worldToGeo to get the target LngLat for this player
                    const [targetLng, targetLat] = worldToGeo(playerState.x, playerState.y);
                    if (!isFinite(targetLng) || !isFinite(targetLat)) throw new Error("Invalid target LngLat from worldToGeo for player " + sessionId);

                    // Project the LngLat to screen coordinates
                    const targetScreenPos = currentMap.project([targetLng, targetLat]);
                    if (!targetScreenPos || !isFinite(targetScreenPos.x) || !isFinite(targetScreenPos.y)) {
                         throw new Error("Invalid projected screen pos in gameLoop for player " + sessionId);
                    }
                    // Keep target rotation calculation as is
                    const targetRotation = -playerState.heading + Math.PI / 2;

                    // Ensure car is drawn with correct team color (especially for local player)
                    if (isLocalPlayer) {
                        // Log the team value being used for drawing
                        drawCar(sprite, playerState.team);
                    }

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

        // --- Update Single Item Sprite ---
        const itemState = gameRoom.current?.state.item; // Get single item state
        const currentItemSprite = itemSprite.current; // Use single item sprite ref

        if (!currentItemSprite || !itemState) { // Check sprite and state existence
            if(currentItemSprite) currentItemSprite.visible = false; // Hide sprite if state is missing
            // return; // Don't return, just skip updating this sprite
        } else {
            // Logic uses 'itemState' (directly from Colyseus state) here...
            let shouldBeVisible = false;
            let targetX = currentItemSprite.x;
            let targetY = currentItemSprite.y;

            if (itemState.status === 'atBase' || itemState.status === 'dropped') {
                 // Render at its world position
                if (isFinite(itemState.x) && isFinite(itemState.y)) {
                    try {
                        const [targetLng, targetLat] = worldToGeo(itemState.x, itemState.y);
                        // Ensure scale is set (adjust as needed)
                        currentItemSprite.scale.set(0.5); // Assuming original SVG size is reasonable
                        const targetScreenPos = currentMap.project([targetLng, targetLat]);
                        if (!targetScreenPos || !isFinite(targetScreenPos.x) || !isFinite(targetScreenPos.y)) {
                            throw new Error(`Invalid projected screen pos for item`);
                        }
                        targetX = targetScreenPos.x;
                        targetY = targetScreenPos.y;
                        shouldBeVisible = true;
                    } catch (e) {
                        console.warn(`Error positioning item sprite (update):`, e);
                        shouldBeVisible = false;
                    }
                }
            } else if (itemState.status === 'carried' && itemState.carrierId) {
                 // Render attached to carrier
                 const carrierSprite = itemState.carrierId === gameRoom.current?.sessionId
                    ? carSprite.current
                    : otherPlayerSprites.current[itemState.carrierId];

                 if (carrierSprite && carrierSprite.visible) {
                    // Ensure scale is set (adjust as needed)
                    currentItemSprite.scale.set(0.5);

                    // Position relative to the carrier sprite
                    const distanceBehind = CAR_HEIGHT / 2 + 5; // Distance behind carrier center
                    const angle = carrierSprite.rotation - Math.PI / 2; // Carrier's forward direction angle

                    // Calculate offset in screen space relative to carrier rotation
                    const offsetX = Math.cos(angle) * distanceBehind;
                    const offsetY = Math.sin(angle) * distanceBehind;

                    // Apply offset to carrier's screen position
                    targetX = carrierSprite.x + offsetX;
                    targetY = carrierSprite.y + offsetY;
                    shouldBeVisible = true;
                 } else {
                    shouldBeVisible = false;
                 }
            }

            // Apply visibility and position using lerp
            currentItemSprite.visible = shouldBeVisible;
            if (shouldBeVisible) {
                currentItemSprite.x = lerp(currentItemSprite.x, targetX, lerpFactor);
                currentItemSprite.y = lerp(currentItemSprite.y, targetY, lerpFactor);
            }
        }
        // ---------------------------

        // --- Update Base Sprites (Static World Position) ---
        const baseSprites = [
            { sprite: redBaseSprite.current, worldPos: { x: -SERVER_BASE_DISTANCE, y: SERVER_Y_OFFSET }, color: 'Red' },
            { sprite: blueBaseSprite.current, worldPos: { x: SERVER_BASE_DISTANCE, y: -SERVER_Y_OFFSET }, color: 'Blue' }
        ];

        const baseAlpha = 0.3; // Define alpha here for redraw

        baseSprites.forEach(({ sprite, worldPos, color }) => {
            if (sprite) {
                 try {
                     const [baseLng, baseLat] = worldToGeo(worldPos.x, worldPos.y);
                     const screenPos = currentMap.project([baseLng, baseLat]);

                     // Calculate edge point in world meters (e.g., 40m to the right)
                     const edgeWorldX = worldPos.x + VISUAL_BASE_RADIUS;
                     const edgeWorldY = worldPos.y;
                     const [edgeLng, edgeLat] = worldToGeo(edgeWorldX, edgeWorldY);
                     const edgeScreenPos = currentMap.project([edgeLng, edgeLat]);

                     if (!screenPos || !isFinite(screenPos.x) || !isFinite(screenPos.y) ||
                         !edgeScreenPos || !isFinite(edgeScreenPos.x) || !isFinite(edgeScreenPos.y)) {
                         throw new Error(`Failed to project ${color} base center or edge`);
                     }

                     // Calculate pixel radius
                     const dx = edgeScreenPos.x - screenPos.x;
                     const dy = edgeScreenPos.y - screenPos.y;
                     const pixelRadius = Math.sqrt(dx * dx + dy * dy);

                     // --- Redraw circle dynamically ---
                     const baseColor = color === 'Red' ? 0xff0000 : 0x0000ff;
                     sprite.clear();
                     sprite.circle(0, 0, pixelRadius)
                           .fill({ color: baseColor, alpha: baseAlpha });
                     // --------------------------------

                     sprite.x = screenPos.x;
                     sprite.y = screenPos.y;
                     sprite.visible = true; // Ensure visible
                 } catch (e) {
                    console.warn(`Error updating ${color} base sprite position:`, e);
                    sprite.visible = false;
                 }
            }
        });
        // --------------------------------------------------

        // --- Update Navigation Arrow ---
        const arrowSprite = navigationArrowSprite.current;
        if (arrowSprite && gameRoom.current?.state && gameRoom.current?.sessionId && pixiApp.current && mapInstance.current) {
            const app = pixiApp.current;
            const map = mapInstance.current;
            const state = gameRoom.current.state;
            const localSessionId = gameRoom.current.sessionId;
            const localPlayer = state.players.get(localSessionId);
            const item = state.item;

            let targetWorldX: number | null = null;
            let targetWorldY: number | null = null;
            let arrowColor: number = 0xFFFFFF; // Default white

            if (localPlayer) {
                // 1. Determine Target
                if (item.status === 'carried' && item.carrierId === localSessionId) {
                    // Player is carrying: Target own base
                    const basePos = localPlayer.team === 'Red' ? RED_BASE_POS : BLUE_BASE_POS;
                    targetWorldX = basePos.x;
                    targetWorldY = basePos.y;
                    arrowColor = localPlayer.team === 'Red' ? 0xff0000 : 0x0000ff;
                } else if (item.status === 'carried') {
                    // Someone else is carrying: Target the carrier
                    const carrier = state.players.get(item.carrierId!);
                    if (carrier) {
                        targetWorldX = carrier.x;
                        targetWorldY = carrier.y;
                        arrowColor = carrier.team === 'Red' ? 0xff0000 : 0x0000ff;
                    }
                } else if (item.status === 'dropped' || item.status === 'atBase') {
                    // Item is available: Target the item
                    targetWorldX = item.x;
                    targetWorldY = item.y;
                    arrowColor = 0xFFFF00; // Yellow for neutral item
                }

                // 2. Calculate Angle and Position
                if (targetWorldX !== null && targetWorldY !== null) {
                    try {
                        // Project target world coords to screen coords
                        const [targetLng, targetLat] = worldToGeo(targetWorldX, targetWorldY);
                        const targetScreenPos = map.project([targetLng, targetLat]);

                        if (targetScreenPos && isFinite(targetScreenPos.x) && isFinite(targetScreenPos.y)) {
                            const localCarSprite = carSprite.current;

                            // Define arrow position on screen (top-center)
                            const screenWidth = app.screen.width;
                            const arrowScreenX = screenWidth / 2;
                            const arrowScreenY = 80; // Increased margin from top to move below HUD
                            const arrowScreenPoint = new PIXI.Point(arrowScreenX, arrowScreenY);

                            // Convert screen position to stage's local coordinates
                            const arrowStagePos = app.stage.toLocal(arrowScreenPoint);

                            // Calculate angle from PLAYER CAR position to target screen pos
                            if (localCarSprite) {
                                const dx = targetScreenPos.x - localCarSprite.x;
                                const dy = targetScreenPos.y - localCarSprite.y;
                                const angle = Math.atan2(dy, dx);

                                // Update arrow sprite
                                arrowSprite.position.set(arrowStagePos.x, arrowStagePos.y);
                                arrowSprite.rotation = angle + Math.PI / 2; // Point arrow tip towards target
                                arrowSprite.tint = arrowColor; // Use tint for Graphics color change
                                arrowSprite.visible = true;
                            } else {
                                arrowSprite.visible = false; // Hide if local car sprite is missing
                            }
                        } else {
                            arrowSprite.visible = false; // Hide if target projection fails
                        }
                    } catch (e) {
                        console.warn("Error updating navigation arrow:", e);
                        arrowSprite.visible = false;
                    }
                } else {
                    arrowSprite.visible = false; // Hide if no valid target
                }
            } else {
                 arrowSprite.visible = false; // Hide if local player doesn't exist
            }
        }
        // --- End Navigation Arrow Update ---

    } // End of if (pixiApp.current && mapInstance.current)

  }, []); // End of gameLoop useCallback

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

    // --- Get/Set Session Tab ID ---
    let tabId = sessionStorage.getItem(SESSION_TAB_ID_KEY);
    if (!tabId) {
        tabId = uuidv4();
        sessionStorage.setItem(SESSION_TAB_ID_KEY, tabId);
    }
    // -----------------------------------

    console.log(`Attempting to connect to Colyseus server at ${COLYSEUS_ENDPOINT}...`);
    colyseusClient.current = new Client(COLYSEUS_ENDPOINT);
    try {
        // Pass tabId in joinOptions (using the same key name for server compatibility)
        const joinOptions = { persistentPlayerId: tabId }; // Server expects 'persistentPlayerId'
        const room = await colyseusClient.current.joinOrCreate<ArenaState>('arena', joinOptions);
        gameRoom.current = room;

        // --- Listen for Water Reset Message ---
        room.onMessage("water_reset", () => {
            console.log("[Client] Received water_reset message!");
            setShowResetMessage(true);
            setTimeout(() => {
                setShowResetMessage(false);
            }, 3000); // Show message for 3 seconds
        });
        // -------------------------------------

        // --- Listen for Steal Debug Message ---
        room.onMessage("debug_steal_check_positions", (payload) => {
            // console.log("Received debug_steal_check_positions:", payload); // Optional: Log received payload
            const { carrierX, carrierY, stealerX, stealerY } = payload;
            const carrierMarker = debugCarrierSprite.current;
            const stealerMarker = debugStealerSprite.current;
            const currentMap = mapInstance.current;

            if (carrierMarker && stealerMarker && currentMap &&
                isFinite(carrierX) && isFinite(carrierY) && isFinite(stealerX) && isFinite(stealerY))
            {
                try {
                    // Convert server coords to screen coords
                    const [carrierLng, carrierLat] = worldToGeo(carrierX, carrierY);
                    const carrierScreenPos = currentMap.project([carrierLng, carrierLat]);

                    const [stealerLng, stealerLat] = worldToGeo(stealerX, stealerY);
                    const stealerScreenPos = currentMap.project([stealerLng, stealerLat]);

                    if (carrierScreenPos && isFinite(carrierScreenPos.x) && isFinite(carrierScreenPos.y) &&
                        stealerScreenPos && isFinite(stealerScreenPos.x) && isFinite(stealerScreenPos.y))
                    {
                        // Position markers
                        carrierMarker.x = carrierScreenPos.x;
                        carrierMarker.y = carrierScreenPos.y;
                        stealerMarker.x = stealerScreenPos.x;
                        stealerMarker.y = stealerScreenPos.y;

                        // Make visible and set timeout to hide
                        carrierMarker.visible = true;
                        stealerMarker.visible = true;

                        // Clear previous timeout if any
                        if (debugMarkerTimeout.current) {
                            clearTimeout(debugMarkerTimeout.current);
                        }

                        debugMarkerTimeout.current = setTimeout(() => {
                            if (carrierMarker) carrierMarker.visible = false;
                            if (stealerMarker) stealerMarker.visible = false;
                            debugMarkerTimeout.current = null;
                        }, 1000); // Hide after 1 second
                    }
                } catch (e) {
                    console.warn("Error processing debug_steal_check_positions:", e);
                    if (carrierMarker) carrierMarker.visible = false;
                    if (stealerMarker) stealerMarker.visible = false;
                }
            }
        });
        // -------------------------------------

        // --- Add flag to track if first state change received ---
        let firstStateReceived = false;

        room.onStateChange((state: ArenaState) => {
            if (!mapInstance.current || !pixiApp.current || !isMounted.current) return;

            // --- Log first state received ---
            if (!firstStateReceived) {
                console.log("[onStateChange] First state received:", JSON.stringify(state.toJSON()));
                firstStateReceived = true;
            }
            // ----------------------------------

            const incomingPlayerIds = new Set<string>();
            const newState: { [sessionId: string]: Player } = {};

            // Update state for current players
            state.players.forEach((player, sessionId) => {
                incomingPlayerIds.add(sessionId);
                // Store the actual Player instance
                newState[sessionId] = player;
            });

            // Update the ref object for player states
            allPlayersServerState.current = newState;

            // Update game timer state
            setGameTimeRemaining(state.gameTimeRemaining);

            // Update scores state
            setScores({ red: state.redScore, blue: state.blueScore });

            // Update Map Target Center based on local player
            const localPlayerState = allPlayersServerState.current[room.sessionId];
            if (localPlayerState && isFinite(localPlayerState.x) && isFinite(localPlayerState.y)) {
                 try {
                    // Use worldToGeo to get the target LngLat for the map center
                    const [targetLng, targetLat] = worldToGeo(localPlayerState.x, localPlayerState.y);
                    if (!isFinite(targetLng) || !isFinite(targetLat)) throw new Error("Invalid target LngLat from worldToGeo");
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
                    // --- Create Sprite based on Team Color ---
                    sprite = new PIXI.Graphics(); // Create empty graphics first
                    sprite.pivot.set(CAR_WIDTH / 2, CAR_HEIGHT / 2);
                    const playerState = allPlayersServerState.current[sessionId]; // Get state to determine team
                    if (playerState) {
                         drawCar(sprite, playerState.team); // Draw correct color
                    } else {
                         drawCar(sprite, 'Blue'); // Fallback color if state somehow missing
                         console.warn(`State missing for player ${sessionId} during sprite creation, defaulting color.`);
                    }
                    // --- End Create Sprite ---
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
                    if (spriteToRemove) {
                        // Actually destroy the Pixi sprite and remove from stage
                        spriteToRemove.destroy({ children: true }); // Destroy sprite and its children if any
                    }
                    delete otherPlayerSprites.current[sessionId];
                }
            });
        });

        room.onLeave((code: number) => {
            console.log(`Left room with code: ${code}`);
            gameRoom.current = null; // Clear room ref on leave
            allPlayersServerState.current = {}; // Clear state
            // Consider additional cleanup if needed
        });

        room.onError((code: number, message?: string) => {
            console.error(`Room error (code ${code}): ${message}`);
            // Potentially try to reconnect or show an error message
        });

    } catch (e) {
        console.error("Failed to join or create room:", e);
        // Handle connection error (e.g., show message, retry logic)
    }
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

            // Create placeholder car sprite (will be colored later by onStateChange)
            console.log("Setting up Pixi stage...");
            const carGfx = new PIXI.Graphics(); // Create empty graphics
            // Set pivot and initial position/visibility
            carGfx.pivot.set(CAR_WIDTH / 2, CAR_HEIGHT / 2);
            carGfx.x = -1000; carGfx.y = -1000; // Start off-screen
            carGfx.visible = false; // Hide until first state update colors it
            app!.stage.addChild(carGfx);
            carSprite.current = carGfx;
            console.log("Car sprite placeholder added.");

            // --- Create Single Item Sprite Placeholder ---
            console.log("Setting up single item sprite placeholder...");
            // --- Preload and Create Golden Toilet Sprite ---
            try {
                await PIXI.Assets.load(goldenToiletUrl); // Explicitly load the SVG
                console.log(`Asset loaded: ${goldenToiletUrl}`);
                const itemTexture = PIXI.Assets.get(goldenToiletUrl);
                if (!itemTexture) throw new Error("Failed to get texture after loading");

                const itemGfx = new PIXI.Sprite(itemTexture);
                itemGfx.anchor.set(0.5); // Set anchor to center
                // Adjust scale if needed - SVGs might render large initially
                itemGfx.scale.set(0.5); // Example: scale down by half

                // itemGfx.pivot.set(0, 0); // No longer needed with anchor set
                itemGfx.x = -1000; itemGfx.y = -1000; itemGfx.visible = false;
                app!.stage.addChild(itemGfx);
                itemSprite.current = itemGfx; // Store the Sprite
                console.log("Item sprite placeholder added from loaded SVG.");
            } catch (loadError) {
                console.error("Failed to load or create item sprite:", loadError);
                // Optionally create a fallback graphic if loading fails
                const fallbackGfx = new PIXI.Graphics().circle(0,0,10).fill(0xff00ff);
                fallbackGfx.x = -1000; fallbackGfx.y = -1000; fallbackGfx.visible = false;
                app!.stage.addChild(fallbackGfx);
                // itemSprite.current = fallbackGfx; // Assign if needed, but type mismatch (Sprite vs Graphics)
            }
            // ---------------------------------------------

            // --- Create Base Sprites (Static Position) ---
            console.log("Setting up base sprites...");
            const baseAlpha = 0.3; // Make them semi-transparent

            try {
                // Red Base - Create only
                const redBaseGfx = new PIXI.Graphics()
                // Draw the circle dynamically in gameLoop based on projection
                redBaseGfx.pivot.set(0, 0);
                redBaseGfx.x = -2000; // Start off-screen
                redBaseGfx.y = -2000;
                redBaseGfx.visible = false; // Hide until positioned by gameLoop
                app!.stage.addChild(redBaseGfx);
                redBaseSprite.current = redBaseGfx;

                const blueBaseGfx = new PIXI.Graphics()
                // Draw the circle dynamically in gameLoop based on projection
                blueBaseGfx.pivot.set(0, 0);
                blueBaseGfx.x = -2000; // Start off-screen
                blueBaseGfx.y = -2000;
                blueBaseGfx.visible = false; // Hide until positioned by gameLoop
                app!.stage.addChild(blueBaseGfx);
                blueBaseSprite.current = blueBaseGfx;

                console.log("Base sprite placeholders created.");

            } catch (baseError) {
                console.error("Error creating base sprites:", baseError);
            }
            // -------------------------------------------

            // --- Create Debug Sprites ---
            console.log("Setting up debug sprites...");
            const carrierDebugGfx = new PIXI.Graphics()
                .circle(0, 0, 8) // Slightly larger circle
                .fill(0xff00ff); // Magenta
            carrierDebugGfx.pivot.set(0, 0);
            carrierDebugGfx.x = -1000; carrierDebugGfx.y = -1000; carrierDebugGfx.visible = false;
            app!.stage.addChild(carrierDebugGfx);
            debugCarrierSprite.current = carrierDebugGfx;

            const stealerDebugGfx = new PIXI.Graphics()
                .circle(0, 0, 6) // Slightly smaller circle
                .fill(0x00ffff); // Cyan
            stealerDebugGfx.pivot.set(0, 0);
            stealerDebugGfx.x = -1000; stealerDebugGfx.y = -1000; stealerDebugGfx.visible = false;
            app!.stage.addChild(stealerDebugGfx);
            debugStealerSprite.current = stealerDebugGfx;
            console.log("Debug sprites created.");
            // --------------------------

            // --- Create Navigation Arrow Sprite Placeholder ---
            console.log("Setting up navigation arrow sprite...");
            const arrowGfx = new PIXI.Graphics();
            const arrowHeight = 40;
            const arrowWidth = 36;
            arrowGfx.poly([
                { x: 0, y: -arrowHeight / 2 },                     // Top point (pivot)
                { x: arrowWidth / 2, y: arrowHeight / 2 },         // Bottom right
                { x: 0, y: arrowHeight / 4 },                      // Inset point at base middle (adjust y for notch depth)
                { x: -arrowWidth / 2, y: arrowHeight / 2 }         // Bottom left
            ]).fill(0xFFFFFF); // Start white
            // ---------------------------------------------
            arrowGfx.pivot.set(0, 0); // Pivot at the tip for rotation
            arrowGfx.position.set(-1000, -1000); // Start off-screen
            arrowGfx.visible = false;
            app!.stage.addChild(arrowGfx);
            navigationArrowSprite.current = arrowGfx;
            console.log("Navigation arrow sprite created.");
            // ------------------------------------------------

            app!.ticker.add(gameLoop);
            tickerAdded = true;
            console.log("Game loop added.");
          } catch (error) { console.error("Pixi init error:", error); return; }
      };

      map.on('load', () => {
          if (!isMounted.current) return;
          console.log('Map loaded.');

          // --- Add Water Zone Layer via GeoJSON ---
          try {
              const waterZoneGeoJsonCoords = [
                  [-73.99219, 40.75620], // Bottom Left (Lng, Lat)
                  [-73.99100, 40.75620], // Bottom Right
                  [-73.99100, 40.75979], // Top Right
                  [-73.99219, 40.75979], // Top Left
                  [-73.99219, 40.75620]  // Close loop
              ];

              map.addSource('water-zone-source', {
                  'type': 'geojson',
                  'data': {
                      'type': 'Feature',
                      'geometry': {
                          'type': 'Polygon',
                          'coordinates': [waterZoneGeoJsonCoords] // GeoJSON Polygon requires nested array
                      },
                      'properties': {}
                  }
              });

              map.addLayer({
                  'id': 'water-zone-layer',
                  'type': 'fill',
                  'source': 'water-zone-source',
                  'layout': {},
                  'paint': {
                      'fill-color': '#0000FF', // Blue
                      'fill-opacity': 0.3,
                      // 'fill-outline-color': '#0000AA' // Optional outline
                  }
              });
              console.log('Water zone GeoJSON layer added to map.');
          } catch (mapLayerError) {
              console.error("Error adding water zone layer to map:", mapLayerError);
          }
          // --- End Water Zone Layer ---

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
        itemSprite.current?.destroy(); // Destroy item sprite
        itemSprite.current = null; // Clear ref
        otherPlayerSprites.current = {};
        inputState.current = { up: false, down: false, left: false, right: false };
        allPlayersServerState.current = {};
        console.log("Cleanup finished.");
      };
  }, [connectToServer, gameLoop, handleKeyDown, handleKeyUp]); // Restore dependencies

  // Handlers for adding AI
  const handleAddAi = (team: 'Red' | 'Blue') => {
    if (gameRoom.current && gameRoom.current.connection.isOpen) {
      console.log(`Sending request to add ${team} AI...`);
      gameRoom.current.send("add_ai", { team });
    } else {
      console.warn("Game room not connected, cannot add AI.");
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }} className="z-0">
      {/* Map & Canvas Layers (Low Z-Index) */}
      <div ref={mapContainer} style={{ position: 'absolute', top: 0, bottom: 0, width: '100%', height: '100%' }} className="z-10" />
      <div ref={pixiContainer} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }} className="z-20">
        {/* Pixi canvas will be appended here */}
      </div>

      {/* UI Elements (High Z-Index) */}
      <HUD
        redScore={scores.red}
        blueScore={scores.blue}
        gameTimeRemaining={gameTimeRemaining}
      /> {/* HUD positioned by its own styles */}
      <AIControls onAddAi={handleAddAi} /> {/* Use the new component */}

      {/* Water Reset Message */}
      {showResetMessage && (
        <div style={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '10px 20px',
          backgroundColor: 'rgba(255, 0, 0, 0.7)',
          color: 'white',
          borderRadius: '5px',
          zIndex: 1000, // Ensure it's above map/pixi
          pointerEvents: 'none' // Prevent interaction
        }}>
          SPLASH! You hit the water!
        </div>
      )}
    </div>
  );
};

export default GameCanvas;
