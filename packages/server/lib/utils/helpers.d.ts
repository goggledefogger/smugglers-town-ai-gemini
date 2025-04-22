/**
 * helpers.ts
 *
 * General utility functions.
 */
/**
 * Linear interpolation between two numbers.
 */
export declare function lerp(start: number, end: number, factor: number): number;
/**
 * Linear interpolation between two angles (shortest path).
 */
export declare function angleLerp(startAngle: number, endAngle: number, factor: number): number;
/**
 * Calculate squared distance between two points.
 */
export declare function distSq(x1: number, y1: number, x2: number, y2: number): number;
/**
 * Checks if a point is within a rectangle defined by min/max coordinates.
 */
export declare function isPointInRectangle(x: number, y: number, rect: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}): boolean;
//# sourceMappingURL=helpers.d.ts.map