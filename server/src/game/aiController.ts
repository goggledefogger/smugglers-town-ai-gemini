/**
 * aiController.ts
 *
 * Logic for updating AI player state (targeting and movement).
 */

import { ArenaState, Player } from "../schemas/ArenaState";
import { lerp, angleLerp } from "../utils/helpers";
import {
    MAX_SPEED_WORLD,
    ACCEL_RATE_WORLD,
    DRAG_FACTOR,
    TURN_SMOOTH_WORLD,
    AI_SPEED_MULTIPLIER,
    AI_ACCEL_MULTIPLIER,
    RED_BASE_POS,
    BLUE_BASE_POS
} from "../config/constants";

// Define type for velocity maps for clarity
type PlayerVelocity = { vx: number, vy: number };

/**
 * Updates an AI player's position and heading based on game state.
 * Determines target, calculates velocity, and applies movement.
 * Modifies the player state and velocity object directly.
 */
export function updateAIState(
    aiPlayer: Player,
    sessionId: string, // For logging
    velocity: PlayerVelocity,
    state: ArenaState, // Pass the whole ArenaState for context
    dt: number
): void {
    let targetX = 0;
    let targetY = 0;
    let targetFound = false;

    // 1. Determine Target
    if (state.item.carrierId === sessionId) {
        // AI has the item, target its own base
        targetX = aiPlayer.team === "Red" ? RED_BASE_POS.x : BLUE_BASE_POS.x;
        targetY = aiPlayer.team === "Red" ? RED_BASE_POS.y : BLUE_BASE_POS.y;
        targetFound = true;
    } else if (state.item.carrierId === null || state.item.carrierId === undefined) {
        // Item is available, target the item
        targetX = state.item.x;
        targetY = state.item.y;
        targetFound = true;
    } else {
        // Item is carried by someone else: Target the opponent carrier
        const carrierId = state.item.carrierId;
        if (carrierId) {
            const carrier = state.players.get(carrierId);
            if (carrier && carrier.team !== aiPlayer.team) {
                targetX = carrier.x;
                targetY = carrier.y;
                targetFound = true;
            } else {
                targetFound = false; // Carrier friendly or missing, idle
            }
        } else {
             targetFound = false; // Should not happen, idle
             console.warn(`[${sessionId}] AI item status 'carried' but carrierId null?`);
        }
    }

    // 2. Calculate Desired Velocity
    let targetVelX = 0;
    let targetVelY = 0;
    let targetWorldDirX = 0; // For heading
    let targetWorldDirY = 0; // For heading

    if (targetFound) {
        const dirX = targetX - aiPlayer.x;
        const dirY = targetY - aiPlayer.y;
        const dist = Math.sqrt(dirX * dirX + dirY * dirY);

        if (dist > 0.1) { // Threshold to prevent jittering
            targetWorldDirX = dirX / dist;
            targetWorldDirY = dirY / dist;
            targetVelX = targetWorldDirX * MAX_SPEED_WORLD * AI_SPEED_MULTIPLIER;
            targetVelY = targetWorldDirY * MAX_SPEED_WORLD * AI_SPEED_MULTIPLIER;
        }
    }

    // 3. Apply Movement Physics (modify velocity object)
    // Apply Drag
    const dragFactor = 1.0 - Math.min(DRAG_FACTOR * dt, 1.0);
    velocity.vx *= dragFactor;
    velocity.vy *= dragFactor;

    // Apply Acceleration
    const aiAccelRate = ACCEL_RATE_WORLD * AI_ACCEL_MULTIPLIER;
    const accelFactor = Math.min(aiAccelRate * dt, 1.0);
    velocity.vx = lerp(velocity.vx, targetVelX, accelFactor);
    velocity.vy = lerp(velocity.vy, targetVelY, accelFactor);

    // 4. Update AI Player State (Position & Heading)
    // Update Position
    if (isFinite(velocity.vx) && isFinite(velocity.vy)) {
        aiPlayer.x += velocity.vx * dt;
        aiPlayer.y += velocity.vy * dt;
    } else {
        console.warn(`[${sessionId}] Invalid AI velocity (vx:${velocity.vx}, vy:${velocity.vy}), skipping position update.`);
        velocity.vx = 0; velocity.vy = 0;
    }

    // Update Heading
    let targetHeading = aiPlayer.heading;
    if (targetWorldDirX !== 0 || targetWorldDirY !== 0) {
        targetHeading = Math.atan2(targetWorldDirY, targetWorldDirX);
    }
    if (isFinite(targetHeading)) {
        const turnFactor = Math.min(TURN_SMOOTH_WORLD * dt, 1.0);
        aiPlayer.heading = angleLerp(aiPlayer.heading, targetHeading, turnFactor);
    } else {
        console.warn(`[${sessionId}] Invalid targetHeading (${targetHeading}) for AI, skipping rotation update.`);
    }
}
