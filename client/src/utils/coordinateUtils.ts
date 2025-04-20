/**
 * coordinateUtils.ts
 *
 * Helper functions for coordinate conversions and interpolations.
 */

// Define World Origin Constants (used for conversions)
const INITIAL_CENTER: [number, number] = [-73.985, 40.758]; // Times Square, NYC (Lng, Lat)
export const ORIGIN_LNG = INITIAL_CENTER[0];
export const ORIGIN_LAT = INITIAL_CENTER[1];
export const METERS_PER_DEGREE_LAT_APPROX = 111320; // Approx meters per degree latitude

/**
 * Linear interpolation between two numbers.
 */
export function lerp(start: number, end: number, factor: number): number {
  return start + factor * (end - start);
}

/**
 * Linear interpolation between two angles (shortest path).
 */
export function angleLerp(startAngle: number, endAngle: number, factor: number): number {
  const delta = endAngle - startAngle;
  const shortestAngle = ((delta + Math.PI) % (2 * Math.PI)) - Math.PI;
  return startAngle + factor * shortestAngle;
}

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
