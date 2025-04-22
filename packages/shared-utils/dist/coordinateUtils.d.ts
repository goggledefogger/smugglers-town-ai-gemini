/**
 * Helper to get meters per degree longitude at a given latitude (approximate).
 */
export declare function metersPerDegreeLngApprox(latitude: number): number;
/**
 * Convert Geo coords (Lng/Lat) to world meters relative to origin.
 * @returns [x_meters, y_meters]
 */
export declare function geoToWorld(lng: number, lat: number): [number, number];
/**
 * Convert world meters (relative to origin) back to approximate Geo coords.
 * @returns [lng, lat]
 */
export declare function worldToGeo(x_meters: number, y_meters: number): [number, number];
