/**
 * aiController.ts
 *
 * Logic for updating AI player state (targeting and movement).
 */

import { ArenaState, Player } from "../schemas/ArenaState";
import { lerp, angleLerp } from "../utils/helpers";
import {
    MAX_SPEED,
    ACCELERATION,
    FRICTION_FACTOR,
    TURN_SPEED,
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

    const aiSpeedLimit = MAX_SPEED * AI_SPEED_MULTIPLIER; // Define here

    if (targetFound) {
        const dirX = targetX - aiPlayer.x;
        const dirY = targetY - aiPlayer.y;
        const dist = Math.sqrt(dirX * dirX + dirY * dirY);

        if (dist > 0.1) { // Threshold to prevent jittering
            targetWorldDirX = dirX / dist;
            targetWorldDirY = dirY / dist;
            targetVelX = targetWorldDirX * aiSpeedLimit;
            targetVelY = targetWorldDirY * aiSpeedLimit;
        }
    }

    // 3. Apply Movement Physics (modify velocity object)
    // Apply Friction (using FRICTION_FACTOR)
    const friction = Math.pow(FRICTION_FACTOR, dt);
    velocity.vx *= friction;
    velocity.vy *= friction;

    // Apply Acceleration (using ACCELERATION * AI_ACCEL_MULTIPLIER)
    const aiAcceleration = ACCELERATION * AI_ACCEL_MULTIPLIER;
    const accelX = targetWorldDirX * aiAcceleration * dt;
    const accelY = targetWorldDirY * aiAcceleration * dt;

    velocity.vx += accelX;
    velocity.vy += accelY;

    // Clamp velocity to the AI's speed limit
    const currentSpeedSq = velocity.vx * velocity.vx + velocity.vy * velocity.vy;
    const maxSpeedSq = aiSpeedLimit * aiSpeedLimit; // Now accessible
    if (currentSpeedSq > maxSpeedSq) {
        const speedReductionFactor = Math.sqrt(maxSpeedSq / currentSpeedSq);
        velocity.vx *= speedReductionFactor;
        velocity.vy *= speedReductionFactor;
    }

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
        // Use TURN_SPEED constant for AI turning
        const turnAmount = TURN_SPEED * dt;
        aiPlayer.heading = angleLerp(aiPlayer.heading, targetHeading, turnAmount);
    } else {
        console.warn(`[${sessionId}] Invalid targetHeading (${targetHeading}) for AI, skipping rotation update.`);
    }
}
