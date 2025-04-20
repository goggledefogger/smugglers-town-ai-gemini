import { Schema, MapSchema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") name: string = "Guest"; // Default name
  @type("number") x: number = 0; // Meters relative to origin
  @type("number") y: number = 0; // Meters relative to origin (+Y = North)
  @type("number") heading: number = 0; // Radians (0 = East)
  @type("string") team: string = "none"; // 'red' or 'blue' eventually
  // Add other player-specific state later (e.g., score, hasPickup)
}

// Schema for a single flag
export class FlagState extends Schema {
  @type("string") team: string = ""; // 'Red' or 'Blue' - which team this flag belongs to
  @type("string") status: string = "atBase"; // "atBase", "carried", "dropped"
  @type("number") x: number = 0; // Position in meters (when at base or dropped)
  @type("number") y: number = 0;
  @type("string") carrierId: string | null = null; // SessionId of player carrying it, or null
}

export class ArenaState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();

  // Add game state fields
  @type("number") redScore: number = 0;
  @type("number") blueScore: number = 0;

  // Flags
  @type(FlagState) redFlag = new FlagState();
  @type(FlagState) blueFlag = new FlagState();

  // Add more state later: bases, game timer, etc.
}
