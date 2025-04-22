/**
 * Queries the Mapbox Tilequery API to find features at a given point.
 * Returns a Promise that resolves with the API response (parsed JSON) or null on error.
 */
export declare function getMapFeaturesAtPoint(lon: number, lat: number): Promise<any | null>;
/**
 * Checks if the Mapbox Tilequery API response contains a road feature.
 */
export declare function responseHasRoad(apiResponse: any): boolean;
//# sourceMappingURL=mapApiUtils.d.ts.map