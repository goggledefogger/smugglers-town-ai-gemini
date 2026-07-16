/**
 * rules.ts
 *
 * Core game rule logic (item pickup, scoring, stealing).
 */

import { ArenaState, Player, FlagState } from "@smugglers-town/shared-schemas";
import { PLAYER_EFFECTIVE_RADIUS, PLAYER_COLLISION_RADIUS_SQ } from "@smugglers-town/shared-utils";
import {
    PICKUP_RADIUS_SQ,
    BASE_RADIUS_SQ,
    STEAL_COOLDOWN_MS,
    PHYSICS_IMPULSE_MAGNITUDE
} from "../config/constants";
import { distSq } from "@smugglers-town/shared-utils";
import { MapData } from "../map/mapData";

// Define the velocity type locally
type PlayerVelocity = { vx: number, vy: number };

/**
 * Checks if a player is already carrying an item.
 * @returns boolean - true if the player is already carrying an item, false otherwise.
 */
function isPlayerCarryingItem(state: ArenaState, playerId: string): boolean {
    for (const item of state.items) {
        if (item.status === 'carried' && item.carrierId === playerId) {
            return true;
        }
    }
    return false;
}

/**
 * Checks for item pickups by any player.
 * Modifies the item state if a pickup occurs.
 */
export function checkItemPickup(state: ArenaState, playerIds: string[]): void {
    // Iterate through all players first
    for (const sessionId of playerIds) {
        const player = state.players.get(sessionId);
        if (!player) continue;

        // First check if player is already carrying an item
        if (isPlayerCarryingItem(state, sessionId)) {
            continue; // Skip if player is already carrying an item
        }

        // Then check against each available/dropped item
        for (const item of state.items) {
            if (item.status !== 'available' && item.status !== 'dropped') {
                continue; // Item not available for pickup
            }

            const dSq = distSq(player.x, player.y, item.x, item.y);
            if (dSq <= PICKUP_RADIUS_SQ) {
                console.log(`[${sessionId}] Player ${player.name} picked up item ${item.id}!`);
                item.status = "carried";
                item.carrierId = sessionId;
                item.x = NaN; // Position is now determined by carrier
                item.y = NaN;
                // A player can only pick up one item per check cycle
                return; // Exit function early after successful pickup
            }
        }
    }
}

/**
 * Checks for scoring by any player carrying the item.
 * Modifies score and item state if scoring occurs.
 */
export function checkScoring(state: ArenaState, playerIds: string[]): void {
    // Iterate through all items
    for (const item of state.items) {
        // Only check carried items
        if (item.status !== 'carried' || !item.carrierId) {
            continue;
        }

        const carrier = state.players.get(item.carrierId);
        if (!carrier) {
            // If carrier somehow doesn't exist, drop the item where it is (should be NaN, but safer)
            console.warn(`Scoring check: Carrier ${item.carrierId} for item ${item.id} not found. Dropping item.`);
            item.status = 'dropped';
            item.carrierId = null;
            // Attempt to get a reasonable drop position if carrier exists but is leaving
            // If carrier truly gone, x/y might remain NaN - updateCarriedItemPosition handles this
            continue;
        }

        let targetBasePos: { x: number; y: number } | null = null;
        let baseTeam: 'Red' | 'Blue' | null = null;
        if (carrier.team === 'Red') {
            targetBasePos = { x: state.redBaseX, y: state.redBaseY };
            baseTeam = 'Red';
        } else if (carrier.team === 'Blue') {
            targetBasePos = { x: state.blueBaseX, y: state.blueBaseY };
            baseTeam = 'Blue';
        }

        if (targetBasePos && baseTeam) {
            // Calculate front position of the player
            const angle = carrier.heading;
            const frontOffsetX = Math.cos(angle) * PLAYER_EFFECTIVE_RADIUS;
            const frontOffsetY = Math.sin(angle) * PLAYER_EFFECTIVE_RADIUS;
            const frontX = carrier.x + frontOffsetX;
            const frontY = carrier.y + frontOffsetY;

            // Check distance from player's FRONT to base center
            const dSq = distSq(frontX, frontY, targetBasePos.x, targetBasePos.y);

            if (dSq <= BASE_RADIUS_SQ) {
                console.log(`[${item.carrierId}] Player ${carrier.name} (${carrier.team}) SCORED with item ${item.id}!`);

                // Update item state to 'scored' and place it at the base
                item.status = 'scored';
                item.x = targetBasePos.x;
                item.y = targetBasePos.y;
                item.carrierId = null;

                // Increment score
                if (carrier.team === 'Red') state.redScore++;
                else state.blueScore++;
                console.log(`Scores: Red ${state.redScore} - Blue ${state.blueScore}`);

                // Don't return early, check other items/players
            }
        }
    }
}

/**
 * Checks for item stealing AND handles basic collision physics between players.
 * Modifies the item state if a steal occurs.
 * Modifies player velocities and positions on collision.
 */
export function checkPlayerCollisionsAndStealing(
    state: ArenaState,
    playerIds: string[],
    playerVelocities: Map<string, PlayerVelocity>,
    currentTime: number,
    mapData: MapData | null
): void {
    const processedPairs = new Set<string>();

    // Define the forward offset for the collision check point
    const COLLISION_OFFSET = PLAYER_EFFECTIVE_RADIUS / 2; // Offset by HALF the radius
    // New threshold based on sum of radii of offset circles (2 * radius)^2
    const collisionThresholdSq = 4 * PLAYER_COLLISION_RADIUS_SQ;

    // Iterate through all players as potential colliders
    for (let i = 0; i < playerIds.length; i++) {
        const p1Id = playerIds[i];
        const p1 = state.players.get(p1Id);
        if (!p1) continue;

        // Check against all subsequent players
        for (let j = i + 1; j < playerIds.length; j++) {
            const p2Id = playerIds[j];
            const p2 = state.players.get(p2Id);
            if (!p2) continue;

            // --- Calculate Offset Collision Centers ---
            const p1OffsetX = Math.cos(p1.heading) * COLLISION_OFFSET;
            const p1OffsetY = Math.sin(p1.heading) * COLLISION_OFFSET;
            const p1CollisionX = p1.x + p1OffsetX;
            const p1CollisionY = p1.y + p1OffsetY;

            const p2OffsetX = Math.cos(p2.heading) * COLLISION_OFFSET;
            const p2OffsetY = Math.sin(p2.heading) * COLLISION_OFFSET;
            const p2CollisionX = p2.x + p2OffsetX;
            const p2CollisionY = p2.y + p2OffsetY;
            // ---------------------------------------

            // Ensure pair order consistency for the processed set
            const pairKey = p1Id < p2Id ? `${p1Id}-${p2Id}` : `${p2Id}-${p1Id}`;

            // Calculate distance squared between offset centers
            let dx = p2CollisionX - p1CollisionX;
            let dy = p2CollisionY - p1CollisionY;
            let dSq = dx * dx + dy * dy;

            // Degenerate case: exactly coincident centers. Separate along a fixed axis.
            if (dSq === 0) {
                dx = 1; dy = 0; dSq = 1e-6;
            }

            if (dSq <= collisionThresholdSq) {
                // Collision detected!

                // --- Apply physics impulse + positional separation --- (Once per pair per tick)
                if (!processedPairs.has(pairKey)) {
                    const dist = Math.sqrt(dSq);
                    const nx = dx / dist;
                    const ny = dy / dist;

                    const p1Vel = playerVelocities.get(p1Id);
                    const p2Vel = playerVelocities.get(p2Id);

                    if (p1Vel && p2Vel) {
                        // Apply impulse (equal and opposite)
                        p1Vel.vx -= nx * PHYSICS_IMPULSE_MAGNITUDE;
                        p1Vel.vy -= ny * PHYSICS_IMPULSE_MAGNITUDE;
                        p2Vel.vx += nx * PHYSICS_IMPULSE_MAGNITUDE;
                        p2Vel.vy += ny * PHYSICS_IMPULSE_MAGNITUDE;

                        // Separate overlapping cars so they don't re-collide every tick
                        // or tunnel through each other at speed.
                        const overlap = 2 * PLAYER_EFFECTIVE_RADIUS - dist;
                        if (overlap > 0) {
                            const push = overlap / 2 + 0.01;
                            moveClamped(p1, p1.x - nx * push, p1.y - ny * push, mapData);
                            moveClamped(p2, p2.x + nx * push, p2.y + ny * push, mapData);
                        }

                        // Mark this pair as processed for physics this tick
                        processedPairs.add(pairKey);
                    } else {
                         console.warn(`Collision detected but velocity missing for ${p1Id} or ${p2Id}`);
                    }
                }
                // -----------------------------

                // --- Now check for item stealing specifically between these two colliding players ---
                let carrier: Player | undefined = undefined;
                let carrierId: string | undefined = undefined;
                let stealer: Player | undefined = undefined;
                let stealerId: string | undefined = undefined;
                let carriedItem: FlagState | undefined = undefined;

                // Check if p1 is carrying an item stealable by p2
                for (const item of state.items) {
                    if (item.status === 'carried' &&
                        item.carrierId === p1Id &&
                        currentTime >= item.lastStealTimestamp + STEAL_COOLDOWN_MS)
                    {
                        // Check if p2 is already carrying an item
                        if (isPlayerCarryingItem(state, p2Id)) {
                            continue; // Skip this item if p2 is already carrying an item
                        }

                        carrier = p1;
                        carrierId = p1Id;
                        stealer = p2;
                        stealerId = p2Id;
                        carriedItem = item;
                        break;
                    }
                }

                // Check if p2 is carrying an item stealable by p1 (if not already found)
                if (!carriedItem) {
                    for (const item of state.items) {
                        if (item.status === 'carried' &&
                            item.carrierId === p2Id &&
                            currentTime >= item.lastStealTimestamp + STEAL_COOLDOWN_MS)
                        {
                            // Check if p1 is already carrying an item
                            if (isPlayerCarryingItem(state, p1Id)) {
                                continue; // Skip this item if p1 is already carrying an item
                            }

                            carrier = p2;
                            carrierId = p2Id;
                            stealer = p1;
                            stealerId = p1Id;
                            carriedItem = item;
                            break;
                        }
                    }
                }

                // If a stealable item was found between the colliding pair
                if (carrier && stealer && carriedItem && carrierId && stealerId) {
                    console.log(`[${stealerId}] Player ${stealer.name} (${stealer.team}) STOLE item ${carriedItem.id} from [${carrierId}] Player ${carrier.name} (${carrier.team}) during collision!`);
                    carriedItem.carrierId = stealerId;
                    carriedItem.lastStealTimestamp = currentTime;
                    carriedItem.x = NaN;
                    carriedItem.y = NaN;
                    // Potentially return specific steal debug data here if needed
                    // Note: steal happens even if physics impulse was already applied this tick
                }
                // ------------------------------------------------------------------------------------
            }
        }
    }
}

/**
 * Moves a player to (nx, ny), clamped so separation can't shove them through a building wall.
 */
function moveClamped(player: Player, nx: number, ny: number, mapData: MapData | null): void {
    const hit = mapData?.sweepBuilding(player.x, player.y, nx, ny);
    if (hit) {
        player.x = hit.hitX;
        player.y = hit.hitY;
    } else {
        player.x = nx;
        player.y = ny;
    }
}

/**
 * Updates the visual position of the item if it's carried.
 */
export function updateCarriedItemPosition(state: ArenaState): void {
    state.items.forEach((item: FlagState) => {
        if (item.status !== 'carried' || !item.carrierId) {
            return; // Skip if not carried
        }

        const carrier = state.players.get(item.carrierId);
        if (carrier) {
            // Update item position to match carrier
            item.x = carrier.x;
            item.y = carrier.y;
        } else {
            // Carrier disconnected or removed - drop the item at its last tracked
            // position (updated every tick above), falling back to origin.
            console.warn(`Carried item position update: Carrier ${item.carrierId} for item ${item.id} not found. Dropping item.`);
            item.status = 'dropped';
            if (!isFinite(item.x) || !isFinite(item.y)) {
                item.x = 0;
                item.y = 0;
            }
            item.carrierId = null;
        }
    });
}
