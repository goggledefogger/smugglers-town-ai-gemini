/**
 * Linear interpolation between two numbers.
 */
export declare function lerp(start: number, end: number, factor: number): number;
/**
 * Linear interpolation between two angles (shortest path) in radians.
 */
export declare function angleLerp(startAngle: number, endAngle: number, factor: number): number;
/**
 * Calculates the squared distance between two points.
 * Avoids using Math.sqrt for performance when only comparing distances.
 */
export declare const distSq: (x1: number, y1: number, x2: number, y2: number) => number;
