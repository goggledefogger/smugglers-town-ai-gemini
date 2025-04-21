/**
 * playerController.ts
 *
 * Logic for updating human player state based on input.
 */

import { Player } from "../schemas/ArenaState";
import { lerp, angleLerp, isPointInRectangle } from "../utils/helpers";
import {
    MAX_SPEED,
    ACCELERATION,
    FRICTION_FACTOR,
    TURN_SPEED,
    WATER_ZONE,
    ROAD_SPEED_MULTIPLIER
} from "../config/constants";

// Define types for input and velocity maps for clarity
type PlayerInput = { dx: number, dy: number };
type PlayerVelocity = { vx: number, vy: number };

// Cache for storing results of road queries (SessionID -> {isOnRoad, lastQueryTime})
// In a real app, manage this cache more robustly (e.g., in ArenaRoom, handle player leave)
const playerRoadStatusCache = new Map<string, { isOnRoad: boolean, lastQueryTime: number }>();
const ROAD_QUERY_INTERVAL_MS = 500; // How often to query Mapbox (milliseconds)

/**
 * Updates a human player's position and heading based on their input and current velocity.
 * Modifies the player state and velocity object directly.
 * Includes asynchronous check for road features to adjust speed.
 */
export function updateHumanPlayerState(
    player: Player,
    input: PlayerInput,
    velocity: PlayerVelocity,
    isOnRoad: boolean,
    dt: number
): void {
    const inputDirX = input.dx;
    const inputDirY = input.dy;
    let magnitude = Math.sqrt(inputDirX * inputDirX + inputDirY * inputDirY);

    let targetWorldDirX = 0;
    let targetWorldDirY = 0;
    if (magnitude > 0) {
        targetWorldDirX = inputDirX / magnitude;
        targetWorldDirY = -inputDirY / magnitude; // Y-flip
    }

    // Apply Friction (using FRICTION_FACTOR)
    // Drag is 1 - friction. Lower friction factor = more drag.
    const friction = Math.pow(FRICTION_FACTOR, dt); // Apply friction over time dt
    velocity.vx *= friction;
    velocity.vy *= friction;

    // --- Road Speed Check (Now uses passed-in status) ---
    const currentSpeedLimit = isOnRoad ? MAX_SPEED * ROAD_SPEED_MULTIPLIER : MAX_SPEED;

    // Calculate Target Velocity Vector (Direction * Speed Limit)
    const targetVelX = targetWorldDirX * currentSpeedLimit;
    const targetVelY = targetWorldDirY * currentSpeedLimit;

    // Interpolate current velocity towards target velocity
    // The factor determines how quickly the velocity changes direction
    // Higher ACCELERATION means a larger factor (faster change)
    const lerpFactor = Math.min(ACCELERATION * dt / currentSpeedLimit, 1.0); // Normalize factor relative to speed limit, clamp to 1

    velocity.vx = lerp(velocity.vx, targetVelX, lerpFactor);
    velocity.vy = lerp(velocity.vy, targetVelY, lerpFactor);

    // Calculate potential next position
    let nextX = player.x;
    let nextY = player.y;
    if (isFinite(velocity.vx) && isFinite(velocity.vy)) {
        nextX += velocity.vx * dt;
        nextY += velocity.vy * dt;
    } else {
        console.warn(`[${player.name}] Invalid velocity (vx:${velocity.vx}, vy:${velocity.vy}), resetting velocity.`);
        velocity.vx = 0; velocity.vy = 0;
        nextX = player.x; // Ensure next position doesn't use invalid velocity
        nextY = player.y;
    }

    // Check for Water Hazard Collision
    if (isPointInRectangle(nextX, nextY, WATER_ZONE)) {
        console.log(`[${player.name}] Hit water hazard! Resetting position and velocity.`);
        player.x = 0; // Reset to origin
        player.y = 0;
        velocity.vx = 0; // Stop movement
        velocity.vy = 0;
        player.justReset = true;
        // Optional: Reset heading? Maybe keep it as is.
    } else {
        // Update Position only if not in water
        player.x = nextX;
        player.y = nextY;
    }

    // Update Heading
    let targetHeading = player.heading;
    if (targetWorldDirX !== 0 || targetWorldDirY !== 0) {
        targetHeading = Math.atan2(targetWorldDirY, targetWorldDirX);
    }
    if (isFinite(targetHeading)) {
        // Use TURN_SPEED constant
        const turnAmount = TURN_SPEED * dt;
        player.heading = angleLerp(player.heading, targetHeading, turnAmount); // Use turnAmount directly for lerp factor over time
    } else {
        console.warn(`[${player.name}] Invalid targetHeading, skipping rotation.`);
    }
}
