// packages/shared-utils/src/mathUtils.ts

/**
 * Linear interpolation between two numbers.
 */
export function lerp(start: number, end: number, factor: number): number {
    return start + factor * (end - start);
}

/**
 * Linear interpolation between two angles (shortest path) in radians.
 */
export function angleLerp(startAngle: number, endAngle: number, factor: number): number {
    const delta = endAngle - startAngle;
    let shortestAngle = ((delta + Math.PI) % (2 * Math.PI)) - Math.PI;
    // Ensure shortestAngle is adjusted correctly if delta was exactly +/- PI
    if (shortestAngle < -Math.PI) {
        shortestAngle += 2 * Math.PI;
    } else if (shortestAngle > Math.PI) {
        shortestAngle -= 2 * Math.PI;
    }
    return startAngle + factor * shortestAngle;
}

/**
 * Calculates the squared distance between two points.
 * Avoids using Math.sqrt for performance when only comparing distances.
 */
export const distSq = (x1: number, y1: number, x2: number, y2: number): number => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
};
