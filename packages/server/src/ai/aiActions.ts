import { ArenaState, Player, FlagState } from "@smugglers-town/shared-schemas";
import { AIState } from "./types";
// Import directly from the package root
import { distSq, RED_BASE_POS, BLUE_BASE_POS } from "@smugglers-town/shared-utils";

// Helper type for target coordinates
type TargetCoordinates = { x: number; y: number };

/**
 * Finds the closest available item to the player.
 * @param player The AI player state.
 * @param state The overall game state.
 * @returns TargetCoordinates of the closest item, or null if none available.
 */
export function getSeekItemTarget(player: Player, state: ArenaState): TargetCoordinates | null {
  let closestItem: FlagState | null = null;
  let minDistanceSq = Infinity;

  for (const item of state.items) {
    if (!item.carrierId && item.status !== 'scored') {
      const distanceSq = distSq(player.x, player.y, item.x, item.y);
      if (distanceSq < minDistanceSq) {
        minDistanceSq = distanceSq;
        closestItem = item;
      }
    }
  }

  return closestItem ? { x: closestItem.x, y: closestItem.y } : null;
}

/**
 * Finds the position of the opponent carrying an item.
 * @param player The AI player state.
 * @param state The overall game state.
 * @returns TargetCoordinates of the opponent carrier, or null if none.
 */
export function getPursueCarrierTarget(player: Player, state: ArenaState): TargetCoordinates | null {
  for (const item of state.items) {
    if (item.carrierId) {
      const carrier = state.players.get(item.carrierId);
      if (carrier && carrier.team !== player.team) {
        return { x: carrier.x, y: carrier.y };
      }
    }
  }
  return null;
}

/**
 * Gets the coordinates of the player's own base.
 * @param player The AI player state.
 * @param state The overall game state.
 * @returns TargetCoordinates of the base.
 */
export function getReturnToBaseTarget(player: Player, state: ArenaState): TargetCoordinates | null {
  // Use the imported base positions constants
  if (player.team === 'Red') {
      return RED_BASE_POS;
  } else if (player.team === 'Blue') {
      return BLUE_BASE_POS;
  }
  // Should not happen for AI with a team, but return null as fallback
  console.error(`AI ${player.name} in RETURN_TO_BASE state has no team?`);
  return null;
}

/**
 * Calculates an intercept point ahead of the opponent carrier.
 * @param player The AI player state.
 * @param state The overall game state.
 * @returns TargetCoordinates for interception, or null.
 */
export function getInterceptTarget(player: Player, state: ArenaState): TargetCoordinates | null {
  // TODO: Implement intercept logic (e.g., predict carrier path)
  // Fallback to simple pursuit for now
  console.warn("Intercept target requested, falling back to pursue target.");
  return getPursueCarrierTarget(player, state);
}

/**
 * Gets the position of the teammate carrying an item (for escorting).
 * @param player The AI player state.
 * @param state The overall game state.
 * @returns TargetCoordinates of the teammate carrier, or null.
 */
export function getDefendTarget(player: Player, state: ArenaState): TargetCoordinates | null {
  for (const item of state.items) {
    if (item.carrierId) {
      const carrier = state.players.get(item.carrierId);
      // Find the teammate carrier
      if (carrier && carrier.team === player.team) {
        // TODO: Add logic to position defensively (e.g., slightly behind/beside)
        // For now, just target their exact position.
        return { x: carrier.x, y: carrier.y };
      }
    }
  }
  return null; // No teammate carrier found
}
