/**
 * movement.ts
 *
 * Shared vehicle movement/physics for human and AI players.
 * Friction, acceleration toward a target direction, road speed boost,
 * water hazard reset, and building collision (sweep + slide).
 */

import { Player } from "@smugglers-town/shared-schemas";
import { lerp, angleLerp } from "@smugglers-town/shared-utils";
import { FRICTION_FACTOR, TURN_SPEED, ROAD_SPEED_MULTIPLIER } from "../config/constants";
import { MapData } from "../map/mapData";

type PlayerVelocity = { vx: number; vy: number };

export interface VehicleOpts {
    maxSpeed: number;
    accel: number;
}

/**
 * Advances a vehicle one tick. Mutates player position/heading and velocity.
 * `targetDir` is a unit direction vector in world space, or {0,0} to coast.
 * Reads `player.isOnRoad` (set by the room each tick) for the road speed boost.
 */
export function updateVehicle(
    player: Player,
    targetDir: { x: number; y: number },
    velocity: PlayerVelocity,
    opts: VehicleOpts,
    mapData: MapData | null,
    dt: number
): void {
    const speedLimit = player.isOnRoad ? opts.maxSpeed * ROAD_SPEED_MULTIPLIER : opts.maxSpeed;

    const friction = Math.pow(FRICTION_FACTOR, dt);
    velocity.vx *= friction;
    velocity.vy *= friction;

    const lerpFactor = Math.min(speedLimit > 0 ? opts.accel * dt / speedLimit : 1.0, 1.0);
    velocity.vx = lerp(velocity.vx, targetDir.x * speedLimit, lerpFactor);
    velocity.vy = lerp(velocity.vy, targetDir.y * speedLimit, lerpFactor);

    if (!isFinite(velocity.vx) || !isFinite(velocity.vy)) {
        console.warn(`[${player.name}] Invalid velocity (vx:${velocity.vx}, vy:${velocity.vy}), resetting.`);
        velocity.vx = 0;
        velocity.vy = 0;
    }

    let nextX = player.x + velocity.vx * dt;
    let nextY = player.y + velocity.vy * dt;

    if (mapData?.surfaceAt(nextX, nextY) === 'water') {
        console.log(`[${player.name}] Hit water hazard! Resetting position.`);
        const safe = mapData.findAccessibleNear(0, 0);
        player.x = safe.x;
        player.y = safe.y;
        velocity.vx = 0;
        velocity.vy = 0;
        player.justReset = true;
    } else {
        const hit = mapData?.sweepBuilding(player.x, player.y, nextX, nextY);
        if (hit) {
            nextX = hit.hitX;
            nextY = hit.hitY;
            // Slide: remove the velocity component into the wall, keep the tangent.
            const vn = velocity.vx * hit.nx + velocity.vy * hit.ny;
            if (vn < 0) {
                velocity.vx -= vn * hit.nx;
                velocity.vy -= vn * hit.ny;
            }
        }
        player.x = nextX;
        player.y = nextY;
        if (player.justReset) player.justReset = false;
    }

    if (targetDir.x !== 0 || targetDir.y !== 0) {
        const targetHeading = Math.atan2(targetDir.y, targetDir.x);
        if (isFinite(targetHeading)) {
            player.heading = angleLerp(player.heading, targetHeading, TURN_SPEED * dt);
        }
    }
}
