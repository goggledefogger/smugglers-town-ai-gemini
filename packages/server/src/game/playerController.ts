/**
 * playerController.ts
 *
 * Logic for updating human player state based on input.
 */

import { Player, ArenaState } from "@smugglers-town/shared-schemas";
import { lerp, angleLerp, isPointInRectangle } from "@smugglers-town/shared-utils";
import {
    MAX_SPEED,
    ACCELERATION,
    FRICTION_FACTOR,
    TURN_SPEED,
    WATER_ZONE,
    ROAD_SPEED_MULTIPLIER,
} from "../config/constants";
import * as ServerConstants from "../config/constants";

// Define types for input and velocity maps for clarity
type PlayerInput = { dx: number, dy: number };
type PlayerVelocity = { vx: number, vy: number };
type InputMap = Record<string, boolean>;

// Factor to look ahead for road prediction (e.g., 1.5 means predict 1.5 * dt ahead)
const PREDICTION_LOOKAHEAD_FACTOR = 12;

// Cache for storing results of road queries (SessionID -> {isOnRoad, lastQueryTime})
// In a real app, manage this cache more robustly (e.g., in ArenaRoom, handle player leave)
const playerRoadStatusCache = new Map<string, { isOnRoad: boolean, lastQueryTime: number }>();
const ROAD_QUERY_INTERVAL_MS = 500; // How often to query Mapbox (milliseconds)

/**
 * Updates a human player's position and heading based on their input and current velocity.
 * Modifies the player state and velocity object directly.
 * Calculates the potential next position BEFORE applying it.
 * Uses the predicted road status from the PREVIOUS tick to determine speed for THIS tick.
 * Calculates a slightly further prediction for the road check.
 * @returns The predicted next position FOR THE ROAD CHECK { nextX: number, nextY: number }.
 */
export function updateHumanPlayerState(
    player: Player,
    input: PlayerInput,
    velocity: PlayerVelocity,
    predictedIsOnRoadFromLastTick: boolean, // RECEIVED from cache
    dt: number
): { nextX: number; nextY: number } { // RETURN predicted next pos FOR ROAD CHECK
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
    const friction = Math.pow(FRICTION_FACTOR, dt);
    velocity.vx *= friction;
    velocity.vy *= friction;

    // --- Road Speed Check (Uses prediction from LAST tick) ---
    const currentSpeedLimit = predictedIsOnRoadFromLastTick ? MAX_SPEED * ROAD_SPEED_MULTIPLIER : MAX_SPEED;

    // Calculate Target Velocity Vector (Direction * Speed Limit)
    const targetVelX = targetWorldDirX * currentSpeedLimit;
    const targetVelY = targetWorldDirY * currentSpeedLimit;

    // Interpolate current velocity towards target velocity
    const lerpFactor = Math.min(ACCELERATION * dt / currentSpeedLimit, 1.0);
    velocity.vx = lerp(velocity.vx, targetVelX, lerpFactor);
    velocity.vy = lerp(velocity.vy, targetVelY, lerpFactor);

    // Calculate ACTUAL potential next position (for this tick's movement)
    let actualNextX = player.x;
    let actualNextY = player.y;
    if (isFinite(velocity.vx) && isFinite(velocity.vy)) {
        actualNextX += velocity.vx * dt;
        actualNextY += velocity.vy * dt;
    } else {
        console.warn(`[${player.name}] Invalid velocity (vx:${velocity.vx}, vy:${velocity.vy}), resetting velocity.`);
        velocity.vx = 0; velocity.vy = 0;
        actualNextX = player.x; // Use current position if velocity invalid
        actualNextY = player.y;
    }

    // Calculate PREDICTED position for NEXT tick's ROAD CHECK (further ahead)
    let predictedRoadCheckX = player.x;
    let predictedRoadCheckY = player.y;
    if (isFinite(velocity.vx) && isFinite(velocity.vy)) {
        predictedRoadCheckX += velocity.vx * dt * PREDICTION_LOOKAHEAD_FACTOR;
        predictedRoadCheckY += velocity.vy * dt * PREDICTION_LOOKAHEAD_FACTOR;
    } else {
        // Use current position if velocity invalid
        predictedRoadCheckX = player.x;
        predictedRoadCheckY = player.y;
    }

    // Check for Water Hazard Collision using ACTUAL predicted position
    if (isPointInRectangle(actualNextX, actualNextY, WATER_ZONE)) {
        console.log(`[${player.name}] Hit water hazard! Resetting position and velocity.`);
        player.x = 0; // Reset to origin
        player.y = 0;
        velocity.vx = 0; // Stop movement
        velocity.vy = 0;
        player.justReset = true;
        // Recalculate predictedRoadCheckX/Y after reset to return correct prediction
        predictedRoadCheckX = 0;
        predictedRoadCheckY = 0;
    } else {
        // Update ACTUAL player Position only if not in water
        player.x = actualNextX;
        player.y = actualNextY;
    }

    // Update Heading based on input direction
    let targetHeading = player.heading;
    if (targetWorldDirX !== 0 || targetWorldDirY !== 0) {
        targetHeading = Math.atan2(targetWorldDirY, targetWorldDirX);
    }
    if (isFinite(targetHeading)) {
        const turnAmount = TURN_SPEED * dt;
        player.heading = angleLerp(player.heading, targetHeading, turnAmount);
    } else {
        console.warn(`[${player.name}] Invalid targetHeading, skipping rotation.`);
    }

    // Return the calculated potential next position FOR THE ROAD CHECK
    return { nextX: predictedRoadCheckX, nextY: predictedRoadCheckY };
}
