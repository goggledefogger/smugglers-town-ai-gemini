import { ArenaState, Player, FlagState } from "@smugglers-town/shared-schemas";
import { distSq } from "@smugglers-town/shared-utils";
import { MAX_SPEED, AI_SPEED_MULTIPLIER } from "../config/constants";

// Helper type for target coordinates
type TargetCoordinates = { x: number; y: number };

const INTERCEPT_MAX_LEAD_S = 2;
const ESCORT_OFFSET_M = 15;

/**
 * Finds the closest available item to the player.
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
 * Finds the opponent currently carrying an item.
 */
export function getOpponentCarrier(player: Player, state: ArenaState): Player | null {
  for (const item of state.items) {
    if (item.carrierId) {
      const carrier = state.players.get(item.carrierId);
      if (carrier && carrier.team !== player.team) {
        return carrier;
      }
    }
  }
  return null;
}

/**
 * Position of the opponent carrying an item (plain pursuit).
 */
export function getPursueCarrierTarget(player: Player, state: ArenaState): TargetCoordinates | null {
  const carrier = getOpponentCarrier(player, state);
  return carrier ? { x: carrier.x, y: carrier.y } : null;
}

/**
 * The player's own base (server-computed, accessible position from state).
 */
export function getReturnToBaseTarget(player: Player, state: ArenaState): TargetCoordinates | null {
  if (player.team === 'Red') {
    return { x: state.redBaseX, y: state.redBaseY };
  } else if (player.team === 'Blue') {
    return { x: state.blueBaseX, y: state.blueBaseY };
  }
  console.error(`AI ${player.name} in RETURN_TO_BASE state has no team?`);
  return null;
}

/**
 * Lead-pursuit point ahead of a distant opponent carrier: their position
 * projected along their current velocity by up to INTERCEPT_MAX_LEAD_S.
 */
export function getInterceptTarget(player: Player, state: ArenaState): TargetCoordinates | null {
  const carrier = getOpponentCarrier(player, state);
  if (!carrier) return null;
  const dist = Math.sqrt(distSq(player.x, player.y, carrier.x, carrier.y));
  const leadTime = Math.min(dist / (MAX_SPEED * AI_SPEED_MULTIPLIER), INTERCEPT_MAX_LEAD_S);
  return {
    x: carrier.x + carrier.vx * leadTime,
    y: carrier.y + carrier.vy * leadTime,
  };
}

/**
 * Escort point for a teammate carrier: ESCORT_OFFSET_M from them toward the
 * nearest opponent, body-blocking the likely tackle. Falls back to the
 * carrier's position when no opponent exists.
 */
export function getDefendTarget(player: Player, state: ArenaState): TargetCoordinates | null {
  let teammateCarrier: Player | null = null;
  for (const item of state.items) {
    if (item.carrierId && item.carrierId !== undefined) {
      const carrier = state.players.get(item.carrierId);
      if (carrier && carrier.team === player.team && carrier !== player) {
        teammateCarrier = carrier;
        break;
      }
    }
  }
  if (!teammateCarrier) return null;

  let nearestOpponent: Player | null = null;
  let minDSq = Infinity;
  state.players.forEach(p => {
    if (p.team !== player.team) {
      const dSq = distSq(teammateCarrier!.x, teammateCarrier!.y, p.x, p.y);
      if (dSq < minDSq) { minDSq = dSq; nearestOpponent = p; }
    }
  });
  if (!nearestOpponent) return { x: teammateCarrier.x, y: teammateCarrier.y };

  const threat: Player = nearestOpponent;
  const dx = threat.x - teammateCarrier.x;
  const dy = threat.y - teammateCarrier.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return { x: teammateCarrier.x, y: teammateCarrier.y };
  return {
    x: teammateCarrier.x + (dx / dist) * ESCORT_OFFSET_M,
    y: teammateCarrier.y + (dy / dist) * ESCORT_OFFSET_M,
  };
}
