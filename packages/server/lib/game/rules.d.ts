/**
 * rules.ts
 *
 * Core game rule logic (item pickup, scoring, stealing).
 */
import { ArenaState } from "@smugglers-town/shared-schemas";
/**
 * Checks for item pickups by any player.
 * Modifies the item state if a pickup occurs.
 */
export declare function checkItemPickup(state: ArenaState, playerIds: string[]): void;
/**
 * Checks for scoring by any player carrying the item.
 * Modifies score and item state if scoring occurs.
 */
export declare function checkScoring(state: ArenaState, playerIds: string[]): void;
/**
 * Data structure for returning debug info from checkStealing
 */
interface StealCheckDebugData {
    carrierId: string;
    carrierX: number;
    carrierY: number;
    stealerId: string;
    stealerX: number;
    stealerY: number;
}
/**
 * Checks for item stealing between opposing players.
 * Modifies the item state if a steal occurs.
 * @returns StealCheckDebugData | null - Returns position data if a distance check was performed, null otherwise.
 */
export declare function checkStealing(state: ArenaState, playerIds: string[], currentTime: number): StealCheckDebugData | null;
/**
 * Updates the visual position of the item if it's carried.
 */
export declare function updateCarriedItemPosition(state: ArenaState): void;
export {};
//# sourceMappingURL=rules.d.ts.map