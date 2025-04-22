/**
 * aiController.ts
 *
 * Logic for updating AI player state (targeting and movement).
 */
import { ArenaState, Player } from "@smugglers-town/shared-schemas";
type PlayerVelocity = {
    vx: number;
    vy: number;
};
/**
 * Updates an AI player's position and heading based on game state.
 * Determines target, calculates velocity, and applies movement.
 * Modifies the player state and velocity object directly.
 */
export declare function updateAIState(aiPlayer: Player, sessionId: string, velocity: PlayerVelocity, state: ArenaState, isOnRoad: boolean, dt: number): void;
export {};
//# sourceMappingURL=aiController.d.ts.map