"use strict";
// packages/shared-utils/src/mathUtils.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.distSq = void 0;
exports.lerp = lerp;
exports.angleLerp = angleLerp;
/**
 * Linear interpolation between two numbers.
 */
function lerp(start, end, factor) {
    return start + factor * (end - start);
}
/**
 * Linear interpolation between two angles (shortest path) in radians.
 */
function angleLerp(startAngle, endAngle, factor) {
    const delta = endAngle - startAngle;
    let shortestAngle = ((delta + Math.PI) % (2 * Math.PI)) - Math.PI;
    // Ensure shortestAngle is adjusted correctly if delta was exactly +/- PI
    if (shortestAngle < -Math.PI) {
        shortestAngle += 2 * Math.PI;
    }
    else if (shortestAngle > Math.PI) {
        shortestAngle -= 2 * Math.PI;
    }
    return startAngle + factor * shortestAngle;
}
/**
 * Calculates the squared distance between two points.
 * Avoids using Math.sqrt for performance when only comparing distances.
 */
const distSq = (x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
};
exports.distSq = distSq;
//# sourceMappingURL=mathUtils.js.map