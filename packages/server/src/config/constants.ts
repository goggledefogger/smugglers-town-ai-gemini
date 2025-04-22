/**
 * constants.ts
 *
 * Game constants for physics, game logic, world positions, etc.
 */

// Constants for server-side physics (world units = meters)
// REMOVE THESE -> Likely incorrect values being used
// export const MAX_SPEED_WORLD = 200; // m/s (~720 kph / 450 mph)
// export const ACCEL_RATE_WORLD = 15; // Factor per second - Reduced for smooth lerp!
// export const TURN_SMOOTH_WORLD = 12; // Factor per second
// export const DRAG_FACTOR = 0.1; // Coefficient for linear drag (higher = more drag)

// Player movement physics constants (ensure these are used)
export const MAX_SPEED = 30; // meters per second (Increased from 15)
export const ACCELERATION = 300; // meters per second^2 (Increased from 100 for testing lerp effect)
export const FRICTION_FACTOR = 0.75; // Multiplier per second (Lower = More friction, less drift. Was 0.90)
export const TURN_SPEED = Math.PI * 3.0; // radians per second (Increased from 1.5 * PI)

// Player dimensions for collision checks
export const PLAYER_EFFECTIVE_RADIUS = 1.5; // meters (distance from center to edge/front for checks)

// Gameplay Constants
export const ROAD_SPEED_MULTIPLIER = 3; // Speed on roads is half of base speed (Was 5.0)
export const NUM_ITEMS = 4; // Number of items to spawn each round

// Collision / Gameplay Radii (Squared for cheaper checks)
export const PLAYER_COLLISION_RADIUS_SQ = PLAYER_EFFECTIVE_RADIUS * PLAYER_EFFECTIVE_RADIUS; // meters^2 (Used for stealing check)
export const PICKUP_RADIUS_SQ = 4 * 4; // meters^2 (Keep this larger for easier pickup)
export const BASE_RADIUS_SQ = 30 * 30; // meters^2 (Should match client VISUAL_BASE_RADIUS^2)
export const STEAL_COOLDOWN_MS = 500; // milliseconds (Reduced for responsiveness)

// Spawn Area
export const ITEM_SPAWN_RADIUS = 50; // meters - Radius around origin for item spawns
export const PLAYER_SPAWN_RADIUS = 10; // meters - Radius around origin for player spawns

// Base Positions (Meters from Origin)
// export const BASE_DISTANCE = 80; // MOVED TO SHARED-UTILS
// export const Y_OFFSET = 0; // MOVED TO SHARED-UTILS
// export const RED_BASE_POS = { x: -BASE_DISTANCE, y: Y_OFFSET }; // MOVED TO SHARED-UTILS
// export const BLUE_BASE_POS = { x: BASE_DISTANCE, y: -Y_OFFSET }; // MOVED TO SHARED-UTILS

// Item Start Position
export const ITEM_START_POS = { x: 0, y: 0 };

// Example Water Hazard Zone (Meters from Origin)
export const WATER_ZONE = { minX: -600, minY: -200, maxX: -500, maxY: 200 };

// AI Configuration (Assuming these were intended from the previous structure)
export const AI_SPEED_MULTIPLIER = 0.9; // AI max speed is 90% of human
export const AI_ACCEL_MULTIPLIER = 0.85; // AI acceleration is 85% of human
