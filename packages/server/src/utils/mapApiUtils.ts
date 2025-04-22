import https from 'https';

const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;
const TILESET_ID = 'mapbox.mapbox-streets-v8';
const QUERY_RADIUS_METERS = 5;
const QUERY_LIMIT = 5;
const QUERY_LAYER = 'road';

/**
 * Queries the Mapbox Tilequery API to find features at a given point.
 * Returns a Promise that resolves with the API response (parsed JSON) or null on error.
 */
export function getMapFeaturesAtPoint(lon: number, lat: number): Promise<any | null> {
    // Add log to check if token is loaded
    if (!MAPBOX_TOKEN) {
        console.error("[Mapbox Check] MAPBOX_ACCESS_TOKEN is NOT loaded from environment!");
        return Promise.resolve(null);
    }

    const url = `https://api.mapbox.com/v4/${TILESET_ID}/tilequery/${lon},${lat}.json` +
                `?radius=${QUERY_RADIUS_METERS}&limit=${QUERY_LIMIT}&layers=${QUERY_LAYER}` +
                `&access_token=${MAPBOX_TOKEN}`;

    // console.log(`[Tilequery] Requesting: ${url}`); // Debug logging

    return new Promise((resolve) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const parsedData = JSON.parse(data);
                        // console.log(`[Tilequery] Success Response:`, JSON.stringify(parsedData)); // Debug logging
                        resolve(parsedData);
                    } catch (e) {
                        console.error("[Tilequery] Error parsing JSON response:", e);
                        resolve(null);
                    }
                } else {
                    console.error(`[Tilequery] Error: Status Code ${res.statusCode}`);
                    // console.error(`[Tilequery] Response body: ${data}`); // Debug logging
                    resolve(null);
                }
            });
        }).on('error', (err) => {
            console.error("[Tilequery] Request Error:", err.message);
            resolve(null);
        });
    });
}

/**
 * Checks if the Mapbox Tilequery API response contains a road feature.
 */
export function responseHasRoad(apiResponse: any): boolean {
    if (!apiResponse || !apiResponse.features || apiResponse.features.length === 0) {
        return false;
    }
    // Check if any feature has the 'road' layer source
    // The exact property might vary slightly depending on tileset, inspect response if needed
    return apiResponse.features.some((feature: any) => 
        feature.properties?.tilequery?.layer === QUERY_LAYER || // Common structure
        feature.layer?.source === QUERY_LAYER || // Another possible structure
        feature.properties?.type === 'road' // Fallback check if layer info missing
    );
} 