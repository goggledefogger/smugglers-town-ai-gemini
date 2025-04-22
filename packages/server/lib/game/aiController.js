"use strict";
/**
 * aiController.ts
 *
 * Logic for updating AI player state (targeting and movement).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAIState = updateAIState;
const helpers_1 = require("../utils/helpers");
const shared_utils_1 = require("@smugglers-town/shared-utils"); // Import shared constants
const constants_1 = require("../config/constants");
// Helper function to calculate squared distance
const distSq = (x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
};
/**
 * Updates an AI player's position and heading based on game state.
 * Determines target, calculates velocity, and applies movement.
 * Modifies the player state and velocity object directly.
 */
function updateAIState(aiPlayer, sessionId, velocity, state, isOnRoad, dt) {
    let targetX = null;
    let targetY = null;
    let targetFound = false;
    // 1. Determine Target (Multiple Items)
    let currentTarget = null;
    let minDistanceSq = Infinity;
    // Check if AI is carrying any item
    const carriedItem = state.items.find((item) => item.carrierId === sessionId);
    if (carriedItem) {
        // AI has an item, target its own base
        currentTarget = aiPlayer.team === "Red" ? shared_utils_1.RED_BASE_POS : shared_utils_1.BLUE_BASE_POS;
        targetFound = true;
    }
    else {
        // Find nearest available/dropped item
        state.items.forEach((item) => {
            if (item.status === 'available' || item.status === 'dropped') {
                const dSq = distSq(aiPlayer.x, aiPlayer.y, item.x, item.y);
                if (dSq < minDistanceSq) {
                    minDistanceSq = dSq;
                    currentTarget = item;
                    targetFound = true;
                }
            }
        });
        // If no available item found, find nearest opponent carrier
        if (!targetFound) {
            minDistanceSq = Infinity; // Reset min distance for carrier search
            state.items.forEach((item) => {
                if (item.status === 'carried' && item.carrierId) {
                    const carrier = state.players.get(item.carrierId);
                    if (carrier && carrier.team !== aiPlayer.team) {
                        const dSq = distSq(aiPlayer.x, aiPlayer.y, carrier.x, carrier.y);
                        if (dSq < minDistanceSq) {
                            minDistanceSq = dSq;
                            currentTarget = carrier;
                            targetFound = true;
                        }
                    }
                }
            });
        }
    }
    // Extract target coordinates if a target was found
    if (targetFound && currentTarget) {
        targetX = currentTarget.x;
        targetY = currentTarget.y;
    }
    else {
        targetX = null; // No valid target
        targetY = null;
    }
    // 2. Calculate Desired Velocity
    let targetVelX = 0;
    let targetVelY = 0;
    let targetWorldDirX = 0; // For heading
    let targetWorldDirY = 0; // For heading
    // Apply road speed boost if applicable
    const currentAISpeedLimit = isOnRoad
        ? constants_1.MAX_SPEED * constants_1.AI_SPEED_MULTIPLIER * constants_1.ROAD_SPEED_MULTIPLIER
        : constants_1.MAX_SPEED * constants_1.AI_SPEED_MULTIPLIER;
    if (targetX !== null && targetY !== null) {
        const dirX = targetX - aiPlayer.x;
        const dirY = targetY - aiPlayer.y;
        const dist = Math.sqrt(dirX * dirX + dirY * dirY);
        if (dist > 0.1) { // Threshold to prevent jittering
            targetWorldDirX = dirX / dist;
            targetWorldDirY = dirY / dist;
            targetVelX = targetWorldDirX * currentAISpeedLimit;
            targetVelY = targetWorldDirY * currentAISpeedLimit;
        }
    }
    // 3. Apply Movement Physics (modify velocity object)
    // Apply Friction (using FRICTION_FACTOR)
    const friction = Math.pow(constants_1.FRICTION_FACTOR, dt);
    velocity.vx *= friction;
    velocity.vy *= friction;
    // Apply Acceleration (using ACCELERATION * AI_ACCEL_MULTIPLIER)
    const aiAcceleration = constants_1.ACCELERATION * constants_1.AI_ACCEL_MULTIPLIER;
    const accelX = targetWorldDirX * aiAcceleration * dt;
    const accelY = targetWorldDirY * aiAcceleration * dt;
    velocity.vx += accelX;
    velocity.vy += accelY;
    // Clamp velocity to the AI's potentially boosted speed limit
    const currentSpeedSq = velocity.vx * velocity.vx + velocity.vy * velocity.vy;
    const maxSpeedSq = currentAISpeedLimit * currentAISpeedLimit;
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
    }
    else {
        console.warn(`[${sessionId}] Invalid AI velocity (vx:${velocity.vx}, vy:${velocity.vy}), skipping position update.`);
        velocity.vx = 0;
        velocity.vy = 0;
    }
    // Update Heading
    let targetHeading = aiPlayer.heading;
    if (targetWorldDirX !== 0 || targetWorldDirY !== 0) {
        targetHeading = Math.atan2(targetWorldDirY, targetWorldDirX);
    }
    if (isFinite(targetHeading)) {
        // Use TURN_SPEED constant for AI turning
        const turnAmount = constants_1.TURN_SPEED * dt;
        aiPlayer.heading = (0, helpers_1.angleLerp)(aiPlayer.heading, targetHeading, turnAmount);
    }
    else {
        console.warn(`[${sessionId}] Invalid targetHeading (${targetHeading}) for AI, skipping rotation update.`);
    }
}
//# sourceMappingURL=aiController.js.map