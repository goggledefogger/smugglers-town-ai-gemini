/**
 * helpers.ts
 *
 * General utility functions.
 */

/**
 * Checks if a point is within a rectangle defined by min/max coordinates.
 */
export function isPointInRectangle(x: number, y: number, rect: { minX: number, minY: number, maxX: number, maxY: number }): boolean {
    return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
}
