"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArenaState = exports.FlagState = exports.Player = void 0;
const schema_1 = require("@colyseus/schema");
class Player extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.name = "Guest"; // Default name
        this.x = 0; // Meters relative to origin
        this.y = 0; // Meters relative to origin (+Y = North)
        this.heading = 0; // Radians (0 = East)
        this.team = "none"; // Use literal types
        this.justReset = false; // Flag for water reset notification
        // Add other player-specific state later (e.g., score, hasPickup)
    }
}
exports.Player = Player;
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], Player.prototype, "name", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], Player.prototype, "x", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], Player.prototype, "y", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], Player.prototype, "heading", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], Player.prototype, "team", void 0);
__decorate([
    (0, schema_1.type)("boolean"),
    __metadata("design:type", Boolean)
], Player.prototype, "justReset", void 0);
// Schema for a single flag
class FlagState extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.id = ""; // Unique ID for each item
        this.status = 'available'; // Added 'scored', changed default
        this.x = 0;
        this.y = 0;
        this.carrierId = null;
        this.lastStealTimestamp = 0; // Added for steal cooldown
    }
}
exports.FlagState = FlagState;
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], FlagState.prototype, "id", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], FlagState.prototype, "status", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], FlagState.prototype, "x", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], FlagState.prototype, "y", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", Object)
], FlagState.prototype, "carrierId", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], FlagState.prototype, "lastStealTimestamp", void 0);
class ArenaState extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.players = new schema_1.MapSchema();
        // Add game state fields
        this.redScore = 0;
        this.blueScore = 0;
        this.gameTimeRemaining = 300; // e.g., 5 minutes = 300 seconds
        // Multiple items
        this.items = new schema_1.ArraySchema();
        // Add more state later: bases, game timer, etc.
    }
}
exports.ArenaState = ArenaState;
__decorate([
    (0, schema_1.type)({ map: Player }),
    __metadata("design:type", Object)
], ArenaState.prototype, "players", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], ArenaState.prototype, "redScore", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], ArenaState.prototype, "blueScore", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], ArenaState.prototype, "gameTimeRemaining", void 0);
__decorate([
    (0, schema_1.type)([FlagState]),
    __metadata("design:type", Object)
], ArenaState.prototype, "items", void 0);
//# sourceMappingURL=ArenaState.js.map