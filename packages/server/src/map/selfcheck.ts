/**
 * selfcheck.ts
 *
 * Assert-based sanity check for MapData geometry (grid index, road distance,
 * point-in-polygon, building sweep) using a synthetic Overpass response.
 * Run: npm run selfcheck (from packages/server)
 */

import assert from 'assert';
import { MapData } from './mapData';

// Origin at (0,0) so degrees→meters is simple: lat = y/111320, lon = x/111320.
const M = 111320;
const ll = (x: number, y: number) => ({ lat: y / M, lon: x / M });

const synthetic = {
    elements: [
        // East-west residential road along y=0, from x=0 to x~111m (halfW 3)
        { type: 'way', tags: { highway: 'residential' }, geometry: [ll(0, 0), ll(111, 0)] },
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

console.log('MapData selfcheck: all assertions passed.');
