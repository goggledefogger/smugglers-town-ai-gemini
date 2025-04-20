// TEMPORARY DUPLICATION - Ideally use a shared package or monorepo
import { Schema, MapSchema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") name: string = "Guest"; // Default name
  @type("number") x: number = 0; // Meters relative to origin
  @type("number") y: number = 0; // Meters relative to origin (+Y = North)
  @type("number") heading: number = 0; // Radians (0 = East)
  @type("string") team: string = "none"; // 'red' or 'blue' eventually
}

// Schema for a single flag (match server)
export class FlagState extends Schema {
  // @type("string") team: string = ""; // REMOVED
  @type("string") status: "atBase" | "carried" | "dropped" = "atBase";
  @type("number") x: number = NaN; // Meters (NaN when carried)
  @type("number") y: number = NaN; // Meters (NaN when carried)
  @type("string") carrierId: string | null = null; // Session ID of player carrying
}

export class ArenaState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();

  @type("number") redScore: number = 0;
  @type("number") blueScore: number = 0;

  // Match server: Single generic item
  @type(FlagState) item = new FlagState(); // Represents the single pickup item
  // @type(FlagState) flagA = new FlagState(); // REMOVED
  // @type(FlagState) flagB = new FlagState(); // REMOVED
}
