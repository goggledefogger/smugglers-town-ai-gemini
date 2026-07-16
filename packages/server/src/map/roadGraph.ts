/**
 * roadGraph.ts
 *
 * Road network graph over MapData's segment centerlines, with A* pathfinding.
 * Nodes are segment endpoints deduped by 1m-rounded keys (welds consecutive
 * way segments and shared-node junctions). Edge cost is length in meters —
 * every road shares the same speed multiplier, so length is the right cost.
 */

import { MapData, Grid } from './mapData';

const NODE_SNAP_MAX_RADIUS = 250; // give up snapping to the network beyond this
const GRID_BOUND = 2000;

export type Waypoint = { x: number; y: number };

export class RoadGraph {
    private nodesX: number[] = [];
    private nodesY: number[] = [];
    private adj: { to: number; cost: number }[][] = [];
    private grid = new Grid(-GRID_BOUND, -GRID_BOUND, GRID_BOUND, GRID_BOUND);
    private scratch: number[] = [];

    static fromMapData(mapData: MapData): RoadGraph {
        const g = new RoadGraph();
        const keyToNode = new Map<string, number>();

        const nodeFor = (x: number, y: number): number => {
            const key = `${Math.round(x)},${Math.round(y)}`;
            let id = keyToNode.get(key);
            if (id === undefined) {
                id = g.nodesX.length;
                keyToNode.set(key, id);
                g.nodesX.push(x);
                g.nodesY.push(y);
                g.adj.push([]);
                g.grid.insert(x, y, x, y, id);
            }
            return id;
        };

        mapData.forEachRoadSegment((x1, y1, x2, y2) => {
            const a = nodeFor(x1, y1);
            const b = nodeFor(x2, y2);
            if (a === b) return;
            const cost = Math.hypot(x2 - x1, y2 - y1);
            g.adj[a].push({ to: b, cost });
            g.adj[b].push({ to: a, cost });
        });

        console.log(`[RoadGraph] ${g.nodesX.length} nodes, built from road segments.`);
        return g;
    }

    get nodeCount(): number { return this.nodesX.length; }

    /** Nearest graph node to (x, y) within NODE_SNAP_MAX_RADIUS, or -1. */
    nearestNode(x: number, y: number): number {
        for (let r = 32; r <= NODE_SNAP_MAX_RADIUS; r *= 2) {
            const candidates = this.grid.query(x - r, y - r, x + r, y + r, this.scratch);
            let best = -1, bestDSq = r * r;
            for (const i of candidates) {
                const dx = this.nodesX[i] - x, dy = this.nodesY[i] - y;
                const dSq = dx * dx + dy * dy;
                if (dSq < bestDSq) { bestDSq = dSq; best = i; }
            }
            if (best >= 0) return best;
        }
        return -1;
    }

    /**
     * A* from the node nearest (fromX,fromY) to the node nearest (toX,toY).
     * Returns waypoints along the road network, with the actual goal point
     * appended as the final waypoint. Null if unreachable or off-network.
     */
    findPath(fromX: number, fromY: number, toX: number, toY: number): Waypoint[] | null {
        const start = this.nearestNode(fromX, fromY);
        const goal = this.nearestNode(toX, toY);
        if (start < 0 || goal < 0) return null;
        if (start === goal) {
            return [{ x: this.nodesX[goal], y: this.nodesY[goal] }, { x: toX, y: toY }];
        }

        const gScore = new Map<number, number>();
        const cameFrom = new Map<number, number>();
        const heap = new MinHeap();
        gScore.set(start, 0);
        heap.push(start, this.heuristic(start, goal));

        let found = false;
        while (heap.size > 0) {
            const current = heap.pop();
            if (current === goal) { found = true; break; }
            const currentG = gScore.get(current)!;
            for (const edge of this.adj[current]) {
                const tentative = currentG + edge.cost;
                const known = gScore.get(edge.to);
                if (known === undefined || tentative < known) {
                    gScore.set(edge.to, tentative);
                    cameFrom.set(edge.to, current);
                    heap.push(edge.to, tentative + this.heuristic(edge.to, goal));
                }
            }
        }
        if (!found) return null;

        const nodePath: number[] = [goal];
        let n = goal;
        while (n !== start) {
            n = cameFrom.get(n)!;
            nodePath.push(n);
        }
        nodePath.reverse();

        const waypoints: Waypoint[] = nodePath.map(i => ({ x: this.nodesX[i], y: this.nodesY[i] }));
        waypoints.push({ x: toX, y: toY });
        return waypoints;
    }

    private heuristic(node: number, goal: number): number {
        return Math.hypot(this.nodesX[goal] - this.nodesX[node], this.nodesY[goal] - this.nodesY[node]);
    }
}

/** Array-backed binary min-heap of (node, priority). Duplicates allowed; stale entries skipped via pop-time check is unnecessary because re-push only happens on improvement. */
class MinHeap {
    private nodes: number[] = [];
    private prio: number[] = [];

    get size(): number { return this.nodes.length; }

    push(node: number, priority: number): void {
        this.nodes.push(node);
        this.prio.push(priority);
        let i = this.nodes.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.prio[parent] <= this.prio[i]) break;
            this.swap(i, parent);
            i = parent;
        }
    }

    pop(): number {
        const top = this.nodes[0];
        const lastN = this.nodes.pop()!;
        const lastP = this.prio.pop()!;
        if (this.nodes.length > 0) {
            this.nodes[0] = lastN;
            this.prio[0] = lastP;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1, r = l + 1;
                let smallest = i;
                if (l < this.prio.length && this.prio[l] < this.prio[smallest]) smallest = l;
                if (r < this.prio.length && this.prio[r] < this.prio[smallest]) smallest = r;
                if (smallest === i) break;
                this.swap(i, smallest);
                i = smallest;
            }
        }
        return top;
    }

    private swap(a: number, b: number): void {
        [this.nodes[a], this.nodes[b]] = [this.nodes[b], this.nodes[a]];
        [this.prio[a], this.prio[b]] = [this.prio[b], this.prio[a]];
    }
}
