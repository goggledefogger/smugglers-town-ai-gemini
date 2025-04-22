/**
 * aiController.ts
 *
 * Logic for updating AI player state (targeting and movement).
 */

// import { calculateAngle } from "../utils/helpers"; // REMOVED - Incorrect import
import { ArenaState, Player, FlagState } from "@smugglers-town/shared-schemas";
import { lerp, angleLerp } from "../utils/helpers";
import {
    MAX_SPEED,
    ACCELERATION,
    FRICTION_FACTOR,
    TURN_SPEED,
    AI_SPEED_MULTIPLIER,
    AI_ACCEL_MULTIPLIER,
    ROAD_SPEED_MULTIPLIER,
    RED_BASE_POS,
    BLUE_BASE_POS,
    // AI_TARGET_REFRESH_INTERVAL, // REMOVED - Incorrect import
    // AI_COLLISION_THRESHOLD_SQ, // REMOVED - Incorrect import
    BASE_RADIUS_SQ
} from "../config/constants";

// Helper function to calculate squared distance
const distSq = (x1: number, y1: number, x2: number, y2: number): number => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
};

// Define type for velocity maps for clarity
type PlayerVelocity = { vx: number, vy: number };

/**
 * Updates an AI player's position and heading based on game state.
 * Determines target, calculates velocity, and applies movement.
 * Modifies the player state and velocity object directly.
 */
export function updateAIState(
    aiPlayer: Player,
    sessionId: string,
    velocity: PlayerVelocity,
    state: ArenaState,
    isOnRoad: boolean,
    dt: number
): void {
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
    let targetWorldDirX = 0; // For heading
    let targetWorldDirY = 0; // For heading

    // Apply road speed boost if applicable
    const currentAISpeedLimit = isOnRoad
        ? MAX_SPEED * AI_SPEED_MULTIPLIER * ROAD_SPEED_MULTIPLIER
        : MAX_SPEED * AI_SPEED_MULTIPLIER;

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
    const friction = Math.pow(FRICTION_FACTOR, dt);
    velocity.vx *= friction;
    velocity.vy *= friction;

    // Apply Acceleration (using ACCELERATION * AI_ACCEL_MULTIPLIER)
    const aiAcceleration = ACCELERATION * AI_ACCEL_MULTIPLIER;
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
