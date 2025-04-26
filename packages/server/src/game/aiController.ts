/**
 * aiController.ts
 *
 * Logic for updating AI player state (targeting and movement).
 */

// import { calculateAngle } from "../utils/helpers"; // REMOVED - Incorrect import
import { ArenaState, Player, FlagState } from "@smugglers-town/shared-schemas";
import { lerp, angleLerp, RED_BASE_POS, BLUE_BASE_POS, isPointInRectangle } from "@smugglers-town/shared-utils"; // Removed distSq
import {
    MAX_SPEED,
    ACCELERATION,
    FRICTION_FACTOR,
    TURN_SPEED,
    AI_SPEED_MULTIPLIER,
    ROAD_SPEED_MULTIPLIER,
    // AI_TARGET_REFRESH_INTERVAL, // REMOVED - Incorrect import
    // AI_COLLISION_THRESHOLD_SQ, // REMOVED - Incorrect import
    BASE_RADIUS_SQ,
    WATER_ZONE
} from "../config/constants";

// Helper function to calculate squared distance
const distSq = (x1: number, y1: number, x2: number, y2: number): number => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
};

// Factor to look ahead for road prediction
const PREDICTION_LOOKAHEAD_FACTOR = 12;

// Define type for velocity maps for clarity
type PlayerVelocity = { vx: number; vy: number };

/**
 * Updates an AI player's position and heading based on game state.
 * Determines target, calculates velocity, and applies movement.
 * Modifies the player state and velocity object directly.
 * Calculates the potential next position BEFORE applying it.
 * Uses the predicted road status from the PREVIOUS tick to determine speed for THIS tick.
 * Calculates a slightly further prediction for the road check.
 * @returns The predicted next position FOR THE ROAD CHECK { nextX: number, nextY: number }.
 */
export function updateAIState(
    aiPlayer: Player,
    sessionId: string,
    velocity: PlayerVelocity,
    state: ArenaState,
    predictedIsOnRoadFromLastTick: boolean, // RECEIVED from cache
    dt: number
): { nextX: number; nextY: number } { // RETURN predicted next pos FOR ROAD CHECK
    let targetX: number | null = null;
    let targetY: number | null = null;
    let targetFound = false;

    // 1. Determine Target (Multiple Items)
    let currentTarget: FlagState | Player | { x: number, y: number } | null = null;
    let minDistanceSq = Infinity;

    // Check if AI is carrying any item
    const carriedItem = state.items.find((item: FlagState) => item.carrierId === sessionId);

    if (carriedItem) {
        // AI has an item, target its own base
        currentTarget = aiPlayer.team === "Red" ? RED_BASE_POS : BLUE_BASE_POS;
        targetFound = true;
    } else {
        // Find nearest available/dropped item
        state.items.forEach((item: FlagState) => {
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
            state.items.forEach((item: FlagState) => {
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
    } else {
        targetX = null; // No valid target
        targetY = null;
    }

    // 2. Calculate Desired Velocity
    let targetVelX = 0;
    let targetVelY = 0;
    let targetWorldDirX = 0;
    let targetWorldDirY = 0;

    // Apply road speed boost if applicable (using prediction from LAST tick)
    const currentAISpeedLimit = predictedIsOnRoadFromLastTick
        ? MAX_SPEED * AI_SPEED_MULTIPLIER * ROAD_SPEED_MULTIPLIER
        : MAX_SPEED * AI_SPEED_MULTIPLIER;

    if (targetX !== null && targetY !== null) {
        const dx = targetX - aiPlayer.x;
        const dy = targetY - aiPlayer.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const AI_STOPPING_DISTANCE = 0.1; // Use a small default stopping distance
        if (dist > AI_STOPPING_DISTANCE) { // Only move if not already at target
            targetWorldDirX = dx / dist;
            targetWorldDirY = dy / dist;
            targetVelX = targetWorldDirX * currentAISpeedLimit;
            targetVelY = targetWorldDirY * currentAISpeedLimit;
        }
    }

    // 3. Interpolate Velocity & Apply Friction
    const friction = Math.pow(FRICTION_FACTOR, dt);
    velocity.vx *= friction;
    velocity.vy *= friction;

    const lerpFactor = Math.min(ACCELERATION * dt / currentAISpeedLimit, 1.0); // Use base ACCELERATION
    velocity.vx = lerp(velocity.vx, targetVelX, lerpFactor);
    velocity.vy = lerp(velocity.vy, targetVelY, lerpFactor);

    // 4. Calculate ACTUAL Potential Next Position
    let actualNextX = aiPlayer.x;
    let actualNextY = aiPlayer.y;
    if (isFinite(velocity.vx) && isFinite(velocity.vy)) {
        actualNextX += velocity.vx * dt;
        actualNextY += velocity.vy * dt;
    } else {
        console.warn(`[AI ${aiPlayer.name}] Invalid velocity (vx:${velocity.vx}, vy:${velocity.vy}), resetting velocity.`);
        velocity.vx = 0; velocity.vy = 0;
        actualNextX = aiPlayer.x;
        actualNextY = aiPlayer.y;
    }

    // 5. Calculate PREDICTED position for NEXT tick's ROAD CHECK (further ahead)
    let predictedRoadCheckX = aiPlayer.x;
    let predictedRoadCheckY = aiPlayer.y;
    if (isFinite(velocity.vx) && isFinite(velocity.vy)) {
        predictedRoadCheckX += velocity.vx * dt * PREDICTION_LOOKAHEAD_FACTOR;
        predictedRoadCheckY += velocity.vy * dt * PREDICTION_LOOKAHEAD_FACTOR;
    } else {
        // Use current position if velocity invalid
        predictedRoadCheckX = aiPlayer.x;
        predictedRoadCheckY = aiPlayer.y;
    }

    // 6. Check Water Hazard (using ACTUAL predicted position)
    if (isPointInRectangle(actualNextX, actualNextY, WATER_ZONE)) {
        console.log(`[AI ${aiPlayer.name}] Hit water hazard! Resetting position and velocity.`);
        aiPlayer.x = 0; // Reset to origin
        aiPlayer.y = 0;
        velocity.vx = 0; // Stop movement
        velocity.vy = 0;
        aiPlayer.justReset = true;
        // Recalculate predictedRoadCheckX/Y after reset
        predictedRoadCheckX = 0;
        predictedRoadCheckY = 0;
    } else {
        // 7. Update Actual Position (if not in water)
        aiPlayer.x = actualNextX;
        aiPlayer.y = actualNextY;
    }

    // 8. Update Heading
    let targetHeading = aiPlayer.heading;
    if (targetWorldDirX !== 0 || targetWorldDirY !== 0) {
        targetHeading = Math.atan2(targetWorldDirY, targetWorldDirX);
    }
    if (isFinite(targetHeading)) {
        const turnAmount = TURN_SPEED * dt; // Use base TURN_SPEED
        aiPlayer.heading = angleLerp(aiPlayer.heading, targetHeading, turnAmount);
    } else {
        // Maintain current heading if no target or invalid heading
    }

    // Return the calculated potential next position FOR THE ROAD CHECK
    return { nextX: predictedRoadCheckX, nextY: predictedRoadCheckY };
}
