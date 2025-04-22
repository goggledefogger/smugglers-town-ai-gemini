import { useCallback, useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { Room } from 'colyseus.js';
import { ArenaState, Player, FlagState } from '@smugglers-town/shared-schemas';
import { Map as MapLibreMap, LngLat } from 'maplibre-gl';
import { lerp, angleLerp, worldToGeo } from '../utils/coordinateUtils'; // Adjust path
import { PixiRefs, drawCar } from './usePixiApp'; // Import refs type and drawCar
import { RED_BASE_POS, BLUE_BASE_POS } from "@smugglers-town/shared-utils"; // Import shared constants

// Constants from GameCanvas (consider moving)
const INTERPOLATION_FACTOR = 0.3;
const VISUAL_BASE_RADIUS = 30;
const CAR_HEIGHT = 20; // From usePixiApp
const NUM_ITEMS = 4; // From server constants

interface UseGameLoopProps {
    pixiRefs: React.RefObject<PixiRefs>;
    mapInstance: React.RefObject<MapLibreMap | null>;
    // State from useColyseus
    sessionId: string | null;
    players: Map<string, Player>;
    items: FlagState[];
    isConnected: boolean;
    sendInput: (input: { dx: number; dy: number }) => void;
    // Input state from useInputHandling
    inputVector: { dx: number; dy: number };
    isPixiReady: boolean;
}

export function useGameLoop({
    pixiRefs,
    mapInstance,
    sessionId,
    players,
    items,
    isConnected,
    sendInput,
    inputVector,
    isPixiReady,
}: UseGameLoopProps) {
    const mapTargetCenter = useRef<LngLat | null>(null);
    const initialPlacementDone = useRef(false);
    const itemTextureRef = useRef<PIXI.Texture | null>(null);

    // --- Refs for frequently changing state/props ---
    const playersRef = useRef(players);
    const itemsRef = useRef(items);
    const sessionIdRef = useRef(sessionId);
    const inputVectorRef = useRef(inputVector);
    const isConnectedRef = useRef(isConnected);
    const sendInputRef = useRef(sendInput);

    // Effect to update refs when props change
    useEffect(() => {
        playersRef.current = players;
        itemsRef.current = items;
        sessionIdRef.current = sessionId;
        inputVectorRef.current = inputVector;
        isConnectedRef.current = isConnected;
        sendInputRef.current = sendInput;
    }, [players, items, sessionId, inputVector, isConnected, sendInput]);
    // --------------------------------------------------

    // Load item texture once
    useEffect(() => {
        // Ensure PIXI.Assets exists and is ready
        if (PIXI.Assets) {
             PIXI.Assets.load('/assets/golden-toilet.svg').then(texture => {
                 itemTextureRef.current = texture;
             }).catch(err => {
                 console.error("[useGameLoop] Error loading item texture:", err);
             });
        }
    }, []);

    const gameLoop = useCallback((ticker: PIXI.Ticker) => {
        const app = pixiRefs.current?.app;
        const map = mapInstance.current;
        const refs = pixiRefs.current;

        // --- Access state/props via refs ---
        const currentSessionId = sessionIdRef.current;
        const currentPlayers = playersRef.current;
        const currentItems = itemsRef.current;
        const currentInputVector = inputVectorRef.current;
        const currentIsConnected = isConnectedRef.current;
        const currentSendInput = sendInputRef.current;
        // ------------------------------------

        if (!app || !map || !refs || !currentSessionId) return; // Use ref value

        const normalizedDeltaFactor = ticker.deltaMS / (1000 / 60);
        const lerpFactor = Math.min(INTERPOLATION_FACTOR * normalizedDeltaFactor, 1.0);

        // --- Send Input ---
        if (currentIsConnected) { // Use ref value
            currentSendInput(currentInputVector); // Use ref values
        }

        // --- Map Interpolation ---
        if (mapTargetCenter.current) {
            const currentCenter = map.getCenter();
            const targetCenter = mapTargetCenter.current;
            const nextLng = lerp(currentCenter.lng, targetCenter.lng, lerpFactor);
            const nextLat = lerp(currentCenter.lat, targetCenter.lat, lerpFactor);
            if (Math.abs(currentCenter.lng - nextLng) > 1e-7 || Math.abs(currentCenter.lat - nextLat) > 1e-7) {
                 try { map.setCenter([nextLng, nextLat]); } catch (e) { }
            }
        }

        // --- Calculate Target Map Center (based on local player) ---
        const localPlayerState = currentPlayers.get(currentSessionId); // Use ref values
        if (localPlayerState && isFinite(localPlayerState.x) && isFinite(localPlayerState.y)) {
            try {
                const [targetLng, targetLat] = worldToGeo(localPlayerState.x, localPlayerState.y);
                if (!isFinite(targetLng) || !isFinite(targetLat)) throw new Error("Invalid target LngLat from worldToGeo");
                mapTargetCenter.current = new LngLat(targetLng, targetLat);
            } catch(e) {
                mapTargetCenter.current = null;
            }
        } else {
            mapTargetCenter.current = null;
        }

        // --- Create/Destroy Item Sprites ---
        const currentItemIds = new Set(currentItems.map(item => item.id)); // Use ref value
        const existingSpriteIds = new Set(refs.itemSprites.current.keys());

        // Create missing sprites
        currentItems.forEach(item => { // Use ref value
            if (!refs.itemSprites.current.has(item.id) && itemTextureRef.current) {
                const newItemSprite = new PIXI.Sprite(itemTextureRef.current);
                newItemSprite.anchor.set(0.5);
                newItemSprite.scale.set(0.5); // Adjust scale as needed
                newItemSprite.x = -1000; newItemSprite.y = -1000; newItemSprite.visible = false;
                app.stage.addChild(newItemSprite);
                refs.itemSprites.current.set(item.id, newItemSprite);
            }
        });

        // Destroy removed sprites
        existingSpriteIds.forEach(spriteId => {
            if (!currentItemIds.has(spriteId)) {
                const sprite = refs.itemSprites.current.get(spriteId);
                sprite?.destroy();
                refs.itemSprites.current.delete(spriteId);
            }
        });

        // --- Initial Placement --- (Simplified version, refine if needed)
        if (!initialPlacementDone.current && localPlayerState) { // localPlayerState derived from refs
             try {
                const [targetLng, targetLat] = worldToGeo(localPlayerState.x, localPlayerState.y);
                if (!isFinite(targetLng) || !isFinite(targetLat)) throw new Error("Invalid LngLat for initial center");

                map.setCenter([targetLng, targetLat]);

                const playerScreenPos = map.project([targetLng, targetLat]);
                if (!playerScreenPos || !isFinite(playerScreenPos.x) || !isFinite(playerScreenPos.y)) throw new Error("Failed to project local player");

                app.stage.pivot.set(playerScreenPos.x, playerScreenPos.y);
                app.stage.position.set(app.screen.width / 2, app.screen.height / 2);
                initialPlacementDone.current = true;
             } catch (e) {
                initialPlacementDone.current = false; // Retry next frame?
             }
        }

        // --- Update Player Sprites ---
        const currentPlayerIds = new Set(currentPlayers.keys()); // Use ref value
        const existingPlayerSpriteIds = new Set(Object.keys(refs.otherPlayerSprites.current));

        // Create missing player sprites
        currentPlayers.forEach((playerState: Player, pSessionId: string) => { // Use ref value
            if (pSessionId === currentSessionId) return; // Use ref value
            if (!refs.otherPlayerSprites.current[pSessionId]) {
                const sprite = new PIXI.Graphics();
                drawCar(sprite, playerState.team);
                sprite.x = -1000; sprite.y = -1000; sprite.visible = false;
                app.stage.addChild(sprite);
                refs.otherPlayerSprites.current[pSessionId] = sprite;
            }
        });
        // Destroy removed player sprites
        existingPlayerSpriteIds.forEach(pSessionId => {
            if (!currentPlayerIds.has(pSessionId)) {
                 refs.otherPlayerSprites.current[pSessionId]?.destroy();
                 delete refs.otherPlayerSprites.current[pSessionId];
            }
        });

        // Update positions/rotations
        currentPlayers.forEach((playerState: Player, pSessionId: string) => { // Use ref value
            const isLocalPlayer = pSessionId === currentSessionId; // Use ref value
            const sprite = isLocalPlayer ? refs.carSprite : refs.otherPlayerSprites.current[pSessionId];
            if (!sprite) return; // Add simple check

             if (isFinite(playerState.x) && isFinite(playerState.y) && isFinite(playerState.heading)) {
                 try {
                     const [targetLng, targetLat] = worldToGeo(playerState.x, playerState.y);
                     const targetScreenPos = map.project([targetLng, targetLat]);
                     if (!targetScreenPos || !isFinite(targetScreenPos.x) || !isFinite(targetScreenPos.y)) throw new Error("Invalid projection");

                     const targetRotation = -playerState.heading + Math.PI / 2;

                     // Update color if needed (might have changed on join/reconnect)
                     drawCar(sprite, playerState.team);

                     if (!initialPlacementDone.current) { // Place directly before initial placement
                          sprite.x = targetScreenPos.x;
                          sprite.y = targetScreenPos.y;
                          sprite.rotation = targetRotation;
                     } else { // Interpolate after initial placement
                         sprite.x = lerp(sprite.x, targetScreenPos.x, lerpFactor);
                         sprite.y = lerp(sprite.y, targetScreenPos.y, lerpFactor);
                         sprite.rotation = angleLerp(sprite.rotation, targetRotation, lerpFactor);
                     }
                     sprite.visible = true;
                 } catch (e) {
                    sprite.visible = false;
                 }
             } else {
                 sprite.visible = false;
             }
        });

        // --- Update Item Sprites ---
        let scoredCount = 0;
        currentItems.forEach(itemState => { // Use ref value
            const sprite = refs.itemSprites.current.get(itemState.id);
            if (!sprite) return;

            let shouldBeVisible = false;
            let targetX = sprite.x;
            let targetY = sprite.y;

            if (itemState.status === 'scored') {
                scoredCount++;
                shouldBeVisible = false; // Hide scored items for now
                // Or maybe render them faded at the base?
                // For now, just hide and count.
            } else if (itemState.status === 'carried' && itemState.carrierId) {
                const carrier = currentPlayers.get(itemState.carrierId); // Use ref value
                const carrierSprite = itemState.carrierId === currentSessionId // Use ref value
                    ? refs.carSprite
                    : refs.otherPlayerSprites.current[itemState.carrierId];

                if (carrier && carrierSprite && carrierSprite.visible) {
                    // Position relative to carrier
                    const distanceBehind = CAR_HEIGHT / 2 + 5;
                    const angle = carrierSprite.rotation - Math.PI / 2;
                    const offsetX = Math.cos(angle) * distanceBehind;
                    const offsetY = Math.sin(angle) * distanceBehind;
                    targetX = carrierSprite.x + offsetX;
                    targetY = carrierSprite.y + offsetY;
                    shouldBeVisible = true;
                } else {
                    shouldBeVisible = false; // Hide if carrier missing/invisible
                }
            } else if (itemState.status === 'available' || itemState.status === 'dropped') {
                 if (isFinite(itemState.x) && isFinite(itemState.y)) {
                     try {
                         const [targetLng, targetLat] = worldToGeo(itemState.x, itemState.y);
                         const targetScreenPos = map.project([targetLng, targetLat]);
                         if (!targetScreenPos || !isFinite(targetScreenPos.x) || !isFinite(targetScreenPos.y)) throw new Error("Invalid projection");
                         targetX = targetScreenPos.x;
                         targetY = targetScreenPos.y;
                         shouldBeVisible = true;
                     } catch (e) {
                         shouldBeVisible = false;
                     }
                 } else {
                    shouldBeVisible = false;
                 }
            }

            // Apply visibility and interpolate position
            sprite.visible = shouldBeVisible;
            if (shouldBeVisible) {
                 if (!initialPlacementDone.current) { // Place directly before initial placement
                      sprite.x = targetX;
                      sprite.y = targetY;
                 } else {
                     sprite.x = lerp(sprite.x, targetX, lerpFactor);
                     sprite.y = lerp(sprite.y, targetY, lerpFactor);
                 }
            }
        });

        // --- Update Base Sprites --- (Copied/adapted from GameCanvas)
        const baseSpritesData: { sprite: PIXI.Graphics | null, worldPos: { x: number, y: number }, color: string }[] = [
            { sprite: refs.redBaseSprite, worldPos: RED_BASE_POS, color: 'Red' },
            { sprite: refs.blueBaseSprite, worldPos: BLUE_BASE_POS, color: 'Blue' }
        ];
        baseSpritesData.forEach(({ sprite, worldPos, color }) => {
            if (sprite) {
                 try {
                     const [baseLng, baseLat] = worldToGeo(worldPos.x, worldPos.y);
                     const screenPos = map.project([baseLng, baseLat]);
                     const edgeWorldX = worldPos.x + VISUAL_BASE_RADIUS;
                     const edgeWorldY = worldPos.y;
                     const [edgeLng, edgeLat] = worldToGeo(edgeWorldX, edgeWorldY);
                     const edgeScreenPos = map.project([edgeLng, edgeLat]);
                     if (!screenPos || !edgeScreenPos || !isFinite(screenPos.x) || !isFinite(screenPos.y) || !isFinite(edgeScreenPos.x) || !isFinite(edgeScreenPos.y)) throw new Error("Invalid base projection");
                     const dx = edgeScreenPos.x - screenPos.x;
                     const dy = edgeScreenPos.y - screenPos.y;
                     const pixelRadius = Math.sqrt(dx * dx + dy * dy);
                     const baseColor = color === 'Red' ? 0xff0000 : 0x0000ff;
                     sprite.clear();
                     sprite.circle(0, 0, pixelRadius).fill({ color: baseColor, alpha: 0.3 });
                     sprite.x = screenPos.x;
                     sprite.y = screenPos.y;
                     sprite.visible = true;
                 } catch (e) { sprite.visible = false; }
            }
        });

        // --- Update Navigation Arrow --- (Refactored for multiple items)
        const arrowSprite = refs.navigationArrowSprite;
        if (arrowSprite && localPlayerState) { // localPlayerState derived from refs
            let targetWorldX: number | null = null;
            let targetWorldY: number | null = null;
            let arrowColor: number = 0xFFFFFF;
            let minTargetDistSq = Infinity;

            const playerCarryingItem = currentItems.find(item => item.carrierId === currentSessionId); // Use ref values

            if (playerCarryingItem) {
                // Player is carrying: Target own base
                const basePos = localPlayerState.team === 'Red' ? RED_BASE_POS : BLUE_BASE_POS;
                targetWorldX = basePos.x;
                targetWorldY = basePos.y;
                arrowColor = localPlayerState.team === 'Red' ? 0xff0000 : 0x0000ff;
            } else {
                // Target nearest available/dropped item
                currentItems.forEach(item => { // Use ref value
                    if ((item.status === 'available' || item.status === 'dropped') && isFinite(item.x) && isFinite(item.y)) {
                        const dSq = distSq(localPlayerState.x, localPlayerState.y, item.x, item.y);
                        if (dSq < minTargetDistSq) {
                            minTargetDistSq = dSq;
                            targetWorldX = item.x;
                            targetWorldY = item.y;
                            arrowColor = 0xFFFF00; // Yellow for neutral item
                        }
                    }
                });

                // If no available item, target nearest opponent carrier
                if (targetWorldX === null) {
                    minTargetDistSq = Infinity;
                    currentItems.forEach(item => { // Use ref value
                        if (item.status === 'carried' && item.carrierId) {
                             const carrier = currentPlayers.get(item.carrierId); // Use ref value
                             if (carrier && carrier.team !== localPlayerState.team && isFinite(carrier.x) && isFinite(carrier.y)) {
                                const dSq = distSq(localPlayerState.x, localPlayerState.y, carrier.x, carrier.y);
                                if (dSq < minTargetDistSq) {
                                    minTargetDistSq = dSq;
                                    targetWorldX = carrier.x;
                                    targetWorldY = carrier.y;
                                    arrowColor = carrier.team === 'Red' ? 0xff0000 : 0x0000ff;
                                }
                             }
                        }
                    });
                }
            }

            // Update arrow position and rotation
            if (targetWorldX !== null && targetWorldY !== null) {
                try {
                    const [targetLng, targetLat]: [number, number] = worldToGeo(targetWorldX, targetWorldY);
                    const targetScreenPos = map.project([targetLng, targetLat]);
                    const localCarSprite = refs.carSprite;
                    if (targetScreenPos && isFinite(targetScreenPos.x) && isFinite(targetScreenPos.y) && localCarSprite) {
                        const screenWidth = app.screen.width;
                        const arrowScreenX = screenWidth / 2;
                        const arrowScreenY = 80;
                        const arrowScreenPoint = new PIXI.Point(arrowScreenX, arrowScreenY);
                        const arrowStagePos = app.stage.toLocal(arrowScreenPoint);
                        const dx = targetScreenPos.x - localCarSprite.x;
                        const dy = targetScreenPos.y - localCarSprite.y;
                        const angle = Math.atan2(dy, dx);
                        arrowSprite.position.set(arrowStagePos.x, arrowStagePos.y);
                        arrowSprite.rotation = angle + Math.PI / 2;
                        arrowSprite.tint = arrowColor;
                        arrowSprite.visible = true;
                    } else {
                         arrowSprite.visible = false;
                    }
                } catch (e) {
                     arrowSprite.visible = false;
                }
            } else {
                 arrowSprite.visible = false; // Hide if no target
            }
        } else if (arrowSprite) {
            arrowSprite.visible = false; // Hide if no local player or arrow sprite
        }

    // Stabilize dependencies: only fundamental refs needed
    }, [pixiRefs, mapInstance]); // REMOVED dependencies that change often

    // Effect to add/remove ticker
    useEffect(() => {
        const app = pixiRefs.current?.app;
        // Ensure app and ticker are valid before adding the loop
        if (app?.ticker && isPixiReady) {
            try {
                app.ticker.add(gameLoop);
            } catch (err) {
                console.error("[useGameLoop] Error adding game loop to ticker:", err);
            }

            return () => {
                 // Check if app and ticker still exist before removing
                 // Also check if gameLoop is actually on the ticker - Removed contains check as it's not public API
                 if (app?.ticker) {
                    try {
                        app.ticker.remove(gameLoop);
                    } catch (err) {
                         console.error("[useGameLoop] Error removing game loop from ticker:", err);
                    }
                 } else {
                    // console.warn("[useGameLoop] Cannot remove ticker: app/ticker missing or loop not found."); // Removed warning
                 }
            };
        } else if (app?.ticker && !isPixiReady) {
             // console.log("[useGameLoop] Pixi app ready, but waiting for isPixiReady flag."); // Removed log
        }
    // Effect now depends only on isPixiReady, pixiRefs, and the stable gameLoop
    }, [pixiRefs, gameLoop, isPixiReady]);

    // This hook doesn't return anything directly, it manages the loop
    // and interacts via refs and callbacks.
}

// Helper function for distance squared (copied from aiController, consider utils)
const distSq = (x1: number, y1: number, x2: number, y2: number): number => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
};
