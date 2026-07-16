/**
 * constants.ts
 *
 * Game constants for physics, game logic, world positions, etc.
 */

// Player movement physics constants
export const MAX_SPEED = 50; // meters per second
export const ACCELERATION = 200; // meters per second^2
export const FRICTION_FACTOR = 0.60; // Multiplier per second
export const TURN_SPEED = Math.PI * 3.0; // radians per second

// Gameplay Constants
export const ROAD_SPEED_MULTIPLIER = 2.5; // Speed on roads multiplier

// Collision / Gameplay Radii (Squared for cheaper checks)
export const PICKUP_RADIUS_SQ = 4 * 4; // meters^2 (Keep this larger for easier pickup)
export const BASE_RADIUS_SQ = 30 * 30; // meters^2 (Should match client VISUAL_BASE_RADIUS^2)
export const STEAL_COOLDOWN_MS = 500; // 0.5 seconds

// Spawn Area
export const ITEM_SPAWN_RADIUS = 250; // meters - Radius around origin for item spawns (Increased from 150)
export const PLAYER_SPAWN_RADIUS = 10; // meters - Radius around origin for player spawns

// AI Configuration
export const AI_SPEED_MULTIPLIER = 0.9; // AI max speed is 90% of human
export const AI_ACCEL_MULTIPLIER = 0.85; // AI acceleration is 85% of human

export const PHYSICS_IMPULSE_MAGNITUDE = 10; // Adjust this value! Impulse strength.
