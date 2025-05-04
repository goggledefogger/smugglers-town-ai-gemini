/**
 * aiController.ts
 *
 * Logic for updating AI player state (targeting and movement).
 */

import { ArenaState, Player } from "@smugglers-town/shared-schemas";
import { lerp, angleLerp, isPointInRectangle, distSq } from "@smugglers-town/shared-utils";
import {
    FRICTION_FACTOR,
    TURN_SPEED,
    AI_SPEED_MULTIPLIER,
    ROAD_SPEED_MULTIPLIER,
    BASE_RADIUS_SQ, // Keep this if needed for logic elsewhere
    WATER_ZONE
} from "../config/constants";
import { AIState } from "../ai/types";
import { determineAIState } from "../ai/aiStateMachine";
import {
    getSeekItemTarget,
    getPursueCarrierTarget,
    getReturnToBaseTarget,
    getInterceptTarget,
    getDefendTarget
} from "../ai/aiActions";
import { RED_BASE_POS, BLUE_BASE_POS } from "@smugglers-town/shared-utils";

// Factor to look ahead for road prediction (e.g., 1.5 means predict 1.5 * dt ahead)
export const PREDICTION_LOOKAHEAD_FACTOR = 12; // EXPORTED

// Define type for velocity maps for clarity
type PlayerVelocity = { vx: number; vy: number };
type TargetCoordinates = { x: number; y: number }; // Keep local type if needed

/**
 * Updates an AI player's position and heading based on game state.
 * Determines target using the state machine, calculates velocity, and applies movement.
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
    dt: number,
    effectiveMaxSpeed: number,
    effectiveAcceleration: number
): { nextX: number; nextY: number } { // RETURN predicted next pos FOR ROAD CHECK

    // --- 1. Determine AI State and Target ---
    const nextStateEnum = determineAIState(sessionId, aiPlayer, state);
    aiPlayer.currentState = nextStateEnum; // Update player schema state

    let target: TargetCoordinates | null = null;

    switch (aiPlayer.currentState) {
        case AIState.SEEKING_ITEM:
            target = getSeekItemTarget(aiPlayer, state);
            break;
        case AIState.PURSUING_CARRIER:
            target = getPursueCarrierTarget(aiPlayer, state);
            break;
        case AIState.RETURNING_TO_BASE:
            target = getReturnToBaseTarget(aiPlayer, state);
            break;
        case AIState.INTERCEPTING:
            target = getInterceptTarget(aiPlayer, state);
            break;
        case AIState.DEFENDING:
            target = getDefendTarget(aiPlayer, state);
            break;
        default:
            console.warn(`[AI ${aiPlayer.name}] Unknown state: ${aiPlayer.currentState}. Falling back to SEEKING_ITEM.`);
            target = getSeekItemTarget(aiPlayer, state); // Fallback
            break;
    }

    const targetX = target ? target.x : null;
    const targetY = target ? target.y : null;

    // --- Existing Movement Logic (sections 2-8) ---

    // 2. Calculate Desired Velocity
    let targetVelX = 0;
    let targetVelY = 0;
    let targetWorldDirX = 0;
    let targetWorldDirY = 0;

    // Apply road speed boost if applicable (using prediction from LAST tick)
    const currentAISpeedLimit = predictedIsOnRoadFromLastTick
        ? effectiveMaxSpeed * AI_SPEED_MULTIPLIER * ROAD_SPEED_MULTIPLIER
        : effectiveMaxSpeed * AI_SPEED_MULTIPLIER;

    if (targetX !== null && targetY !== null) {
        const dx = targetX - aiPlayer.x;
        const dy = targetY - aiPlayer.y;
        // Calculate squared distance for stopping check
        const distSqToTarget = dx * dx + dy * dy;
        const AI_STOPPING_DISTANCE_SQ = 0.01; // Use squared distance (0.1 * 0.1)

        if (distSqToTarget > AI_STOPPING_DISTANCE_SQ) { // Only move if not already at target
            const dist = Math.sqrt(distSqToTarget); // Calculate actual dist only when needed
            targetWorldDirX = dx / dist;
            targetWorldDirY = dy / dist;
            targetVelX = targetWorldDirX * currentAISpeedLimit;
            targetVelY = targetWorldDirY * currentAISpeedLimit;
        }
    } // else: No target, targetVel remains 0

    // 3. Interpolate Velocity & Apply Friction
    velocity.vx *= (1 - FRICTION_FACTOR);
    velocity.vy *= (1 - FRICTION_FACTOR);

    // Clamp velocity
    const currentSpeedSq = velocity.vx * velocity.vx + velocity.vy * velocity.vy;
    const currentMaxSpeed = effectiveMaxSpeed * (predictedIsOnRoadFromLastTick ? ROAD_SPEED_MULTIPLIER : 1.0); // USE effectiveMaxSpeed
    const maxSpeedSq = currentMaxSpeed * currentMaxSpeed;

    if (currentSpeedSq > maxSpeedSq) {
        console.warn(`[AI ${aiPlayer.name}] Velocity clamped. Current speed: ${Math.sqrt(currentSpeedSq)}, Max speed: ${currentMaxSpeed}`);
        const scale = currentMaxSpeed / Math.sqrt(currentSpeedSq);
        velocity.vx *= scale;
        velocity.vy *= scale;
    }

    // Ensure acceleration logic doesn't break if speed limit is 0 (shouldn't happen often)
    const lerpFactor = Math.min(effectiveAcceleration, 1.0);

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
        // Reset justReset flag after successful movement outside water
        if (aiPlayer.justReset) aiPlayer.justReset = false;
    }

    // 8. Update Heading
    let targetHeading = aiPlayer.heading;
    // Only update heading if there was a target direction
    if (targetWorldDirX !== 0 || targetWorldDirY !== 0) {
        targetHeading = Math.atan2(targetWorldDirY, targetWorldDirX);
    }
    if (isFinite(targetHeading)) {
        const turnAmount = TURN_SPEED * dt; // Use base TURN_SPEED
        aiPlayer.heading = angleLerp(aiPlayer.heading, targetHeading, turnAmount);
    } // else: Maintain current heading if no target or invalid heading

    // Return the calculated potential next position FOR THE ROAD CHECK
    return { nextX: predictedRoadCheckX, nextY: predictedRoadCheckY };
}
