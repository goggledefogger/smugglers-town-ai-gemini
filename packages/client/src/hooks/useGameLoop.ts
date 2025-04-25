import { useCallback, useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { Player, FlagState } from '@smugglers-town/shared-schemas';
import { Map as MapLibreMap, LngLat } from 'maplibre-gl';
import { lerp, angleLerp, worldToGeo, geoToWorld } from '@smugglers-town/shared-utils';
import { PixiRefs } from './usePixiApp';
import { RED_BASE_POS, BLUE_BASE_POS, distSq, VISUAL_BASE_RADIUS } from "@smugglers-town/shared-utils"; // Import shared constants AND distSq AND VISUAL_BASE_RADIUS
import 'pixi.js/gif';
import { Assets } from 'pixi.js';
import { GifSprite, GifSource } from 'pixi.js/gif';
import { type InputVector } from './useInputManager'; // Use 'type' for type-only import
import { ASSET_PATHS } from '../config/assets';
import { useDustParticles } from './useDustParticles';

// Constants from GameCanvas (consider moving)
const INTERPOLATION_FACTOR = 0.3;

interface UseGameLoopProps {
    pixiRefs: React.RefObject<PixiRefs>;
    mapInstance: React.RefObject<MapLibreMap | null>;
    // State from useColyseus
    sessionId: string | null;
    players: Map<string, Player>;
    items: FlagState[];
    isConnected: boolean;
    sendInput: (input: { dx: number; dy: number }) => void;
    // Use the unified InputVector type
    inputVector: InputVector;
    isPixiReady: boolean;
    carHeight: number;
    isFollowingPlayer: boolean;
    hudHeight: number;
}

// Vortex is always a static animation at the item's last carried position (when scored)
type ActiveVortex = { sprite: GifSprite; worldX: number; worldY: number };

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
    carHeight,
    isFollowingPlayer,
    hudHeight,
}: UseGameLoopProps) {
    const mapTargetCenter = useRef<LngLat | null>(null);
    const initialPlacementDone = useRef(false);
    const itemSourceRef = useRef<GifSource | null>(null);
    const carTextureRef = useRef<PIXI.Texture | null>(null);
    const vortexSourceRef = useRef<GifSource | null>(null);
    const prevStatusesRef = useRef<Map<string, string>>(new Map());
    // Track previous carrierId for each item
    const prevCarrierIdsRef = useRef<Map<string, string | undefined>>(new Map());
    // Track active vortexes for animation and position updates
    const activeVortexesRef = useRef<ActiveVortex[]>([]);

    // --- Refs for frequently changing state/props ---
    const playersRef = useRef(players);
    const itemsRef = useRef(items);
    const sessionIdRef = useRef(sessionId);
    const inputVectorRef = useRef(inputVector);
    const isConnectedRef = useRef(isConnected);
    const sendInputRef = useRef(sendInput);
    const isFollowingPlayerRef = useRef(isFollowingPlayer);

    // Effect to update refs when props change
    useEffect(() => {
        playersRef.current = players;
        itemsRef.current = items;
        sessionIdRef.current = sessionId;
        inputVectorRef.current = inputVector;
        isConnectedRef.current = isConnected;
        sendInputRef.current = sendInput;
        isFollowingPlayerRef.current = isFollowingPlayer;
    }, [players, items, sessionId, inputVector, isConnected, sendInput, isFollowingPlayer]);
    // --------------------------------------------------

    // Load item texture once
    useEffect(() => {
        // Load smoking_toilet.gif as a GifSource for animation
        Assets.load(ASSET_PATHS.SMOKING_TOILET_GIF)
            .then((source: GifSource) => {
                itemSourceRef.current = source;
                console.log("[useGameLoop] GIF source loaded for items.");
            }).catch((err: any) => {
                console.error("[useGameLoop] Error loading GIF source for item:", err);
            });
    }, []);

    // Load vortex texture once
    useEffect(() => {
        Assets.load(ASSET_PATHS.VORTEX_GIF)
            .then((source: GifSource) => {
                vortexSourceRef.current = source;
                console.log("[useGameLoop] Vortex GIF source loaded.");
            }).catch((err: any) => {
                console.error("[useGameLoop] Error loading vortex GIF source:", err);
            });
    }, []);

    // Load car texture once
    useEffect(() => {
        // Ensure PIXI.Assets exists and is ready
        if (PIXI.Assets) {
             PIXI.Assets.load(ASSET_PATHS.CAR_SVG).then((texture: PIXI.Texture) => {
                 carTextureRef.current = texture;
             }).catch((err: any) => {
                 console.error("[useGameLoop] Error loading car texture:", err);
             });
        }
    }, []);

    const gameLoop = useCallback((ticker: PIXI.Ticker) => {
        const app = pixiRefs.current?.app;
        const map = mapInstance.current;
        const refs = pixiRefs.current;
        const currentSessionId = sessionIdRef.current;
        const currentPlayers = playersRef.current;
        const currentItems = itemsRef.current;
        const currentInputVector = inputVectorRef.current;
        const currentIsConnected = isConnectedRef.current;
        const currentSendInput = sendInputRef.current;
        const currentIsFollowingPlayer = isFollowingPlayerRef.current;
        const currentCarHeight = carHeight;
        const currentHudHeight = hudHeight;

        if (!app || !map || !refs || !currentSessionId || !isFinite(currentCarHeight)) return;

        const normalizedDeltaFactor = ticker.deltaMS / (1000 / 60);
        const lerpFactor = Math.min(INTERPOLATION_FACTOR * normalizedDeltaFactor, 1.0);

        // --- Get Local Player State (needed in multiple places) ---
        const localPlayerState = currentPlayers.get(currentSessionId);
        // ---------------------------------------------------------

        // --- Send Input ---
        if (currentIsConnected) {
            currentSendInput(currentInputVector);
        }

        // --- Map Interpolation & Target Calculation (Conditional) ---
        if (currentIsFollowingPlayer) {
            if (localPlayerState && isFinite(localPlayerState.x) && isFinite(localPlayerState.y)) {
                try {
                    const [targetLng, targetLat] = worldToGeo(localPlayerState.x, localPlayerState.y);
                    if (!isFinite(targetLng) || !isFinite(targetLat)) throw new Error("Invalid target LngLat from worldToGeo");
                    mapTargetCenter.current = new LngLat(targetLng, targetLat);
                } catch(e) {
                    console.warn("[GameLoop] Error calculating map target center:", e);
                    mapTargetCenter.current = null;
                }
            } else {
                mapTargetCenter.current = null;
            }

            if (mapTargetCenter.current) {
                const currentCenter = map.getCenter();
                const targetCenter = mapTargetCenter.current;
                // Use a smaller lerp factor for smoother following?
                const followLerpFactor = lerpFactor * 0.5; // Example: make following slightly slower
                const nextLng = lerp(currentCenter.lng, targetCenter.lng, followLerpFactor);
                const nextLat = lerp(currentCenter.lat, targetCenter.lat, followLerpFactor);
                if (Math.abs(currentCenter.lng - nextLng) > 1e-7 || Math.abs(currentCenter.lat - nextLat) > 1e-7) {
                     try { map.setCenter([nextLng, nextLat]); } catch (e) { /* ignore potential errors during rapid updates */ }
                }
            }
        } else {
            // If not following, ensure interpolation target is cleared
            mapTargetCenter.current = null;
        }
        // --- End Conditional Map Centering ---

        // --- Vortex effects on status change ---
        currentItems.forEach((item: FlagState) => {
            const prevStatus = prevStatusesRef.current.get(item.id);
            const prevCarrierId = prevCarrierIdsRef.current.get(item.id) ?? undefined;
            if (prevStatus !== item.status && vortexSourceRef.current) {
                // when item is scored
                if (item.status === 'scored') {
                    try {
                        let worldX = item.x;
                        let worldY = item.y;
                        let vortexCarrierId = (item.carrierId ?? undefined) || (prevStatus === 'carried' ? prevCarrierId : undefined);
                        let toiletWorldX = worldX;
                        let toiletWorldY = worldY;
                        const vortex = new GifSprite({ source: vortexSourceRef.current, autoPlay: true, loop: false });
                        vortex.anchor.set(0.5);
                        vortex.scale.set(0.5);
                        vortex.position.set(-1000, -1000); // Will be updated every frame
                        app.stage.addChild(vortex);
                        if (vortexCarrierId) {
                            const carrier = currentPlayers.get(vortexCarrierId);
                            const carrierSpriteCandidate = vortexCarrierId === currentSessionId
                                ? refs.carSprite
                                : refs.otherPlayerSprites.current[vortexCarrierId];
                            if (carrier && carrierSpriteCandidate) {
                                const distanceBehind = currentCarHeight / 2 + 2;
                                const angle = carrierSpriteCandidate.rotation - Math.PI / 2;
                                const offsetX = Math.cos(angle) * distanceBehind;
                                const offsetY = Math.sin(angle) * distanceBehind;
                                // The last known position of the toilet when carried
                                const toiletScreenX = carrierSpriteCandidate.x + offsetX;
                                const toiletScreenY = carrierSpriteCandidate.y + offsetY;
                                // Convert screen position to geo, then to world coordinates
                                let vortexWorld = { x: toiletWorldX, y: toiletWorldY };
                                if (map) {
                                    try {
                                        const lngLat = map.unproject([toiletScreenX, toiletScreenY]);
                                        vortexWorld = geoToWorld(lngLat.lng, lngLat.lat);
                                    } catch (e) {}
                                }
                                activeVortexesRef.current.push({ sprite: vortex, worldX: vortexWorld.x, worldY: vortexWorld.y });
                            } else if (carrier) {
                                toiletWorldX = carrier.x;
                                toiletWorldY = carrier.y;
                                activeVortexesRef.current.push({ sprite: vortex, worldX: toiletWorldX, worldY: toiletWorldY });
                            } else {
                                // fallback
                                activeVortexesRef.current.push({ sprite: vortex, worldX: toiletWorldX, worldY: toiletWorldY });
                            }
                        } else {
                            // Not carried, just use item's world position
                            activeVortexesRef.current.push({ sprite: vortex, worldX: toiletWorldX, worldY: toiletWorldY });
                        }
                        vortex.onComplete = () => { vortex.destroy(); };
                    } catch (e) {
                        console.error('[useGameLoop] Error spawning scored vortex:', e);
                    }
                }
                // when item reappears (new round)
                else if (prevStatus === 'scored' && (item.status === 'available' || item.status === 'dropped')) {
                    try {
                        const worldX = item.x;
                        const worldY = item.y;
                        const vortex = new GifSprite({ source: vortexSourceRef.current, autoPlay: true, loop: false });
                        vortex.anchor.set(0.5);
                        vortex.scale.set(0.5);
                        vortex.position.set(-1000, -1000); // Will be updated every frame
                        app.stage.addChild(vortex);
                        activeVortexesRef.current.push({ sprite: vortex, worldX, worldY });
                        vortex.onComplete = () => { vortex.destroy(); };
                    } catch (e) {
                        console.error('[useGameLoop] Error spawning spawn vortex:', e);
                    }
                }
            }
            // Update previous carrierId for next frame
            prevCarrierIdsRef.current.set(item.id, item.carrierId ?? undefined);
            prevStatusesRef.current.set(item.id, item.status);
        });

        // --- Update active vortexes' screen positions and clean up destroyed ones ---
        if (map) {
            activeVortexesRef.current = activeVortexesRef.current.filter((vortexObj: ActiveVortex) => {
                const { sprite, worldX, worldY } = vortexObj;
                if (sprite.destroyed) return false;
                try {
                    const [lng, lat] = worldToGeo(worldX, worldY);
                    const screenPos = map.project([lng, lat]);
                    sprite.position.set(screenPos.x, screenPos.y);
                } catch (e) {
                    sprite.visible = false;
                }
                return true;
            });
        }

        // --- Create/Destroy Item Sprites ---
        const currentItemIds = new Set(currentItems.map((item: FlagState) => item.id));
        const existingSpriteIds = new Set(refs.itemSprites.current.keys());

        // Create missing sprites
        currentItems.forEach((item: FlagState) => {
            if (!refs.itemSprites.current.has(item.id)) {
                if (itemSourceRef.current) {
                    // Create animated GIF sprite
                    const newItemSprite = new GifSprite({
                        source: itemSourceRef.current,
                        autoPlay: true,
                        loop: true,
                        animationSpeed: 1
                    });
                    newItemSprite.anchor.set(0.5, 1.0); // Anchor at bottom center for better offset
                    newItemSprite.scale.set(0.5); // Scale down to half size for item sprite
                    newItemSprite.x = -1000; newItemSprite.y = -1000; newItemSprite.visible = false;
                    app.stage.addChild(newItemSprite);
                    refs.itemSprites.current.set(item.id, newItemSprite);
                } else {
                    // Fallback: create a red circle if texture missing
                    const gfx = new PIXI.Graphics();
                    gfx.circle(0, 0, 30).fill(0xff0000);
                    gfx.x = -1000; gfx.y = -1000; gfx.visible = false;
                    app.stage.addChild(gfx);
                    refs.itemSprites.current.set(item.id, gfx as unknown as PIXI.Sprite);
                    console.warn(`[DEBUG] Created fallback red circle for item id=${item.id}`);
                }
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

        // --- Player Sprite Cleanup ---
        const processedPlayerIds = new Set<string>();
        if (localPlayerState && refs.carSprite) {
            // Update local player sprite
            let sprite = refs.carSprite;
            if (isFinite(localPlayerState.x) && isFinite(localPlayerState.y) && isFinite(localPlayerState.heading)) {
                try {
                    const [targetLng, targetLat] = worldToGeo(localPlayerState.x, localPlayerState.y);
                    const targetScreenPos = map.project([targetLng, targetLat]);
                    if (!targetScreenPos || !isFinite(targetScreenPos.x) || !isFinite(targetScreenPos.y)) throw new Error("Invalid projection");

                    const targetRotation = -localPlayerState.heading + Math.PI / 2;

                    // Tint for team color
                    sprite.tint = localPlayerState.team === 'Red' ? 0xff4444 : 0x4488ff;

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
            processedPlayerIds.add(currentSessionId);
        }

        // Update other player sprites
        currentPlayers.forEach((playerState, pSessionId) => {
            if (pSessionId === currentSessionId) return; // Skip local player
            let sprite = refs.otherPlayerSprites.current[pSessionId];

            // Create sprite if it doesn't exist (for remote players)
            if (!sprite && carTextureRef.current) {
              const texture = carTextureRef.current;
              // Check texture dimensions
              if (!texture || texture.width === 0 || texture.height === 0) {
                console.error(
                  "[useGameLoop] Cannot create remote player sprite: Invalid car texture."
                );
                return; // Skip this player if texture invalid
              }
              sprite = new PIXI.Sprite(texture);
              sprite.anchor.set(0.5);

              // Calculate scale based on desired height and texture height
              const scale = currentCarHeight / texture.height;

              sprite.scale.set(scale); // Apply uniform scale

              sprite.tint = playerState.team === "Red" ? 0xff0000 : 0x0000ff;
              sprite.x = -1000;
              sprite.y = -1000;
              sprite.zIndex = 10; // Ensure players are above bases/items
              app.stage.addChild(sprite);
              refs.otherPlayerSprites.current[pSessionId] = sprite;
            }

            if (!sprite) return; // Skip if sprite still couldn't be created/found

            // Ensure local player sprite also has zIndex
            if (pSessionId === currentSessionId && sprite.zIndex !== 10) {
                 sprite.zIndex = 10;
            }

            if (isFinite(playerState.x) && isFinite(playerState.y) && isFinite(playerState.heading)) {
                try {
                    const [targetLng, targetLat] = worldToGeo(playerState.x, playerState.y);
                    const targetScreenPos = map.project([targetLng, targetLat]);
                    if (!targetScreenPos || !isFinite(targetScreenPos.x) || !isFinite(targetScreenPos.y)) throw new Error("Invalid projection");

                    const targetRotation = -playerState.heading + Math.PI / 2;

                    // Tint for team color
                    sprite.tint = playerState.team === 'Red' ? 0xff4444 : 0x4488ff;

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
            processedPlayerIds.add(pSessionId);
        });

        // Remove sprites for players who left
        const existingPlayerSpriteIds = new Set(Object.keys(refs.otherPlayerSprites.current));
        existingPlayerSpriteIds.forEach(pSessionId => {
            if (!processedPlayerIds.has(pSessionId)) {
                const sprite = refs.otherPlayerSprites.current[pSessionId];
                if (sprite) sprite.destroy();
                delete refs.otherPlayerSprites.current[pSessionId];
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

        // --- Update Item Sprites ---
        let scoredCount = 0;
        currentItems.forEach((itemState: FlagState) => {
            const sprite = refs.itemSprites.current.get(itemState.id);
            if (!sprite) return;

            let shouldBeVisible = false;
            let targetX = sprite.x;
            let targetY = sprite.y;

            if (itemState.status === 'scored') {
                scoredCount++;
                shouldBeVisible = false; // Hide scored items for now
            } else if (itemState.status === 'carried' && itemState.carrierId) {
                const carrier = currentPlayers.get(itemState.carrierId);
                const carrierSprite = itemState.carrierId === currentSessionId
                    ? refs.carSprite
                    : refs.otherPlayerSprites.current[itemState.carrierId];

                if (carrier && carrierSprite && carrierSprite.visible) {
                    const distanceBehind = currentCarHeight / 2 + 2; // bring closer to car, use currentCarHeight prop
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

        // --- Update Debug Sprites ---
         if (refs.debugCarrierSprite && refs.debugStealerSprite) {
            // ... (debug sprite logic - might use localPlayerState) ...
         }

        // --- Update Navigation Arrow --- (Refactored for multiple items)
        const arrowSprite = refs.navigationArrowSprite;
        const localCarSprite = refs.carSprite;
        if (arrowSprite && localPlayerState && localCarSprite) { // Added localCarSprite null check
            let targetWorldX: number | null = null;
            let targetWorldY: number | null = null;
            let arrowColor: number = 0xFFFFFF;
            let minTargetDistSq = Infinity;

            const playerCarryingItem = currentItems.find((item: FlagState) => item.carrierId === currentSessionId);

            if (playerCarryingItem) {
                // Player is carrying: Target own base
                const basePos = localPlayerState.team === 'Red' ? RED_BASE_POS : BLUE_BASE_POS;
                targetWorldX = basePos.x;
                targetWorldY = basePos.y;
                arrowColor = localPlayerState.team === 'Red' ? 0xff0000 : 0x0000ff;
            } else {
                // Target nearest available/dropped item
                currentItems.forEach((item: FlagState) => {
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
                    currentItems.forEach((item: FlagState) => {
                        if (item.status === 'carried' && item.carrierId) {
                             const carrier = currentPlayers.get(item.carrierId);
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

                    if (targetScreenPos && isFinite(targetScreenPos.x) && isFinite(targetScreenPos.y)) {
                        const screenWidth = app.screen.width;
                        const arrowScreenX = screenWidth / 2;
                        const HUD_TOP_OFFSET = 10;
                        const ARROW_MARGIN = 10;
                        const arrowScreenY = HUD_TOP_OFFSET + currentHudHeight + ARROW_MARGIN;

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
            arrowSprite.visible = false; // Hide if no local player/car or arrow sprite itself is missing
        }
    }, [pixiRefs, mapInstance, carHeight, hudHeight]); // Dependencies should include relevant state/refs

    // Effect to manage the PIXI ticker
    useEffect(() => {
        if (!isPixiReady || !pixiRefs.current?.app) return;
        const app = pixiRefs.current.app;
        console.log("[useGameLoop] Adding gameLoop to ticker.");
        // Ensure previous loop instance is removed if app re-initializes (unlikely here)
        app.ticker.remove(gameLoop);
        app.ticker.add(gameLoop);
        return () => {
            if (app) {
                console.log("[useGameLoop] Removing gameLoop from ticker.");
                app.ticker.remove(gameLoop);
            }
        };
    }, [isPixiReady, pixiRefs, gameLoop]); // Rerun if pixi becomes ready or loop function changes

    // No return value needed if it only sets up the loop
    // If pixiRefs were created here, they would be returned.
}
