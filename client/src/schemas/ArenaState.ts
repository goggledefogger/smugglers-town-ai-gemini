// TEMPORARY DUPLICATION - Ideally use a shared package or monorepo
import { Schema, MapSchema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") name: string = "Guest";
  @type("number") x: number = 0; // Meters relative to origin
  @type("number") y: number = 0; // Meters relative to origin (+Y = North)
  @type("number") heading: number = 0; // Radians (0 = East)
  @type("string") team: string = "none";
}

export class ArenaState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}
