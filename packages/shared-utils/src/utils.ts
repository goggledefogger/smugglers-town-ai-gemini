/**
 * Shared utility functions.
 */

import { METERS_PER_DEGREE_LAT_APPROX, ORIGIN_LAT, ORIGIN_LNG } from "./constants";

/**
 * Linear interpolation.
 */
export function lerp(start: number, end: number, factor: number): number {
    return start + (end - start) * factor;
}

/**
 * Circular linear interpolation (for angles).
 * Handles wrapping around 2*PI.
 */
export function angleLerp(startAngle: number, endAngle: number, factor: number): number {
    const difference = endAngle - startAngle;
    let delta = difference;

    // Adjust delta to be in [-PI, PI] range
    if (delta > Math.PI) {
        delta -= 2 * Math.PI;
    } else if (delta < -Math.PI) {
        delta += 2 * Math.PI;
    }

    const interpolatedDelta = delta * factor;
    let resultAngle = startAngle + interpolatedDelta;

    // Normalize result to be in [0, 2*PI) range (optional, depends on usage)
    // resultAngle = (resultAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);

    return resultAngle;
}

/**
 * Calculates approximate meters per degree longitude at a given latitude.
 */
export function metersPerDegreeLngApprox(latitude: number): number {
    // Ensure latitude is within valid range to avoid Math.cos issues
    const clampedLat = Math.max(-85, Math.min(85, latitude));
    const meters = METERS_PER_DEGREE_LAT_APPROX * Math.cos(clampedLat * Math.PI / 180);
    return meters > 1 ? meters : 1; // Avoid returning 0 or negative for extreme latitudes or edge cases
}

/**
 * Converts Geo coords [Lng, Lat] to world meters (relative to the specified origin).
 */
export function geoToWorld(
    lon: number,
    lat: number,
    originLng: number,
    originLat: number
): { x: number; y: number } {
    const deltaLat = lat - originLat;
    const deltaLon = lon - originLng;

    const y_meters = deltaLat * METERS_PER_DEGREE_LAT_APPROX;

    // Calculate meters per degree longitude AT THE SPECIFIED ORIGIN'S LATITUDE for x conversion
    const metersPerLng = metersPerDegreeLngApprox(originLat); // Use specified origin's latitude
    const x_meters = deltaLon * metersPerLng;

    return { x: x_meters, y: y_meters };
}

/**
 * Converts world meters (relative to the specified origin) back to approximate Geo coords [Lng, Lat].
 */
export function worldToGeo(
    x_meters: number,
    y_meters: number,
    originLng: number,
    originLat: number
): [number, number] {
    const metersPerLng = metersPerDegreeLngApprox(originLat); // Use specified origin lat for approximation
    if (!isFinite(metersPerLng) || metersPerLng === 0) {
        console.warn("worldToGeo: Invalid metersPerLng, returning specified origin");
        return [originLng, originLat]; // Avoid division by zero
    }
    const deltaLng = x_meters / metersPerLng;
    const deltaLat = y_meters / METERS_PER_DEGREE_LAT_APPROX;
    const resultLng = originLng + deltaLng;
    const resultLat = originLat + deltaLat;

    // Basic sanity check for resulting coordinates
    if (!isFinite(resultLng) || !isFinite(resultLat) || Math.abs(resultLat) > 90) {
        console.warn(`worldToGeo: Calculation resulted in invalid coordinates (${resultLng}, ${resultLat}) from input (${x_meters}, ${y_meters}). Returning specified origin.`);
        return [originLng, originLat];
    }
    return [resultLng, resultLat];
}

/**
 * Helper function for squared distance calculation.
 */
export function distSq(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
}

/**
 * Checks if a point is within a rectangle defined by min/max coordinates.
 */
export function isPointInRectangle(x: number, y: number, rect: { minX: number, minY: number, maxX: number, maxY: number }): boolean {
    return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
}
