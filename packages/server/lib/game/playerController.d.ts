/**
 * playerController.ts
 *
 * Logic for updating human player state based on input.
 */
import { Player } from "@smugglers-town/shared-schemas";
type PlayerInput = {
    dx: number;
    dy: number;
};
type PlayerVelocity = {
    vx: number;
    vy: number;
};
/**
 * Updates a human player's position and heading based on their input and current velocity.
 * Modifies the player state and velocity object directly.
 * Includes asynchronous check for road features to adjust speed.
 */
export declare function updateHumanPlayerState(player: Player, input: PlayerInput, velocity: PlayerVelocity, isOnRoad: boolean, dt: number): void;
export {};
//# sourceMappingURL=playerController.d.ts.map