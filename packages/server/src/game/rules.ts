/**
 * rules.ts
 *
 * Core game rule logic (item pickup, scoring, stealing).
 */

import { ArenaState, Player, FlagState } from "@smugglers-town/shared-schemas";
import { RED_BASE_POS, BLUE_BASE_POS, PLAYER_EFFECTIVE_RADIUS, PLAYER_COLLISION_RADIUS_SQ } from "@smugglers-town/shared-utils";
import {
    PICKUP_RADIUS_SQ,
    BASE_RADIUS_SQ,
    STEAL_COOLDOWN_MS,
    ITEM_START_POS,
    PHYSICS_IMPULSE_MAGNITUDE
} from "../config/constants";
import { distSq } from "@smugglers-town/shared-utils";

// Define the velocity type locally
type PlayerVelocity = { vx: number, vy: number };

/**
 * Checks for item pickups by any player.
 * Modifies the item state if a pickup occurs.
 */
export function checkItemPickup(state: ArenaState, playerIds: string[]): void {
    // Iterate through all players first
    for (const sessionId of playerIds) {
        const player = state.players.get(sessionId);
        if (!player) continue;

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

        let targetBasePos = null;
        let baseTeam: 'Red' | 'Blue' | null = null;
        if (carrier.team === 'Red') {
            targetBasePos = RED_BASE_POS;
            baseTeam = 'Red';
        } else if (carrier.team === 'Blue') {
            targetBasePos = BLUE_BASE_POS;
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
 * Data structure for returning debug info from checkStealing
 */
interface CollisionCheckDebugData {
    p1Id: string;
    p1X: number;
    p1Y: number;
    p2Id: string;
    p2X: number;
    p2Y: number;
}

/**
 * Checks for item stealing AND handles basic collision physics between players.
 * Modifies the item state if a steal occurs.
 * Modifies player velocities on collision.
 * @returns CollisionCheckDebugData | null - Returns position data if a distance check was performed, null otherwise.
 */
export function checkPlayerCollisionsAndStealing(
    state: ArenaState,
    playerIds: string[],
    playerVelocities: Map<string, PlayerVelocity>,
    currentTime: number
): CollisionCheckDebugData | null {
    let latestDebugData: CollisionCheckDebugData | null = null;
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
            const dx = p2CollisionX - p1CollisionX;
            const dy = p2CollisionY - p1CollisionY;
            const dSq = dx * dx + dy * dy;

            // Use a combined radius for collision check - MOVED Threshold calculation above loop
            // const combinedRadius = PLAYER_EFFECTIVE_RADIUS * 2;
            // const collisionThresholdSq = combinedRadius * combinedRadius;

            // --- REMOVED LOGGING FOR COLLISION CHECK ---
            // console.log(`[Collision Check] P1: ${p1Id} (${p1.x.toFixed(2)}, ${p1.y.toFixed(2)}), P2: ${p2Id} (${p2.x.toFixed(2)}, ${p2.y.toFixed(2)}), DistSq: ${dSq.toFixed(2)}, ThresholdSq: ${collisionThresholdSq.toFixed(2)}`);
            // ----------------------------------------

             // --- Prepare Debug Data --- Capture positions used for this check
             latestDebugData = {
                p1Id: p1Id,
                p1X: p1.x,
                p1Y: p1.y,
                p2Id: p2Id,
                p2X: p2.x,
                p2Y: p2.y
            };
             // --------------------------

            if (dSq > 0 && dSq <= collisionThresholdSq) {
                // Collision detected!

                // --- Apply physics impulse --- (Only if not already processed this tick)
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

                        // Mark this pair as processed for physics this tick
                        processedPairs.add(pairKey);

                        // console.log(`Collision Detected: ${p1.name} & ${p2.name}. Impulse applied.`); // Debug log
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

    // If loop completes without collision/steal, return the debug data from the last distance check performed (or null if no checks)
    return latestDebugData;
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
            // Carrier disconnected or removed - drop the item
            console.warn(`Carried item position update: Carrier ${item.carrierId} for item ${item.id} not found. Dropping item.`);
            item.status = 'dropped';
            // Position was likely already NaN, but setting it helps clarify intent?
            // We need a valid position though! Try to guess based on last known good spot?
            // For now, dropping at origin as a fallback.
            // TODO: Store last known good position before carrier disconnect?
            item.x = 0;
            item.y = 0;
            item.carrierId = null;
        }
    });
}
