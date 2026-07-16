/**
 * aiController.ts
 *
 * AI steering: FSM picks a goal, the road graph decides how to get there
 * (route along roads for the speed boost when it's faster than driving
 * straight), and shared movement does the physics.
 */

import { ArenaState, Player } from "@smugglers-town/shared-schemas";
import {
    MAX_SPEED,
    ACCELERATION,
    AI_SPEED_MULTIPLIER,
    AI_ACCEL_MULTIPLIER,
    ROAD_SPEED_MULTIPLIER,
} from "../config/constants";
import { AIState } from "../ai/types";
import { determineAIState } from "../ai/aiStateMachine";
import {
    getSeekItemTarget,
    getPursueCarrierTarget,
    getReturnToBaseTarget,
    getInterceptTarget,
    getDefendTarget,
} from "../ai/aiActions";
import { MapData } from "../map/mapData";
import { RoadGraph, Waypoint } from "../map/roadGraph";
import { updateVehicle } from "./movement";

type PlayerVelocity = { vx: number; vy: number };
type TargetCoordinates = { x: number; y: number };

const AI_STOPPING_DISTANCE_SQ = 0.01;
const STATE_HYSTERESIS_MS = 500;
const REPLAN_INTERVAL_MS = 1000;
const GOAL_MOVED_REPLAN_SQ = 20 * 20;
const WAYPOINT_RADIUS_SQ = 8 * 8;

type Plan = { waypoints: Waypoint[]; waypointIndex: number; goalX: number; goalY: number; plannedAtMs: number };
type StateMemory = { state: AIState; sinceMs: number; carried: boolean };

// Keyed by AI session id. Ids embed the room id (see ArenaRoom.handleAddAIRequest),
// so module scope is safe across concurrent rooms.
const aiPlans = new Map<string, Plan>();
const aiStateMemory = new Map<string, StateMemory>();

/** Drop per-bot runtime state. Call when an AI player is removed. */
export function clearAIRuntime(sessionId: string): void {
    aiPlans.delete(sessionId);
    aiStateMemory.delete(sessionId);
}

export function updateAIState(
    aiPlayer: Player,
    sessionId: string,
    velocity: PlayerVelocity,
    state: ArenaState,
    mapData: MapData | null,
    roadGraph: RoadGraph | null,
    dt: number
): void {
    const now = Date.now();
    const carried = isCarrying(state, sessionId);
    const desired = determineAIState(sessionId, aiPlayer, state);
    aiPlayer.currentState = applyHysteresis(sessionId, desired, carried, now);

    let target: TargetCoordinates | null = null;
    switch (aiPlayer.currentState) {
        case AIState.SEEKING_ITEM:
            target = getSeekItemTarget(aiPlayer, state);
            break;
        case AIState.PURSUING_CARRIER:
            target = getPursueCarrierTarget(aiPlayer, state);
            break;
        case AIState.INTERCEPTING:
            target = getInterceptTarget(aiPlayer, state);
            break;
        case AIState.DEFENDING:
            target = getDefendTarget(aiPlayer, state);
            break;
        case AIState.RETURNING_TO_BASE:
            target = getReturnToBaseTarget(aiPlayer, state);
            break;
        default:
            target = getSeekItemTarget(aiPlayer, state);
            break;
    }

    let targetDir = { x: 0, y: 0 };
    if (target) {
        const steer = resolveSteerPoint(sessionId, aiPlayer, target, roadGraph, now);
        const dx = steer.x - aiPlayer.x;
        const dy = steer.y - aiPlayer.y;
        const dSq = dx * dx + dy * dy;
        if (dSq > AI_STOPPING_DISTANCE_SQ) {
            const dist = Math.sqrt(dSq);
            targetDir = { x: dx / dist, y: dy / dist };
        }
    } else {
        aiPlans.delete(sessionId);
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

function isCarrying(state: ArenaState, sessionId: string): boolean {
    for (const item of state.items) {
        if (item.status === 'carried' && item.carrierId === sessionId) return true;
    }
    return false;
}

/**
 * Keep the previous state for STATE_HYSTERESIS_MS unless carry status changed —
 * prevents SEEK/PURSUE flicker when an item is grabbed and instantly stolen.
 */
function applyHysteresis(sessionId: string, desired: AIState, carried: boolean, now: number): AIState {
    const mem = aiStateMemory.get(sessionId);
    if (mem && mem.state !== desired && mem.carried === carried && now - mem.sinceMs < STATE_HYSTERESIS_MS) {
        return mem.state;
    }
    if (!mem || mem.state !== desired || mem.carried !== carried) {
        aiStateMemory.set(sessionId, {
            state: desired,
            sinceMs: mem && mem.state === desired ? mem.sinceMs : now,
            carried,
        });
    }
    return desired;
}

/**
 * The point to steer toward right now: the current waypoint of the bot's
 * road plan, or the goal itself when off-network / not worth the detour.
 * Plans at most once per REPLAN_INTERVAL_MS per bot.
 */
function resolveSteerPoint(
    sessionId: string,
    player: Player,
    goal: TargetCoordinates,
    roadGraph: RoadGraph | null,
    now: number
): Waypoint {
    if (!roadGraph || roadGraph.nodeCount === 0) return goal;

    let plan = aiPlans.get(sessionId);
    const needsReplan = !plan
        || now - plan.plannedAtMs >= REPLAN_INTERVAL_MS
        || sq(goal.x - plan.goalX) + sq(goal.y - plan.goalY) > GOAL_MOVED_REPLAN_SQ
        || plan.waypointIndex >= plan.waypoints.length;

    if (needsReplan) {
        plan = makePlan(player, goal, roadGraph, now);
        aiPlans.set(sessionId, plan);
    }

    // Advance past waypoints we've reached (never past the final one).
    while (plan!.waypointIndex < plan!.waypoints.length - 1) {
        const wp = plan!.waypoints[plan!.waypointIndex];
        if (sq(wp.x - player.x) + sq(wp.y - player.y) <= WAYPOINT_RADIUS_SQ) {
            plan!.waypointIndex++;
        } else {
            break;
        }
    }
    return plan!.waypoints[plan!.waypointIndex];
}

function makePlan(player: Player, goal: TargetCoordinates, roadGraph: RoadGraph, now: number): Plan {
    const path = roadGraph.findPath(player.x, player.y, goal.x, goal.y);
    const waypoints = (path && path.length >= 2 && roadIsWorthIt(player, goal, path))
        ? path
        : [{ x: goal.x, y: goal.y }];
    return { waypoints, waypointIndex: 0, goalX: goal.x, goalY: goal.y, plannedAtMs: now };
}

/**
 * Compare travel times, not distances: off-road legs at base speed, on-road
 * legs at boosted speed. Straight across the plaza wins when the detour
 * isn't worth it. (AI speed multiplier cancels out of both sides.)
 */
function roadIsWorthIt(player: Player, goal: TargetCoordinates, path: Waypoint[]): boolean {
    const directTime = Math.hypot(goal.x - player.x, goal.y - player.y) / MAX_SPEED;
    const entry = path[0];
    const exit = path[path.length - 2]; // last road node; path ends with the goal itself
    let roadLen = 0;
    for (let i = 0; i < path.length - 2; i++) {
        roadLen += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
    }
    const offRoad = Math.hypot(entry.x - player.x, entry.y - player.y)
        + Math.hypot(goal.x - exit.x, goal.y - exit.y);
    const roadTime = offRoad / MAX_SPEED + roadLen / (MAX_SPEED * ROAD_SPEED_MULTIPLIER);
    return roadTime < directTime;
}

function sq(n: number): number { return n * n; }
