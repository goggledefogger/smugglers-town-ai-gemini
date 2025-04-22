"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metersPerDegreeLngApprox = metersPerDegreeLngApprox;
exports.geoToWorld = geoToWorld;
exports.worldToGeo = worldToGeo;
// packages/shared-utils/src/coordinateUtils.ts
const constants_1 = require("./constants");
/**
 * Helper to get meters per degree longitude at a given latitude (approximate).
 */
function metersPerDegreeLngApprox(latitude) {
    // Ensure latitude is within valid range to avoid Math.cos issues
    const clampedLat = Math.max(-85, Math.min(85, latitude));
    const meters = constants_1.METERS_PER_DEGREE_LAT_APPROX * Math.cos(clampedLat * Math.PI / 180);
    return meters > 1 ? meters : 1; // Avoid returning 0 or negative for extreme latitudes or edge cases
}
/**
 * Convert Geo coords (Lng/Lat) to world meters relative to origin.
 * @returns [x_meters, y_meters]
 */
function geoToWorld(lng, lat) {
    const metersPerLng = metersPerDegreeLngApprox(constants_1.ORIGIN_LAT); // Use origin latitude for approximation
    const deltaLng = lng - constants_1.ORIGIN_LNG;
    const deltaLat = lat - constants_1.ORIGIN_LAT;
    const x_meters = deltaLng * metersPerLng;
    const y_meters = deltaLat * constants_1.METERS_PER_DEGREE_LAT_APPROX; // Use constant for latitude
    return [x_meters, y_meters];
}
/**
 * Convert world meters (relative to origin) back to approximate Geo coords.
 * @returns [lng, lat]
 */
function worldToGeo(x_meters, y_meters) {
    const metersPerLng = metersPerDegreeLngApprox(constants_1.ORIGIN_LAT); // Use origin lat for approximation
    if (!isFinite(metersPerLng) || metersPerLng === 0) {
        console.warn("worldToGeo: Invalid metersPerLng, returning origin");
        return [constants_1.ORIGIN_LNG, constants_1.ORIGIN_LAT]; // Avoid division by zero
    }
    const deltaLng = x_meters / metersPerLng;
    const deltaLat = y_meters / constants_1.METERS_PER_DEGREE_LAT_APPROX;
    const resultLng = constants_1.ORIGIN_LNG + deltaLng;
    const resultLat = constants_1.ORIGIN_LAT + deltaLat;
    // Basic sanity check for resulting coordinates
    if (!isFinite(resultLng) || !isFinite(resultLat) || Math.abs(resultLat) > 90) {
        console.warn(`worldToGeo: Calculation resulted in invalid coordinates (${resultLng}, ${resultLat}) from input (${x_meters}, ${y_meters}). Returning origin.`);
        return [constants_1.ORIGIN_LNG, constants_1.ORIGIN_LAT];
    }
    return [resultLng, resultLat];
}
//# sourceMappingURL=coordinateUtils.js.map