import { Schema, MapSchema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") name: string = "Guest"; // Default name
  @type("number") x: number = 0; // Meters relative to origin
  @type("number") y: number = 0; // Meters relative to origin (+Y = North)
  @type("number") heading: number = 0; // Radians (0 = East)
  @type("string") team: "Red" | "Blue" | "none" = "none"; // Use literal types
  // Add other player-specific state later (e.g., score, hasPickup)
}

// Schema for a single flag
export class FlagState extends Schema {
  @type("string") status: "atBase" | "carried" | "dropped" = "atBase";
  @type("number") x: number = NaN; // Meters (NaN when carried)
  @type("number") y: number = NaN; // Meters (NaN when carried)
  @type("string") carrierId: string | null = null; // Session ID of player carrying
  @type("number") lastStealTimestamp: number = 0; // Server time (ms) of last steal
}

export class ArenaState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();

  // Add game state fields
  @type("number") redScore: number = 0;
  @type("number") blueScore: number = 0;

  // Single generic item instead of two flags
  @type(FlagState) item = new FlagState(); // Represents the single pickup item

  // Add more state later: bases, game timer, etc.
}
