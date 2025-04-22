"use strict";
/**
 * rules.ts
 *
 * Core game rule logic (item pickup, scoring, stealing).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkItemPickup = checkItemPickup;
exports.checkScoring = checkScoring;
exports.checkStealing = checkStealing;
exports.updateCarriedItemPosition = updateCarriedItemPosition;
const helpers_1 = require("../utils/helpers");
const shared_utils_1 = require("@smugglers-town/shared-utils");
const constants_1 = require("../config/constants");
/**
 * Checks for item pickups by any player.
 * Modifies the item state if a pickup occurs.
 */
function checkItemPickup(state, playerIds) {
    // Iterate through all players first
    for (const sessionId of playerIds) {
        const player = state.players.get(sessionId);
        if (!player)
            continue;
        // Then check against each available/dropped item
        for (const item of state.items) {
            if (item.status !== 'available' && item.status !== 'dropped') {
                continue; // Item not available for pickup
            }
            const dSq = (0, helpers_1.distSq)(player.x, player.y, item.x, item.y);
            if (dSq <= constants_1.PICKUP_RADIUS_SQ) {
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
function checkScoring(state, playerIds) {
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
        let baseTeam = null;
        if (carrier.team === 'Red') {
            targetBasePos = shared_utils_1.RED_BASE_POS;
            baseTeam = 'Red';
        }
        else if (carrier.team === 'Blue') {
            targetBasePos = shared_utils_1.BLUE_BASE_POS;
            baseTeam = 'Blue';
        }
        if (targetBasePos && baseTeam) {
            // Calculate front position of the player
            const angle = carrier.heading;
            const frontOffsetX = Math.cos(angle) * constants_1.PLAYER_EFFECTIVE_RADIUS;
            const frontOffsetY = Math.sin(angle) * constants_1.PLAYER_EFFECTIVE_RADIUS;
            const frontX = carrier.x + frontOffsetX;
            const frontY = carrier.y + frontOffsetY;
            // Check distance from player's FRONT to base center
            const dSq = (0, helpers_1.distSq)(frontX, frontY, targetBasePos.x, targetBasePos.y);
            if (dSq <= constants_1.BASE_RADIUS_SQ) {
                console.log(`[${item.carrierId}] Player ${carrier.name} (${carrier.team}) SCORED with item ${item.id}!`);
                // Update item state to 'scored' and place it at the base
                item.status = 'scored';
                item.x = targetBasePos.x;
                item.y = targetBasePos.y;
                item.carrierId = null;
                // Increment score
                if (carrier.team === 'Red')
                    state.redScore++;
                else
                    state.blueScore++;
                console.log(`Scores: Red ${state.redScore} - Blue ${state.blueScore}`);
                // Don't return early, check other items/players
            }
        }
    }
}
/**
 * Checks for item stealing between opposing players.
 * Modifies the item state if a steal occurs.
 * @returns StealCheckDebugData | null - Returns position data if a distance check was performed, null otherwise.
 */
function checkStealing(state, playerIds, currentTime) {
    let latestDebugData = null;
    // Iterate through all carried items
    for (const item of state.items) {
        if (item.status !== 'carried' || !item.carrierId || currentTime < item.lastStealTimestamp + constants_1.STEAL_COOLDOWN_MS) {
            continue; // This item isn't carried or is on cooldown
        }
        const carrier = state.players.get(item.carrierId);
        if (!carrier) {
            // Should be handled by updateCarriedItemPosition, but drop here as a safeguard
            console.warn(`Stealing check: Carrier ${item.carrierId} for item ${item.id} not found. Dropping item.`);
            item.status = 'dropped';
            item.carrierId = null;
            continue;
        }
        // Check against all other players
        for (const potentialStealerId of playerIds) {
            if (potentialStealerId === item.carrierId)
                continue; // Cannot steal from self
            const potentialStealer = state.players.get(potentialStealerId);
            if (!potentialStealer /* || potentialStealer.team === carrier.team */) {
                continue; // Skip if player doesn't exist or is on the same team
            }
            // Use player collision radius for steal check distance
            const collisionThresholdSq = constants_1.PLAYER_COLLISION_RADIUS_SQ + constants_1.PLAYER_COLLISION_RADIUS_SQ; // Simple sum of radii squared
            // --- Prepare Debug Data --- Capture positions used for this check
            latestDebugData = {
                carrierId: item.carrierId,
                carrierX: carrier.x,
                carrierY: carrier.y,
                stealerId: potentialStealerId,
                stealerX: potentialStealer.x,
                stealerY: potentialStealer.y
            };
            // --------------------------
            const dSq = (0, helpers_1.distSq)(carrier.x, carrier.y, potentialStealer.x, potentialStealer.y);
            if (dSq <= collisionThresholdSq) {
                // Steal occurred!
                console.log(`[${potentialStealerId}] Player ${potentialStealer.name} (${potentialStealer.team}) STOLE item ${item.id} from [${item.carrierId}] Player ${carrier.name} (${carrier.team})!`);
                item.carrierId = potentialStealerId;
                item.lastStealTimestamp = currentTime; // Set cooldown timestamp for this item
                // Update item position to prevent visual glitches before next position update
                item.x = NaN;
                item.y = NaN;
                return latestDebugData; // Return debug data for the successful steal
            }
        }
    }
    // If loop completes without steal, return the debug data from the last distance check performed
    return latestDebugData;
}
/**
 * Updates the visual position of the item if it's carried.
 */
function updateCarriedItemPosition(state) {
    state.items.forEach((item) => {
        if (item.status !== 'carried' || !item.carrierId) {
            return; // Skip if not carried
        }
        const carrier = state.players.get(item.carrierId);
        if (carrier) {
            // Update item position to match carrier
            item.x = carrier.x;
            item.y = carrier.y;
        }
        else {
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
//# sourceMappingURL=rules.js.map