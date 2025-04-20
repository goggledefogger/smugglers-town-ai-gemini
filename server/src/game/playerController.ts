/**
 * playerController.ts
 *
 * Logic for updating human player state based on input.
 */

import { Player } from "../schemas/ArenaState";
import { lerp, angleLerp } from "../utils/helpers";
import {
    MAX_SPEED_WORLD,
    ACCEL_RATE_WORLD,
    DRAG_FACTOR,
    TURN_SMOOTH_WORLD
} from "../config/constants";

// Define types for input and velocity maps for clarity
type PlayerInput = { dx: number, dy: number };
type PlayerVelocity = { vx: number, vy: number };

/**
 * Updates a human player's position and heading based on their input and current velocity.
 * Modifies the player state and velocity object directly.
 */
export function updateHumanPlayerState(
    player: Player,
    input: PlayerInput,
    velocity: PlayerVelocity,
    dt: number
): void {
    const inputDirX = input.dx;
    const inputDirY = input.dy;
    let magnitude = Math.sqrt(inputDirX * inputDirX + inputDirY * inputDirY);

    let targetWorldDirX = 0;
    let targetWorldDirY = 0;
    if (magnitude > 0) {
        targetWorldDirX = inputDirX / magnitude;
        targetWorldDirY = -inputDirY / magnitude; // Apply Y-flip based on input convention
    }

    // Apply Drag
    const dragFactor = 1.0 - Math.min(DRAG_FACTOR * dt, 1.0);
    velocity.vx *= dragFactor;
    velocity.vy *= dragFactor;

    // Apply Acceleration towards target velocity
    const targetVelX = targetWorldDirX * MAX_SPEED_WORLD;
    const targetVelY = targetWorldDirY * MAX_SPEED_WORLD;
    const accelFactor = Math.min(ACCEL_RATE_WORLD * dt, 1.0);
    velocity.vx = lerp(velocity.vx, targetVelX, accelFactor);
    velocity.vy = lerp(velocity.vy, targetVelY, accelFactor);

    // Update Position
    if (isFinite(velocity.vx) && isFinite(velocity.vy)) {
        player.x += velocity.vx * dt;
        player.y += velocity.vy * dt;
    } else {
        console.warn(`[${player.name}] Invalid velocity (vx:${velocity.vx}, vy:${velocity.vy}), skipping position update.`);
        velocity.vx = 0; velocity.vy = 0;
    }

    // Update Heading
    let targetHeading = player.heading;
    if (targetWorldDirX !== 0 || targetWorldDirY !== 0) {
        targetHeading = Math.atan2(targetWorldDirY, targetWorldDirX);
    }
    if (isFinite(targetHeading)) {
        const turnFactor = Math.min(TURN_SMOOTH_WORLD * dt, 1.0);
        player.heading = angleLerp(player.heading, targetHeading, turnFactor);
    } else {
        console.warn(`[${player.name}] Invalid targetHeading (${targetHeading}), skipping rotation update.`);
    }
}
