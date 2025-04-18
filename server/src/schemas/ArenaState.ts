import { Schema, MapSchema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") name: string = "Guest"; // Default name
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") heading: number = 0; // Radians
  @type("string") team: string = "none"; // 'red' or 'blue' eventually
  // Add other player-specific state later (e.g., score, hasPickup)
}

export class ArenaState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();

  // Add other global state later (e.g., pickups, bases, timer, scores)
}
