// Coordinate conversion utilities for the server

// Geographic Origin Point (e.g., Times Square)
export const ORIGIN_LNG = -73.985;
export const ORIGIN_LAT = 40.758;

// Approximate meters per degree latitude (constant)
export const METERS_PER_DEGREE_LAT_APPROX = 111320;

/**
 * Calculates approximate meters per degree longitude at a given latitude.
 */
export function metersPerDegreeLngApprox(latitude: number): number {
    // Ensure latitude is within valid range to avoid Math.cos issues
    const clampedLat = Math.max(-85, Math.min(85, latitude));
    const meters = METERS_PER_DEGREE_LAT_APPROX * Math.cos(clampedLat * Math.PI / 180);
    return meters > 1 ? meters : 1; // Avoid returning 0 or negative
}

/**
 * Converts world meters (relative to origin) back to approximate Geo coords [Lng, Lat].
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

// Note: geoToWorld is not currently needed on the server, so it's omitted. 