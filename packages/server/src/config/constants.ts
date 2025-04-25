/**
 * constants.ts
 *
 * Game constants for physics, game logic, world positions, etc.
 */

// Player movement physics constants (ensure these are used)
export const MAX_SPEED = 50; // meters per second
export const ACCELERATION = 200; // meters per second^2 (Adjusted middle ground)
export const FRICTION_FACTOR = 0.70; // Multiplier per second (Reduced from 0.75 to decrease drift)
export const TURN_SPEED = Math.PI * 3.0; // radians per second (Increased from 1.5 * PI)

// Player dimensions for collision checks - MOVED TO SHARED-UTILS
// export const PLAYER_EFFECTIVE_RADIUS = 2.5; // Example radius in meters

// Gameplay Constants
export const ROAD_SPEED_MULTIPLIER = 2.5; // Speed on roads multiplier (Adjusted from 3 to keep road speed ~60)

// Collision / Gameplay Radii (Squared for cheaper checks)
// export const PLAYER_COLLISION_RADIUS_SQ = PLAYER_EFFECTIVE_RADIUS * PLAYER_EFFECTIVE_RADIUS; // meters^2 (Used for stealing check) - MOVED TO SHARED-UTILS
export const PICKUP_RADIUS_SQ = 4 * 4; // meters^2 (Keep this larger for easier pickup)
export const BASE_RADIUS_SQ = 30 * 30; // meters^2 (Should match client VISUAL_BASE_RADIUS^2)
export const STEAL_COOLDOWN_MS = 500; // 0.5 seconds

// Spawn Area
export const ITEM_SPAWN_RADIUS = 250; // meters - Radius around origin for item spawns (Increased from 150)
export const PLAYER_SPAWN_RADIUS = 10; // meters - Radius around origin for player spawns

// Base Positions (Meters from Origin) - MOVED TO SHARED-UTILS

// Item Start Position
export const ITEM_START_POS = { x: 0, y: 0 };

// Example Water Hazard Zone (Meters from Origin)
export const WATER_ZONE = { minX: -600, minY: -200, maxX: -500, maxY: 200 };

// AI Configuration (Assuming these were intended from the previous structure)
export const AI_SPEED_MULTIPLIER = 0.9; // AI max speed is 90% of human
export const AI_ACCEL_MULTIPLIER = 0.85; // AI acceleration is 85% of human

export const PHYSICS_IMPULSE_MAGNITUDE = 10; // Adjust this value! Impulse strength.
