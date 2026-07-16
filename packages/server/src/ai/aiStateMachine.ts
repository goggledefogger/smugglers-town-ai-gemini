import { ArenaState, Player } from "@smugglers-town/shared-schemas";
import { AIState } from "./types";
import { distSq } from "@smugglers-town/shared-utils";
import { getOpponentCarrier } from "./aiActions";

// Beyond this distance, pursue with a velocity lead (INTERCEPTING);
// closer in, plain chase reacts faster.
const INTERCEPT_MIN_DIST_SQ = 50 * 50;

/**
 * Determines the appropriate AI state based on the current game situation.
 * Priority order:
 * 1. Have item -> Return to Base
 * 2. Opponent has item -> Intercept (far) / Pursue (near)
 * 3. Item available -> Seek closest Item
 * 4. Teammate has item -> Defend (escort)
 * 5. Otherwise -> Return to Base
 */
export function determineAIState(playerId: string, player: Player, state: ArenaState): AIState {

  // 1. Check if AI is carrying an item
  for (const item of state.items) {
    if (item.carrierId === playerId) {
      return AIState.RETURNING_TO_BASE;
    }
  }

  // 2. Check if an opponent is carrying an item
  const opponentCarrier = getOpponentCarrier(player, state);
  if (opponentCarrier) {
    const dSq = distSq(player.x, player.y, opponentCarrier.x, opponentCarrier.y);
    return dSq > INTERCEPT_MIN_DIST_SQ ? AIState.INTERCEPTING : AIState.PURSUING_CARRIER;
  }

  // 3. Check if any item is available
  for (const item of state.items) {
    if (!item.carrierId && item.status !== 'scored') {
      return AIState.SEEKING_ITEM;
    }
  }

  // 4. A teammate holds the only item(s): escort them.
  for (const item of state.items) {
    if (item.carrierId) {
      const carrier = state.players.get(item.carrierId);
      if (carrier && carrier.team === player.team) {
        return AIState.DEFENDING;
      }
    }
  }

  // 5. Fallback: wait near own base.
  return AIState.RETURNING_TO_BASE;
}
