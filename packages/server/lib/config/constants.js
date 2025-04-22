"use strict";
/**
 * constants.ts
 *
 * Game constants for physics, game logic, world positions, etc.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AI_ACCEL_MULTIPLIER = exports.AI_SPEED_MULTIPLIER = exports.WATER_ZONE = exports.ITEM_START_POS = exports.PLAYER_SPAWN_RADIUS = exports.ITEM_SPAWN_RADIUS = exports.STEAL_COOLDOWN_MS = exports.BASE_RADIUS_SQ = exports.PICKUP_RADIUS_SQ = exports.PLAYER_COLLISION_RADIUS_SQ = exports.NUM_ITEMS = exports.ROAD_SPEED_MULTIPLIER = exports.PLAYER_EFFECTIVE_RADIUS = exports.TURN_SPEED = exports.FRICTION_FACTOR = exports.ACCELERATION = exports.MAX_SPEED = void 0;
// Constants for server-side physics (world units = meters)
// REMOVE THESE -> Likely incorrect values being used
// export const MAX_SPEED_WORLD = 200; // m/s (~720 kph / 450 mph)
// export const ACCEL_RATE_WORLD = 15; // Factor per second - Reduced for smooth lerp!
// export const TURN_SMOOTH_WORLD = 12; // Factor per second
// export const DRAG_FACTOR = 0.1; // Coefficient for linear drag (higher = more drag)
// Player movement physics constants (ensure these are used)
exports.MAX_SPEED = 30; // meters per second (Increased from 15)
exports.ACCELERATION = 300; // meters per second^2 (Increased from 100 for testing lerp effect)
exports.FRICTION_FACTOR = 0.75; // Multiplier per second (Lower = More friction, less drift. Was 0.90)
exports.TURN_SPEED = Math.PI * 3.0; // radians per second (Increased from 1.5 * PI)
// Player dimensions for collision checks
exports.PLAYER_EFFECTIVE_RADIUS = 1.5; // meters (distance from center to edge/front for checks)
// Gameplay Constants
exports.ROAD_SPEED_MULTIPLIER = 3; // Speed on roads is half of base speed (Was 5.0)
exports.NUM_ITEMS = 4; // Number of items to spawn each round
// Collision / Gameplay Radii (Squared for cheaper checks)
exports.PLAYER_COLLISION_RADIUS_SQ = exports.PLAYER_EFFECTIVE_RADIUS * exports.PLAYER_EFFECTIVE_RADIUS; // meters^2 (Used for stealing check)
exports.PICKUP_RADIUS_SQ = 4 * 4; // meters^2 (Keep this larger for easier pickup)
exports.BASE_RADIUS_SQ = 30 * 30; // meters^2 (Should match client VISUAL_BASE_RADIUS^2)
exports.STEAL_COOLDOWN_MS = 500; // milliseconds (Reduced for responsiveness)
// Spawn Area
exports.ITEM_SPAWN_RADIUS = 50; // meters - Radius around origin for item spawns
exports.PLAYER_SPAWN_RADIUS = 10; // meters - Radius around origin for player spawns
// Base Positions (Meters from Origin)
// export const BASE_DISTANCE = 80; // MOVED TO SHARED-UTILS
// export const Y_OFFSET = 0; // MOVED TO SHARED-UTILS
// export const RED_BASE_POS = { x: -BASE_DISTANCE, y: Y_OFFSET }; // MOVED TO SHARED-UTILS
// export const BLUE_BASE_POS = { x: BASE_DISTANCE, y: -Y_OFFSET }; // MOVED TO SHARED-UTILS
// Item Start Position
exports.ITEM_START_POS = { x: 0, y: 0 };
// Example Water Hazard Zone (Meters from Origin)
exports.WATER_ZONE = { minX: -600, minY: -200, maxX: -500, maxY: 200 };
// AI Configuration (Assuming these were intended from the previous structure)
exports.AI_SPEED_MULTIPLIER = 0.9; // AI max speed is 90% of human
exports.AI_ACCEL_MULTIPLIER = 0.85; // AI acceleration is 85% of human
//# sourceMappingURL=constants.js.map