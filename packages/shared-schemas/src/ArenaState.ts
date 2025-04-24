import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") name: string = "Guest"; // Default name
  @type("number") x: number = 0; // Meters relative to origin
  @type("number") y: number = 0; // Meters relative to origin (+Y = North)
  @type("number") heading: number = 0; // Radians (0 = East)
  @type("number") vx: number = 0; // Velocity x component (meters/second)
  @type("number") vy: number = 0; // Velocity y component (meters/second)
  @type("string") team: "Red" | "Blue" | "none" = "none"; // Use literal types
  @type("boolean") justReset: boolean = false; // Flag for water reset notification
  @type("boolean") isOnRoad: boolean = false; // Flag for if player is currently on a road (updated by server)
  // Add other player-specific state later (e.g., score, hasPickup)
}

// Schema for a single flag
export class FlagState extends Schema {
  @type("string") id: string = ""; // Unique ID for each item
  @type("string") status: 'available' | 'dropped' | 'carried' | 'scored' = 'available'; // Added 'scored', changed default
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") carrierId: string | null = null;
  @type("number") lastStealTimestamp: number = 0; // Added for steal cooldown
}

export class ArenaState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();

  // Add game state fields
  @type("number") redScore: number = 0;
  @type("number") blueScore: number = 0;
  @type("number") gameTimeRemaining: number = 300; // e.g., 5 minutes = 300 seconds

  // Multiple items
  @type([ FlagState ]) items = new ArraySchema<FlagState>();

  // Add base radius for rendering
  @type("number") baseRadius: number = 10; // Default value, server will override

  // Add more state later: bases, game timer, etc.
}
