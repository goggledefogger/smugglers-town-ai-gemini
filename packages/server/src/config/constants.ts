/**
 * constants.ts
 *
 * Game constants for physics, game logic, world positions, etc.
 */

// Player movement physics constants (ensure these are used)
export const BASE_MAX_SPEED = 200; // meters per second (Base value @ REFERENCE_ZOOM) - Increased from 150
export const BASE_ACCELERATION = 800; // meters per second^2 (Base value @ REFERENCE_ZOOM) - Increased from 600
export const FRICTION_FACTOR = 0.15; // friction factor (lower = more friction) - Increased from 0.08 for less drift
export const TURN_SPEED = 2.5 * Math.PI; // radians per second (Increased from 1.5 * PI)

// Player dimensions for collision checks - MOVED TO SHARED-UTILS
// export const PLAYER_EFFECTIVE_RADIUS = 2.5; // Example radius in meters

// Gameplay Constants
export const ROAD_SPEED_MULTIPLIER = 2.5; // Speed on roads multiplier (Adjusted from 3 to keep road speed ~60)

// Collision / Gameplay Radii (Squared for cheaper checks)
// export const PLAYER_COLLISION_RADIUS_SQ = PLAYER_EFFECTIVE_RADIUS * PLAYER_EFFECTIVE_RADIUS; // meters^2 (Used for stealing check) - MOVED TO SHARED-UTILS
export const BASE_PICKUP_RADIUS = 5.0; // meters (Base radius @ REFERENCE_ZOOM)
export const PICKUP_RADIUS_SQ = BASE_PICKUP_RADIUS * BASE_PICKUP_RADIUS; // *NOTE: This calculation is now potentially misleading - will be recalculated on server*
export const BASE_RADIUS_SQ = 30 * 30; // meters^2 - Keeping base scoring radius fixed for now
export const STEAL_COOLDOWN_MS = 3000; // 3 seconds cooldown before an item can be stolen again

// Spawn Area
export const ITEM_SPAWN_RADIUS = 250; // meters - Radius around origin for item spawns (Increased from 150)
export const PLAYER_SPAWN_RADIUS = 50; // meters from world origin (Adjusted)

// Base Positions (Meters from Origin) - MOVED TO SHARED-UTILS

// Item Start Position
export const ITEM_START_POS = { x: 0, y: 0 };

// Example Water Hazard Zone (Meters from Origin)
export const WATER_ZONE = { minX: -600, minY: -200, maxX: -500, maxY: 200 };

// AI Configuration (Assuming these were intended from the previous structure)
export const AI_SPEED_MULTIPLIER = 0.9; // AI max speed is 90% of human (Applies to BASE speed)
export const AI_ACCEL_MULTIPLIER = 0.85; // AI acceleration is 85% of human (Applies to BASE accel)

export const BASE_PHYSICS_IMPULSE_MAGNITUDE = 50; // Base impulse strength @ REFERENCE_ZOOM

// Reference Zoom Level for scaling calculations
export const REFERENCE_ZOOM = 18;
