export declare const ORIGIN_LNG = -73.985;
export declare const ORIGIN_LAT = 40.758;
/**
 * Calculates approximate meters per degree longitude at a given latitude.
 */
export declare function metersPerDegreeLngApprox(latitude: number): number;
/**
 * Converts world meters (relative to origin) back to approximate Geo coords [Lng, Lat].
 */
export declare function worldToGeo(x_meters: number, y_meters: number): [number, number];
//# sourceMappingURL=coordinateUtils.d.ts.map