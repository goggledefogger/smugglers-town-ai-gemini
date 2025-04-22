// TEMPORARY DUPLICATION - Ideally use a shared package or monorepo
import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") name: string = "Guest"; // Default name
  @type("number") x: number = 0; // Meters relative to origin
  @type("number") y: number = 0; // Meters relative to origin (+Y = North)
  @type("number") heading: number = 0; // Radians (0 = East)
  @type("string") team: string = "none"; // 'red' or 'blue' eventually
  @type("boolean") justReset: boolean = false; // Flag for water reset notification (Mirrors server)
}

// Schema for a single flag (match server)
export class FlagState extends Schema {
  @type("string") id: string = ""; // Unique ID for each item
  @type("string") status: 'available' | 'dropped' | 'carried' | 'scored' = 'available'; // Added 'scored', changed default
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") carrierId: string | null = null; // Session ID of player carrying
  @type("number") lastStealTimestamp: number = 0; // Server time (ms) of last steal
}

// Simple schema for rectangular zones (Mirrors server) -- REMOVE THIS
// export class ZoneState extends Schema {
//   @type("number") minX: number = 0;
//   @type("number") minY: number = 0;
//   @type("number") maxX: number = 0;
//   @type("number") maxY: number = 0;
// }

export class ArenaState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();

  @type("number") redScore: number = 0;
  @type("number") blueScore: number = 0;

  @type("number") gameTimeRemaining: number = 300; // Must match server default

  // Match server: Multiple items
  @type([ FlagState ]) items = new ArraySchema<FlagState>();

  // @type(ZoneState) waterZone = new ZoneState(); // <-- REMOVE THIS LINE

  // @type(FlagState) flagA = new FlagState(); // REMOVED
  // @type(FlagState) flagB = new FlagState(); // REMOVED
}
