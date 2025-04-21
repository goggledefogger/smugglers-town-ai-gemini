/**
 * constants.ts
 *
 * Game constants for physics, game logic, world positions, etc.
 */

// Constants for server-side physics (world units = meters)
export const MAX_SPEED_WORLD = 200; // m/s (~720 kph / 450 mph)
export const ACCEL_RATE_WORLD = 15; // Factor per second - Reduced for smooth lerp!
export const TURN_SMOOTH_WORLD = 12; // Factor per second
export const DRAG_FACTOR = 0.1; // Coefficient for linear drag (higher = more drag)

// Player movement
export const MAX_SPEED = 15; // meters per second
export const ACCELERATION = 50; // meters per second^2
export const FRICTION_FACTOR = 0.90; // Multiplier per second
export const TURN_SPEED = Math.PI * 1.5; // radians per second

// Collision / Gameplay Radii (Squared for cheaper checks)
export const PLAYER_COLLISION_RADIUS_SQ = 1.5 * 1.5; // meters^2 (Used for stealing check)
export const PICKUP_RADIUS_SQ = 4 * 4; // meters^2
export const BASE_RADIUS_SQ = 10 * 10; // meters^2
export const STEAL_COOLDOWN_MS = 1500; // milliseconds

// Spawn Area
export const SPAWN_RADIUS = 10; // meters

// Base Positions (Meters from Origin)
export const BASE_DISTANCE = 80; // meters
export const Y_OFFSET = 0; // Keep bases horizontally aligned for simplicity
export const RED_BASE_POS = { x: -BASE_DISTANCE, y: Y_OFFSET };
export const BLUE_BASE_POS = { x: BASE_DISTANCE, y: -Y_OFFSET };

// Item Start Position
export const ITEM_START_POS = { x: 0, y: 0 };

// Example Water Hazard Zone (Meters from Origin)
export const WATER_ZONE = { minX: -600, minY: -200, maxX: -500, maxY: 200 };

// AI Configuration (Assuming these were intended from the previous structure)
export const AI_SPEED_MULTIPLIER = 0.9; // AI max speed is 90% of human
export const AI_ACCEL_MULTIPLIER = 0.85; // AI acceleration is 85% of human
