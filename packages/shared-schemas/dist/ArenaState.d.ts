import { Schema, MapSchema, ArraySchema } from "@colyseus/schema";
export declare class Player extends Schema {
    name: string;
    x: number;
    y: number;
    heading: number;
    team: "Red" | "Blue" | "none";
    justReset: boolean;
}
export declare class FlagState extends Schema {
    id: string;
    status: 'available' | 'dropped' | 'carried' | 'scored';
    x: number;
    y: number;
    carrierId: string | null;
    lastStealTimestamp: number;
}
export declare class ArenaState extends Schema {
    players: MapSchema<Player, string>;
    redScore: number;
    blueScore: number;
    gameTimeRemaining: number;
    items: ArraySchema<FlagState>;
}
