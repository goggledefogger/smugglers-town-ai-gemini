/**
 * playerController.ts
 *
 * Logic for updating human player state based on input.
 */

import { Player, ArenaState } from "@smugglers-town/shared-schemas";
import { lerp, angleLerp, isPointInRectangle } from "@smugglers-town/shared-utils";
import {
    FRICTION_FACTOR,
    TURN_SPEED,
    ROAD_SPEED_MULTIPLIER,
    WATER_ZONE,
} from "../config/constants";
import * as ServerConstants from "../config/constants";

// Factor to look ahead for road prediction (e.g., 12 means predict 12 * velocity * dt ahead)
const PREDICTION_LOOKAHEAD_FACTOR = 12;

// Define types for input and velocity maps for clarity
type PlayerInput = { dx: number, dy: number };
type PlayerVelocity = { vx: number, vy: number };
type InputMap = Record<string, boolean>;

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
    isOnRoad: boolean,
    dt: number,
    effectiveMaxSpeed: number,
    effectiveAcceleration: number
): { nextX: number, nextY: number } { // Return predicted position
    const inputDirX = input.dx;
    const inputDirY = input.dy;

    // --- Turn towards input direction ---
    if (inputDirX !== 0 || inputDirY !== 0) {
        const targetAngle = Math.atan2(inputDirY, inputDirX);
        let angleDiff = targetAngle - player.heading;
        // Normalize angle difference to [-PI, PI]
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        // Apply turn speed
        const turnAmount = Math.sign(angleDiff) * Math.min(TURN_SPEED * dt, Math.abs(angleDiff));
        player.heading += turnAmount;
        // Normalize heading
        while (player.heading > Math.PI) player.heading -= 2 * Math.PI;
        while (player.heading < -Math.PI) player.heading += 2 * Math.PI;
    }

    // Apply acceleration in the direction the car is facing
    const facingAngle = player.heading;
    const accelX = Math.cos(facingAngle) * effectiveAcceleration; // USE effective
    const accelY = Math.sin(facingAngle) * effectiveAcceleration;

    // Only apply acceleration if there is input (magnitude > threshold?)
    if (inputDirX !== 0 || inputDirY !== 0) { // Simple check for any input
         velocity.vx += accelX * dt;
         velocity.vy += accelY * dt;
    }

    // Apply friction (drag)
    velocity.vx *= (1 - FRICTION_FACTOR);
    velocity.vy *= (1 - FRICTION_FACTOR);

    // Clamp velocity to max speed
    const currentSpeedSq = velocity.vx * velocity.vx + velocity.vy * velocity.vy;
    const currentMaxSpeed = effectiveMaxSpeed * (isOnRoad ? ROAD_SPEED_MULTIPLIER : 1.0); // USE effective
    const maxSpeedSq = currentMaxSpeed * currentMaxSpeed;

    if (currentSpeedSq > maxSpeedSq) {
        const speed = Math.sqrt(currentSpeedSq);
        velocity.vx = (velocity.vx / speed) * currentMaxSpeed;
        velocity.vy = (velocity.vy / speed) * currentMaxSpeed;
    }

    // Update player position
    player.x += velocity.vx * dt;
    player.y += velocity.vy * dt;

    // Calculate the potential next position for the road check
    const predictedRoadCheckX = player.x + velocity.vx * dt * PREDICTION_LOOKAHEAD_FACTOR;
    const predictedRoadCheckY = player.y + velocity.vy * dt * PREDICTION_LOOKAHEAD_FACTOR;

    return { nextX: predictedRoadCheckX, nextY: predictedRoadCheckY };
}
