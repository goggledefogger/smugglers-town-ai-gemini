/**
 * helpers.ts
 *
 * General utility functions.
 */

/**
 * Linear interpolation between two numbers.
 */
export function lerp(start: number, end: number, factor: number): number {
  return start + factor * (end - start);
}

/**
 * Linear interpolation between two angles (shortest path).
 */
export function angleLerp(startAngle: number, endAngle: number, factor: number): number {
  const delta = endAngle - startAngle;
  const shortestAngle = ((delta + Math.PI) % (2 * Math.PI)) - Math.PI;
  return startAngle + factor * shortestAngle;
}

/**
 * Calculate squared distance between two points.
 */
export function distSq(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
}

/**
 * Checks if a point is within a rectangle defined by min/max coordinates.
 */
export function isPointInRectangle(x: number, y: number, rect: { minX: number, minY: number, maxX: number, maxY: number }): boolean {
    return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
}
