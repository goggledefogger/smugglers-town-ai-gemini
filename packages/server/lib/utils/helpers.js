"use strict";
/**
 * helpers.ts
 *
 * General utility functions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.lerp = lerp;
exports.angleLerp = angleLerp;
exports.distSq = distSq;
exports.isPointInRectangle = isPointInRectangle;
/**
 * Linear interpolation between two numbers.
 */
function lerp(start, end, factor) {
    return start + factor * (end - start);
}
/**
 * Linear interpolation between two angles (shortest path).
 */
function angleLerp(startAngle, endAngle, factor) {
    const delta = endAngle - startAngle;
    const shortestAngle = ((delta + Math.PI) % (2 * Math.PI)) - Math.PI;
    return startAngle + factor * shortestAngle;
}
/**
 * Calculate squared distance between two points.
 */
function distSq(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
}
/**
 * Checks if a point is within a rectangle defined by min/max coordinates.
 */
function isPointInRectangle(x, y, rect) {
    return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
}
//# sourceMappingURL=helpers.js.map