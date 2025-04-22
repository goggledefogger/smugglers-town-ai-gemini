"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ORIGIN_LAT = exports.ORIGIN_LNG = void 0;
exports.metersPerDegreeLngApprox = metersPerDegreeLngApprox;
exports.worldToGeo = worldToGeo;
/**
 * coordinateUtils.ts
 *
 * Helper functions for coordinate conversions (Server-side).
 */
const shared_utils_1 = require("@smugglers-town/shared-utils"); // Import shared constant
// Coordinate conversion utilities for the server
// Define World Origin Constants (used for conversions)
exports.ORIGIN_LNG = -73.985;
exports.ORIGIN_LAT = 40.758;
// export const METERS_PER_DEGREE_LAT_APPROX = 111320; // MOVED TO SHARED-UTILS
/**
 * Calculates approximate meters per degree longitude at a given latitude.
 */
function metersPerDegreeLngApprox(latitude) {
    // Ensure latitude is within valid range to avoid Math.cos issues
    const clampedLat = Math.max(-85, Math.min(85, latitude));
    const meters = shared_utils_1.METERS_PER_DEGREE_LAT_APPROX * Math.cos(clampedLat * Math.PI / 180);
    return meters > 1 ? meters : 1; // Avoid returning 0 or negative for extreme latitudes or edge cases
}
/**
 * Converts world meters (relative to origin) back to approximate Geo coords [Lng, Lat].
 */
function worldToGeo(x_meters, y_meters) {
    const metersPerLng = metersPerDegreeLngApprox(exports.ORIGIN_LAT); // Use origin lat for approximation
    if (!isFinite(metersPerLng) || metersPerLng === 0) {
        console.warn("worldToGeo: Invalid metersPerLng, returning origin");
        return [exports.ORIGIN_LNG, exports.ORIGIN_LAT]; // Avoid division by zero
    }
    const deltaLng = x_meters / metersPerLng;
    const deltaLat = y_meters / shared_utils_1.METERS_PER_DEGREE_LAT_APPROX;
    const resultLng = exports.ORIGIN_LNG + deltaLng;
    const resultLat = exports.ORIGIN_LAT + deltaLat;
    // Basic sanity check for resulting coordinates
    if (!isFinite(resultLng) || !isFinite(resultLat) || Math.abs(resultLat) > 90) {
        console.warn(`worldToGeo: Calculation resulted in invalid coordinates (${resultLng}, ${resultLat}) from input (${x_meters}, ${y_meters}). Returning origin.`);
        return [exports.ORIGIN_LNG, exports.ORIGIN_LAT];
    }
    return [resultLng, resultLat];
}
// Note: geoToWorld is not currently needed on the server, so it's omitted.
//# sourceMappingURL=coordinateUtils.js.map