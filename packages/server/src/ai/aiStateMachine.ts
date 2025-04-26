import { ArenaState, Player, FlagState } from "@smugglers-town/shared-schemas";
import { AIState } from "./types";
import { distSq } from "@smugglers-town/shared-utils"; // Ensure distSq is imported correctly

/**
 * Determines the appropriate AI state based on the current game situation.
 * Simple Priority Order:
 * 1. Have item -> Return to Base
 * 2. Opponent has item -> Pursue/Intercept
 * 3. Item available -> Seek closest Item
 * 4. Otherwise -> Return to Base (Wait/Defend implicitly)
 *
 * @param playerId The sessionId of the AI player.
 * @param player The AI player's current state.
 * @param state The overall game state.
 * @returns The calculated AIState for the player.
 */
export function determineAIState(playerId: string, player: Player, state: ArenaState): AIState {

  // 1. Check if AI is carrying an item
  let carriedBySelf = false;
  for (const item of state.items) {
    if (item.carrierId === playerId) {
      carriedBySelf = true;
      break;
    }
  }
  if (carriedBySelf) {
    return AIState.RETURNING_TO_BASE;
  }

  // 2. Check if an opponent is carrying an item
  let opponentCarrierFound = false;
  for (const item of state.items) {
    if (item.carrierId) { // Item is carried
      const carrier = state.players.get(item.carrierId);
      // Check if carrier exists and is on the opposing team
      if (carrier && carrier.team !== player.team) {
        opponentCarrierFound = true;
        break;
      }
    }
  }
  if (opponentCarrierFound) {
    // TODO: Could add INTERCEPTING logic here later
    return AIState.PURSUING_CARRIER;
  }

  // 3. Check if any item is available
  let availableItemExists = false;
  for (const item of state.items) {
    // Item is available if not carried and not already scored
    if (!item.carrierId && item.status !== 'scored') {
      availableItemExists = true;
      break;
    }
  }
  if (availableItemExists) {
    return AIState.SEEKING_ITEM;
  }

  // 4. Fallback: No opponent has item, no items available.
  //    This includes the case where a teammate has the only item.
  //    Go towards own base to wait / defend implicitly.
  return AIState.RETURNING_TO_BASE;
}
