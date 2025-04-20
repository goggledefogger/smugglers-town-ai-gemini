/**
 * rules.ts
 *
 * Core game rule logic (item pickup, scoring, stealing).
 */

import { ArenaState, Player } from "../schemas/ArenaState";
import { distSq } from "../utils/helpers";
import {
    PICKUP_RADIUS_SQ,
    BASE_RADIUS_SQ,
    PLAYER_COLLISION_RADIUS_SQ,
    STEAL_COOLDOWN_MS,
    RED_BASE_POS,
    BLUE_BASE_POS,
    ITEM_START_POS
} from "../config/constants";

// Helper to reset the item state (could be part of a potential ItemManager class later)
export function resetItemState(item: ArenaState['item']) {
    console.log(`Resetting Item to base.`);
    item.status = 'atBase';
    item.x = ITEM_START_POS.x;
    item.y = ITEM_START_POS.y;
    item.carrierId = null;
    item.lastStealTimestamp = 0; // Reset cooldown timer
}

/**
 * Checks for item pickups by any player.
 * Modifies the item state if a pickup occurs.
 */
export function checkItemPickup(state: ArenaState, playerIds: string[]): void {
    const item = state.item;
    if (item.status !== 'atBase' && item.status !== 'dropped') {
        return; // Item not available for pickup
    }

    for (const sessionId of playerIds) {
        const player = state.players.get(sessionId);
        if (!player) continue;

        const dSq = distSq(player.x, player.y, item.x, item.y);
        if (dSq <= PICKUP_RADIUS_SQ) {
            console.log(`[${sessionId}] Player ${player.name} picked up the item!`);
            item.status = "carried";
            item.carrierId = sessionId;
            item.x = NaN; // Position is now determined by carrier
            item.y = NaN;
            return; // Only one player can pick up per tick
        }
    }
}

/**
 * Checks for scoring by any player carrying the item.
 * Modifies score and item state if scoring occurs.
 */
export function checkScoring(state: ArenaState, playerIds: string[]): void {
    const item = state.item;
    if (item.status !== 'carried' || !item.carrierId) {
        return; // Item not carried, no scoring possible
    }

    const carrier = state.players.get(item.carrierId);
    if (!carrier) {
        console.warn(`Scoring check: Carrier ${item.carrierId} not found, resetting item.`);
        resetItemState(item);
        return;
    }

    let targetBasePos = null;
    if (carrier.team === 'Red') { targetBasePos = RED_BASE_POS; }
    else if (carrier.team === 'Blue') { targetBasePos = BLUE_BASE_POS; }

    if (targetBasePos) {
        const dSq = distSq(carrier.x, carrier.y, targetBasePos.x, targetBasePos.y);
        if (dSq <= BASE_RADIUS_SQ) {
            console.log(`[${item.carrierId}] Player ${carrier.name} (${carrier.team}) SCORED with the item!`);
            // Increment score
            if (carrier.team === 'Red') state.redScore++;
            else state.blueScore++;
            console.log(`Scores: Red ${state.redScore} - Blue ${state.blueScore}`);
            // Reset the item
            resetItemState(item);
            // No need to check other players, item is reset
            return;
        }
    }
}

/**
 * Checks for item stealing between opposing players.
 * Modifies the item state if a steal occurs.
 */
export function checkStealing(
    state: ArenaState,
    playerIds: string[],
    currentTime: number
): void {
    const item = state.item;

    // Check if item is carried AND cooldown has expired
    if (item.status !== 'carried' || !item.carrierId || currentTime < item.lastStealTimestamp + STEAL_COOLDOWN_MS) {
        return;
    }

    const carrier = state.players.get(item.carrierId);
    if (!carrier) {
        console.warn(`Stealing check: Carrier ${item.carrierId} not found, resetting item.`);
        resetItemState(item);
        return;
    }

    for (const potentialStealerId of playerIds) {
        if (potentialStealerId === item.carrierId) continue; // Cannot steal from self

        const potentialStealer = state.players.get(potentialStealerId);
        if (!potentialStealer || potentialStealer.team === carrier.team) {
            continue; // Skip if player doesn't exist or is on the same team
        }

        // Check distance
        const dSq = distSq(carrier.x, carrier.y, potentialStealer.x, potentialStealer.y);
        if (dSq <= PLAYER_COLLISION_RADIUS_SQ) {
            // Steal occurred!
            console.log(`[${potentialStealerId}] Player ${potentialStealer.name} (${potentialStealer.team}) STOLE item from [${item.carrierId}] Player ${carrier.name} (${carrier.team})!`);
            item.carrierId = potentialStealerId;
            item.lastStealTimestamp = currentTime; // Set timestamp
            return; // Only one steal per tick
        }
    }
}

/**
 * Updates the visual position of the item if it's carried.
 */
export function updateCarriedItemPosition(state: ArenaState): void {
    const item = state.item;
    if (item.status !== 'carried' || !item.carrierId) {
        return;
    }

    const carrier = state.players.get(item.carrierId);
    if (carrier) {
        item.x = carrier.x;
        item.y = carrier.y;
    } else {
        // Carrier disconnected or removed - reset item as fallback
        console.warn(`Carried item position update: Carrier ${item.carrierId} not found. Resetting item.`);
        resetItemState(item);
    }
}
