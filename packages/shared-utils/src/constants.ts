// packages/shared-utils/src/constants.ts

// Base Positions (Meters from Origin) - Used by Server and Client Rendering
export const BASE_DISTANCE = 200; // meters (Increased from 80)
export const Y_OFFSET = 0; // Keep bases horizontally aligned for simplicity
export const RED_BASE_POS = { x: -BASE_DISTANCE, y: Y_OFFSET };
export const BLUE_BASE_POS = { x: BASE_DISTANCE, y: -Y_OFFSET };

// World Origin Constants (Lng/Lat) - Used for coordinate conversion
const INITIAL_CENTER: [number, number] = [-73.985, 40.758]; // Times Square, NYC
export const ORIGIN_LNG = INITIAL_CENTER[0];
export const ORIGIN_LAT = INITIAL_CENTER[1];

// Coordinate Conversion Constants
export const METERS_PER_DEGREE_LAT_APPROX = 111320; // Approx meters per degree latitude

// Gameplay Constants
export const NUM_ITEMS = 4; // Number of items to spawn each round

// Player Constants - NOTE: Actual physics values are in server/config/constants.ts
// Player Dimensions (used for physics and rendering hints)
export const PLAYER_EFFECTIVE_RADIUS = 1.6; // meters (Reduced from 1.8)
export const PLAYER_COLLISION_RADIUS_SQ = PLAYER_EFFECTIVE_RADIUS * PLAYER_EFFECTIVE_RADIUS; // meters^2 (Used for server collision checks)
export const CAR_HEIGHT = 75; // Client-side rendering height (pixels, relative to zoom)

// Game Items / Flags
export const VISUAL_BASE_RADIUS = 30; // World radius (meters) used for client-side rendering calculation.
