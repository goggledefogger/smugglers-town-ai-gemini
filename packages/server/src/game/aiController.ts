/**
 * aiController.ts
 *
 * Determines the AI target via the state machine, then delegates movement.
 */

import { ArenaState, Player } from "@smugglers-town/shared-schemas";
import {
    MAX_SPEED,
    ACCELERATION,
    AI_SPEED_MULTIPLIER,
    AI_ACCEL_MULTIPLIER,
} from "../config/constants";
import { AIState } from "../ai/types";
import { determineAIState } from "../ai/aiStateMachine";
import {
    getSeekItemTarget,
    getPursueCarrierTarget,
    getReturnToBaseTarget,
} from "../ai/aiActions";
import { MapData } from "../map/mapData";
import { updateVehicle } from "./movement";

type PlayerVelocity = { vx: number; vy: number };
type TargetCoordinates = { x: number; y: number };

const AI_STOPPING_DISTANCE_SQ = 0.01; // stop jittering when effectively at target

export function updateAIState(
    aiPlayer: Player,
    sessionId: string,
    velocity: PlayerVelocity,
    state: ArenaState,
    mapData: MapData | null,
    dt: number
): void {
    const nextStateEnum = determineAIState(sessionId, aiPlayer, state);
    aiPlayer.currentState = nextStateEnum;

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
        default:
            console.warn(`[AI ${aiPlayer.name}] Unknown state: ${aiPlayer.currentState}. Falling back to SEEKING_ITEM.`);
            target = getSeekItemTarget(aiPlayer, state);
            break;
    }

    let targetDir = { x: 0, y: 0 };
    if (target) {
        const dx = target.x - aiPlayer.x;
        const dy = target.y - aiPlayer.y;
        const dSq = dx * dx + dy * dy;
        if (dSq > AI_STOPPING_DISTANCE_SQ) {
            const dist = Math.sqrt(dSq);
            targetDir = { x: dx / dist, y: dy / dist };
        }
    }

    updateVehicle(
        aiPlayer,
        targetDir,
        velocity,
        { maxSpeed: MAX_SPEED * AI_SPEED_MULTIPLIER, accel: ACCELERATION * AI_ACCEL_MULTIPLIER },
        mapData,
        dt
    );
}
