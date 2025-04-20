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

// AI Movement Modifiers
export const AI_SPEED_MULTIPLIER = 0.9; // AI max speed is 90% of human
export const AI_ACCEL_MULTIPLIER = 0.85; // AI acceleration is 85% of human

// Game Logic Constants
export const PICKUP_RADIUS = 30; // Meters (Increased)
export const PICKUP_RADIUS_SQ = PICKUP_RADIUS * PICKUP_RADIUS; // Use squared distance for efficiency
export const PLAYER_COLLISION_RADIUS = 25; // Meters (for stealing)
export const PLAYER_COLLISION_RADIUS_SQ = PLAYER_COLLISION_RADIUS * PLAYER_COLLISION_RADIUS;
export const BASE_RADIUS = 40; // Meters (for scoring)
export const BASE_RADIUS_SQ = BASE_RADIUS * BASE_RADIUS;
export const SPAWN_RADIUS = 10; // Max distance from origin (0,0) for player spawn
export const STEAL_COOLDOWN_MS = 1500; // Cooldown in milliseconds after a steal (Increased from 500)

// World Positions
export const BASE_DISTANCE = 150; // Meters from origin along X axis
export const Y_OFFSET = 5; // Small vertical offset from center line
export const ITEM_START_POS = { x: 0, y: 0 }; // Place item at the origin
export const RED_BASE_POS = { x: -BASE_DISTANCE, y: Y_OFFSET };
export const BLUE_BASE_POS = { x: BASE_DISTANCE, y: -Y_OFFSET };
