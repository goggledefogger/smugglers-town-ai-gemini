/**
 * mapData.ts
 *
 * Local map geometry for collision/physics lookups.
 * Fetched once per room from the Overpass API (disk-cached per bbox),
 * projected into world meters, and indexed for per-tick queries.
 * Replaces the per-position Mapbox Tilequery API calls.
 */

import fs from 'fs';
import path from 'path';
import { geoToWorld, METERS_PER_DEGREE_LAT_APPROX, metersPerDegreeLngApprox } from '@smugglers-town/shared-utils';

export type SurfaceType = 'building' | 'water';

const OVERPASS_ENDPOINTS = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
];
// Dense-city extracts are slow: midtown Manhattan at r=1500m takes ~17s and
// ~13MB even when healthy. The load is fire-and-forget, so a long budget is fine.
const FETCH_TIMEOUT_MS = 150_000;
const OVERPASS_QUERY_TIMEOUT_S = 120;
const CACHE_DIR = path.join(__dirname, '..', '..', '.map-cache');

// Half-widths in meters by OSM highway class (road counts as "on" within this
// distance of its centerline). Rough defaults; tune with gameplay feel.
const ROAD_HALF_WIDTHS: Record<string, number> = {
    motorway: 6, trunk: 6, motorway_link: 5, trunk_link: 5,
    primary: 5, primary_link: 4,
    secondary: 4, secondary_link: 4,
    tertiary: 3.5, tertiary_link: 3.5,
    residential: 3, unclassified: 3, living_street: 3,
    service: 2, pedestrian: 3,
};
const DEFAULT_ROAD_HALF_WIDTH = 2.5;
// Skip non-drivable ways so sidewalks/trails don't grant the road boost.
const EXCLUDED_HIGHWAYS = new Set(['footway', 'path', 'steps', 'cycleway', 'bridleway', 'corridor', 'proposed', 'construction']);

const CELL_SIZE = 32; // meters; grid resolution for the spatial index

type LatLon = { lat: number; lon: number };
type OverpassElement = {
    type: string;
    tags?: Record<string, string>;
    geometry?: LatLon[];
    members?: { type: string; role: string; geometry?: LatLon[] }[];
};

type Polygon = {
    surface: SurfaceType;
    xs: number[];
    ys: number[];
    minX: number; minY: number; maxX: number; maxY: number;
};

export type BuildingHit = { hitX: number; hitY: number; nx: number; ny: number };

/**
 * Uniform grid spatial index over a bounded play area.
 * ponytail: grid instead of an R-tree (flatbush is ESM-only, server is CJS);
 * O(1) lookups over a known bbox — swap in an R-tree if areas ever get huge.
 */
class Grid {
    private cells = new Map<number, number[]>();
    private cols: number;

    constructor(private minX: number, private minY: number, maxX: number, maxY: number) {
        this.cols = Math.max(1, Math.ceil((maxX - minX) / CELL_SIZE));
    }

    private cellX(x: number): number { return Math.floor((x - this.minX) / CELL_SIZE); }
    private cellY(y: number): number { return Math.floor((y - this.minY) / CELL_SIZE); }

    insert(minX: number, minY: number, maxX: number, maxY: number, idx: number): void {
        const cx0 = this.cellX(minX), cx1 = this.cellX(maxX);
        const cy0 = this.cellY(minY), cy1 = this.cellY(maxY);
        for (let cy = cy0; cy <= cy1; cy++) {
            for (let cx = cx0; cx <= cx1; cx++) {
                const key = cy * this.cols + cx;
                const bucket = this.cells.get(key);
                if (bucket) bucket.push(idx);
                else this.cells.set(key, [idx]);
            }
        }
    }

    /** Candidate indices whose inserted bbox may overlap the query bbox. May contain duplicates. */
    query(minX: number, minY: number, maxX: number, maxY: number, out: number[]): number[] {
        out.length = 0;
        const cx0 = this.cellX(minX), cx1 = this.cellX(maxX);
        const cy0 = this.cellY(minY), cy1 = this.cellY(maxY);
        for (let cy = cy0; cy <= cy1; cy++) {
            for (let cx = cx0; cx <= cx1; cx++) {
                const bucket = this.cells.get(cy * this.cols + cx);
                if (bucket) out.push(...bucket);
            }
        }
        return out;
    }
}

export class MapData {
    // Road segments as parallel flat arrays (x1,y1,x2,y2 per segment)
    private segX1: number[] = [];
    private segY1: number[] = [];
    private segX2: number[] = [];
    private segY2: number[] = [];
    private segHalfW: number[] = [];
    private maxRoadHalfW = DEFAULT_ROAD_HALF_WIDTH;

    private polygons: Polygon[] = [];

    private roadGrid: Grid;
    private polyGrid: Grid;

    // Reused scratch buffers to avoid per-tick allocation
    private roadCandidates: number[] = [];
    private polyCandidates: number[] = [];

    private constructor(bounds: { minX: number; minY: number; maxX: number; maxY: number }) {
        this.roadGrid = new Grid(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
        this.polyGrid = new Grid(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
    }

    // --- Loading ---

    static async load(originLng: number, originLat: number, radiusM: number): Promise<MapData> {
        const raw = await fetchOverpass(originLng, originLat, radiusM);
        return MapData.fromOverpass(raw, originLng, originLat, radiusM);
    }

    /** Build from a raw Overpass JSON response. Exposed for tests. */
    static fromOverpass(response: { elements: OverpassElement[] }, originLng: number, originLat: number, radiusM: number): MapData {
        const md = new MapData({ minX: -radiusM, minY: -radiusM, maxX: radiusM, maxY: radiusM });
        const project = (pts: LatLon[]): { xs: number[]; ys: number[] } => {
            const xs: number[] = [], ys: number[] = [];
            for (const p of pts) {
                const { x, y } = geoToWorld(p.lon, p.lat, originLng, originLat);
                xs.push(x); ys.push(y);
            }
            return { xs, ys };
        };

        for (const el of response.elements ?? []) {
            const tags = el.tags ?? {};

            if (el.type === 'way' && tags.highway && el.geometry && el.geometry.length >= 2) {
                if (EXCLUDED_HIGHWAYS.has(tags.highway)) continue;
                const halfW = ROAD_HALF_WIDTHS[tags.highway] ?? DEFAULT_ROAD_HALF_WIDTH;
                md.maxRoadHalfW = Math.max(md.maxRoadHalfW, halfW);
                const { xs, ys } = project(el.geometry);
                for (let i = 0; i < xs.length - 1; i++) {
                    md.addSegment(xs[i], ys[i], xs[i + 1], ys[i + 1], halfW);
                }
                continue;
            }

            const surface: SurfaceType | null =
                tags.building ? 'building' :
                (tags.natural === 'water' || tags.waterway === 'riverbank') ? 'water' : null;
            if (!surface) continue;

            if (el.type === 'way' && el.geometry && el.geometry.length >= 3) {
                const { xs, ys } = project(el.geometry);
                md.addPolygon(surface, xs, ys);
            } else if (el.type === 'relation' && el.members) {
                // Outer rings only; holes (courtyards) ignored for v1.
                for (const m of el.members) {
                    if (m.role === 'outer' && m.geometry && m.geometry.length >= 3) {
                        const { xs, ys } = project(m.geometry);
                        md.addPolygon(surface, xs, ys);
                    }
                }
            }
        }

        console.log(`[MapData] Indexed ${md.segX1.length} road segments, ${md.polygons.length} polygons (origin ${originLat.toFixed(4)},${originLng.toFixed(4)}, r=${radiusM}m)`);
        return md;
    }

    private addSegment(x1: number, y1: number, x2: number, y2: number, halfW: number): void {
        const idx = this.segX1.length;
        this.segX1.push(x1); this.segY1.push(y1);
        this.segX2.push(x2); this.segY2.push(y2);
        this.segHalfW.push(halfW);
        this.roadGrid.insert(
            Math.min(x1, x2) - halfW, Math.min(y1, y2) - halfW,
            Math.max(x1, x2) + halfW, Math.max(y1, y2) + halfW,
            idx
        );
    }

    private addPolygon(surface: SurfaceType, xs: number[], ys: number[]): void {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < xs.length; i++) {
            if (xs[i] < minX) minX = xs[i];
            if (xs[i] > maxX) maxX = xs[i];
            if (ys[i] < minY) minY = ys[i];
            if (ys[i] > maxY) maxY = ys[i];
        }
        const idx = this.polygons.length;
        this.polygons.push({ surface, xs, ys, minX, minY, maxX, maxY });
        this.polyGrid.insert(minX, minY, maxX, maxY, idx);
    }

    // --- Queries (hot path: flat meter math only) ---

    /** True if (x, y) is within half a road's width of its centerline. */
    isOnRoad(x: number, y: number): boolean {
        const candidates = this.roadGrid.query(x, y, x, y, this.roadCandidates);
        for (const i of candidates) {
            const halfW = this.segHalfW[i];
            if (ptSegDistSq(x, y, this.segX1[i], this.segY1[i], this.segX2[i], this.segY2[i]) <= halfW * halfW) {
                return true;
            }
        }
        return false;
    }

    /** Surface type containing (x, y), or null for open ground/road. */
    surfaceAt(x: number, y: number): SurfaceType | null {
        const candidates = this.polyGrid.query(x, y, x, y, this.polyCandidates);
        for (const i of candidates) {
            const p = this.polygons[i];
            if (x < p.minX || x > p.maxX || y < p.minY || y > p.maxY) continue;
            if (pointInRing(x, y, p.xs, p.ys)) return p.surface;
        }
        return null;
    }

    /**
     * Sweeps the movement segment (fromX,fromY)->(toX,toY) against building edges.
     * Returns the earliest intersection plus the edge normal facing the mover,
     * or null if the path is clear. If the start point is already inside a
     * building (spawn edge case), returns null so the car can drive out.
     */
    sweepBuilding(fromX: number, fromY: number, toX: number, toY: number): BuildingHit | null {
        const minX = Math.min(fromX, toX), maxX = Math.max(fromX, toX);
        const minY = Math.min(fromY, toY), maxY = Math.max(fromY, toY);
        const candidates = this.polyGrid.query(minX, minY, maxX, maxY, this.polyCandidates);

        const dx = toX - fromX, dy = toY - fromY;
        let bestT = Infinity;
        let bestNx = 0, bestNy = 0;

        for (const i of candidates) {
            const p = this.polygons[i];
            if (p.surface !== 'building') continue;
            if (maxX < p.minX || minX > p.maxX || maxY < p.minY || minY > p.maxY) continue;
            if (pointInRing(fromX, fromY, p.xs, p.ys)) return null; // already inside: let it escape

            const n = p.xs.length;
            for (let a = 0, b = n - 1; a < n; b = a++) {
                const ex1 = p.xs[b], ey1 = p.ys[b], ex2 = p.xs[a], ey2 = p.ys[a];
                const edx = ex2 - ex1, edy = ey2 - ey1;
                const denom = dx * edy - dy * edx;
                if (denom === 0) continue; // parallel
                const t = ((ex1 - fromX) * edy - (ey1 - fromY) * edx) / denom;
                const u = ((ex1 - fromX) * dy - (ey1 - fromY) * dx) / denom;
                if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t < bestT) {
                    bestT = t;
                    // Edge normal, oriented against the movement direction
                    const len = Math.hypot(edx, edy);
                    let nx = edy / len, ny = -edx / len;
                    if (nx * dx + ny * dy > 0) { nx = -nx; ny = -ny; }
                    bestNx = nx; bestNy = ny;
                }
            }
        }

        if (bestT === Infinity) return null;
        // Stop just short of the wall, nudged out along the normal.
        const eps = 0.05;
        return {
            hitX: fromX + dx * bestT + bestNx * eps,
            hitY: fromY + dy * bestT + bestNy * eps,
            nx: bestNx,
            ny: bestNy,
        };
    }
}

// --- Geometry helpers ---

function ptSegDistSq(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? ((px - x1) * dx + (py - y1) * dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx, cy = y1 + t * dy;
    return (px - cx) * (px - cx) + (py - cy) * (py - cy);
}

function pointInRing(px: number, py: number, xs: number[], ys: number[]): boolean {
    let inside = false;
    for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) {
        if ((ys[i] > py) !== (ys[j] > py) &&
            px < (xs[j] - xs[i]) * (py - ys[i]) / (ys[j] - ys[i]) + xs[i]) {
            inside = !inside;
        }
    }
    return inside;
}

// --- Overpass fetch with disk cache ---

async function fetchOverpass(originLng: number, originLat: number, radiusM: number): Promise<{ elements: OverpassElement[] }> {
    const cacheFile = path.join(CACHE_DIR, `${originLat.toFixed(4)}_${originLng.toFixed(4)}_${radiusM}.json`);
    try {
        return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    } catch { /* cache miss */ }

    const dLat = radiusM / METERS_PER_DEGREE_LAT_APPROX;
    const dLng = radiusM / metersPerDegreeLngApprox(originLat);
    const s = originLat - dLat, n = originLat + dLat;
    const w = originLng - dLng, e = originLng + dLng;
    const bbox = `${s},${w},${n},${e}`;

    const query = `[out:json][timeout:${OVERPASS_QUERY_TIMEOUT_S}];
(
  way["highway"](${bbox});
  way["building"](${bbox});
  relation["building"](${bbox});
  way["natural"="water"](${bbox});
  way["waterway"="riverbank"](${bbox});
);
out geom;`;

    let lastError: unknown = null;
    for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
            console.log(`[MapData] Fetching map geometry from ${endpoint} (bbox ${bbox})...`);
            const res = await fetch(endpoint, {
                method: 'POST',
                body: 'data=' + encodeURIComponent(query),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    // OSMF policy: Overpass instances reject anonymous clients
                    // (406 without an identifying User-Agent).
                    'User-Agent': 'SmugglersTown/0.1 (hobby game; one cached query per game area)',
                },
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
            const json = await res.json() as { elements: OverpassElement[] };
            try {
                fs.mkdirSync(CACHE_DIR, { recursive: true });
                fs.writeFileSync(cacheFile, JSON.stringify(json));
            } catch (cacheErr) {
                console.warn('[MapData] Failed to write map cache:', cacheErr);
            }
            return json;
        } catch (err) {
            lastError = err;
            console.warn(`[MapData] Overpass fetch failed from ${endpoint}:`, err instanceof Error ? err.message : err);
        }
    }
    throw lastError instanceof Error ? lastError : new Error('All Overpass endpoints failed');
}
