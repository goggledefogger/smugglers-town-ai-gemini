/**
 * playerController.ts
 *
 * Maps human input to a world direction and delegates to shared movement.
 */

import { Player } from "@smugglers-town/shared-schemas";
import { MAX_SPEED, ACCELERATION } from "../config/constants";
import { MapData } from "../map/mapData";
import { updateVehicle } from "./movement";

type PlayerInput = { dx: number, dy: number };
type PlayerVelocity = { vx: number, vy: number };

export function updateHumanPlayerState(
    player: Player,
    input: PlayerInput,
    velocity: PlayerVelocity,
    mapData: MapData | null,
    dt: number
): void {
    const magnitude = Math.sqrt(input.dx * input.dx + input.dy * input.dy);
    // Screen-space input (+y = down) to world space (+y = north): flip Y.
    const targetDir = magnitude > 0
        ? { x: input.dx / magnitude, y: -input.dy / magnitude }
        : { x: 0, y: 0 };

    updateVehicle(player, targetDir, velocity, { maxSpeed: MAX_SPEED, accel: ACCELERATION }, mapData, dt);
}
