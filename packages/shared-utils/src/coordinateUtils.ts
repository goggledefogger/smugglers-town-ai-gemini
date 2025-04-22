// packages/shared-utils/src/coordinateUtils.ts
import { ORIGIN_LNG, ORIGIN_LAT, METERS_PER_DEGREE_LAT_APPROX } from "./constants";

/**
 * Helper to get meters per degree longitude at a given latitude (approximate).
 */
export function metersPerDegreeLngApprox(latitude: number): number {
    // Ensure latitude is within valid range to avoid Math.cos issues
    const clampedLat = Math.max(-85, Math.min(85, latitude));
    const meters = METERS_PER_DEGREE_LAT_APPROX * Math.cos(clampedLat * Math.PI / 180);
    return meters > 1 ? meters : 1; // Avoid returning 0 or negative for extreme latitudes or edge cases
}

/**
 * Convert Geo coords (Lng/Lat) to world meters relative to origin.
 * @returns [x_meters, y_meters]
 */
export function geoToWorld(lng: number, lat: number): [number, number] {
    const metersPerLng = metersPerDegreeLngApprox(ORIGIN_LAT); // Use origin latitude for approximation
    const deltaLng = lng - ORIGIN_LNG;
    const deltaLat = lat - ORIGIN_LAT;
    const x_meters = deltaLng * metersPerLng;
    const y_meters = deltaLat * METERS_PER_DEGREE_LAT_APPROX; // Use constant for latitude
    return [x_meters, y_meters];
}

/**
 * Convert world meters (relative to origin) back to approximate Geo coords.
 * @returns [lng, lat]
 */
export function worldToGeo(x_meters: number, y_meters: number): [number, number] {
    const metersPerLng = metersPerDegreeLngApprox(ORIGIN_LAT); // Use origin lat for approximation
    if (!isFinite(metersPerLng) || metersPerLng === 0) {
        console.warn("worldToGeo: Invalid metersPerLng, returning origin");
        return [ORIGIN_LNG, ORIGIN_LAT]; // Avoid division by zero
    }
    const deltaLng = x_meters / metersPerLng;
    const deltaLat = y_meters / METERS_PER_DEGREE_LAT_APPROX;
    const resultLng = ORIGIN_LNG + deltaLng;
    const resultLat = ORIGIN_LAT + deltaLat;

    // Basic sanity check for resulting coordinates
    if (!isFinite(resultLng) || !isFinite(resultLat) || Math.abs(resultLat) > 90) {
        console.warn(`worldToGeo: Calculation resulted in invalid coordinates (${resultLng}, ${resultLat}) from input (${x_meters}, ${y_meters}). Returning origin.`);
        return [ORIGIN_LNG, ORIGIN_LAT];
    }
    return [resultLng, resultLat];
}
