/**
 * selfcheck.ts
 *
 * Assert-based sanity check for MapData geometry (grid index, road distance,
 * point-in-polygon, building sweep) using a synthetic Overpass response.
 * Run: npm run selfcheck (from packages/server)
 */

import assert from 'assert';
import { MapData } from './mapData';
import { RoadGraph } from './roadGraph';

// Origin at (0,0) so degrees→meters is simple: lat = y/111320, lon = x/111320.
const M = 111320;
const ll = (x: number, y: number) => ({ lat: y / M, lon: x / M });

const synthetic = {
    elements: [
        // East-west residential road along y=0, from x=0 to x~111m
        { type: 'way', tags: { highway: 'residential' }, geometry: [ll(0, 0), ll(111, 0)] },
        // North-south road crossing it at x~111, up to y~111 (forms an L route)
        { type: 'way', tags: { highway: 'residential' }, geometry: [ll(111, 0), ll(111, 111)] },
        // Footway (excluded class) along y=50
        { type: 'way', tags: { highway: 'footway' }, geometry: [ll(0, 50), ll(111, 50)] },
        // Building square x∈[20,40], y∈[20,40]
        { type: 'way', tags: { building: 'yes' }, geometry: [ll(20, 20), ll(40, 20), ll(40, 40), ll(20, 40), ll(20, 20)] },
        // Water square x∈[-40,-20], y∈[-40,-20]
        { type: 'way', tags: { natural: 'water' }, geometry: [ll(-40, -40), ll(-20, -40), ll(-20, -20), ll(-40, -20), ll(-40, -40)] },
        // Building relation with one outer ring x∈[60,80], y∈[20,40]
        {
            type: 'relation', tags: { building: 'yes' }, members: [
                { type: 'way', role: 'outer', geometry: [ll(60, 20), ll(80, 20), ll(80, 40), ll(60, 40), ll(60, 20)] },
            ],
        },
    ],
};

const md = MapData.fromOverpass(synthetic as any, 0, 0, 1500);

// --- isOnRoad ---
assert.ok(md.isOnRoad(50, 0), 'on the road centerline');
assert.ok(md.isOnRoad(50, 2.5), 'within half-width of centerline');
assert.ok(!md.isOnRoad(50, 10), 'well off the road');
assert.ok(!md.isOnRoad(50, 50), 'footway must not count as road');
assert.ok(!md.isOnRoad(-500, -500), 'far from everything');

// --- surfaceAt ---
assert.strictEqual(md.surfaceAt(30, 30), 'building', 'inside building way');
assert.strictEqual(md.surfaceAt(70, 30), 'building', 'inside building relation outer ring');
assert.strictEqual(md.surfaceAt(-30, -30), 'water', 'inside water polygon');
assert.strictEqual(md.surfaceAt(0, 30), null, 'open ground');
assert.strictEqual(md.surfaceAt(50, 0), null, 'road is not a polygon surface');

// --- sweepBuilding ---
const hit = md.sweepBuilding(0, 30, 30, 30);
assert.ok(hit, 'sweep into building west wall must hit');
assert.ok(hit!.hitX < 20.01 && hit!.hitX > 18, `hit clamped near wall x=20, got ${hit!.hitX}`);
assert.ok(Math.abs(hit!.nx + 1) < 1e-6 && Math.abs(hit!.ny) < 1e-6, `normal faces mover (-1,0), got (${hit!.nx},${hit!.ny})`);

assert.strictEqual(md.sweepBuilding(0, 0, 10, 0), null, 'clear path has no hit');
assert.strictEqual(md.sweepBuilding(30, 30, 50, 30), null, 'starting inside building allows escape');
assert.strictEqual(md.sweepBuilding(-30, -30, -25, -25), null, 'water polygons do not block movement');

// --- findAccessibleNear ---
const open = md.findAccessibleNear(5, 5);
assert.deepStrictEqual(open, { x: 5, y: 5 }, 'already-accessible point returned unchanged');
const nudged = md.findAccessibleNear(30, 30);
assert.ok(md.surfaceAt(nudged.x, nudged.y) === null, 'point inside building nudged to open ground');
assert.ok(Math.hypot(nudged.x - 30, nudged.y - 30) < 50, 'nudge stays close');

// --- RoadGraph ---
const graph = RoadGraph.fromMapData(md);
assert.ok(graph.nodeCount >= 3, `expected >=3 graph nodes (two joined ways), got ${graph.nodeCount}`);
const path = graph.findPath(2, 3, 108, 105);
assert.ok(path && path.length >= 3, 'path across the L junction has entry, corner, exit');
const corner = path!.some(w => Math.hypot(w.x - 111, w.y - 0) < 2);
assert.ok(corner, 'path routes through the junction node at (111, 0)');
assert.deepStrictEqual(path![path!.length - 1], { x: 108, y: 105 }, 'final waypoint is the goal itself');
assert.strictEqual(graph.findPath(-2000, -2000, 5, 5), null, 'off-network start returns null');

console.log('MapData selfcheck: all assertions passed.');
