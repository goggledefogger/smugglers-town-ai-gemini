"use strict";
// packages/shared-utils/src/constants.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.METERS_PER_DEGREE_LAT_APPROX = exports.ORIGIN_LAT = exports.ORIGIN_LNG = exports.BLUE_BASE_POS = exports.RED_BASE_POS = exports.Y_OFFSET = exports.BASE_DISTANCE = void 0;
// Base Positions (Meters from Origin) - Used by Server and Client Rendering
exports.BASE_DISTANCE = 80; // meters
exports.Y_OFFSET = 0; // Keep bases horizontally aligned for simplicity
exports.RED_BASE_POS = { x: -exports.BASE_DISTANCE, y: exports.Y_OFFSET };
exports.BLUE_BASE_POS = { x: exports.BASE_DISTANCE, y: -exports.Y_OFFSET };
// World Origin Constants (Lng/Lat) - Used for coordinate conversion
const INITIAL_CENTER = [-73.985, 40.758]; // Times Square, NYC
exports.ORIGIN_LNG = INITIAL_CENTER[0];
exports.ORIGIN_LAT = INITIAL_CENTER[1];
// Coordinate Conversion Constants
exports.METERS_PER_DEGREE_LAT_APPROX = 111320; // Approx meters per degree latitude
//# sourceMappingURL=constants.js.map