/**
 * Commit graph lane assignment (document §87).
 *
 * Rules:
 * 1. Walk commits in git log order.
 * 2. Each active branch path owns a lane.
 * 3. Reuse the lane when the commit is already expected in one.
 * 4. The first parent continues the node's lane.
 * 5. Other parents get new lanes (or connect to an existing lane -> merge edge).
 * 6. Freed lanes are removed; lane color is bound to the lane lifetime.
 */

export interface GraphPath {
    d: string;
    colorIndex: number;
}

export interface GraphRowRender {
    hash: string;
    col: number;
    colorIndex: number;
    paths: GraphPath[];
}

export interface GraphLayoutResult {
    rows: GraphRowRender[];
    laneCount: number;
    rowHeight: number;
    laneWidth: number;
}

const PALETTE_SIZE = 7;
const TOMBSTONE = '\u0000';

export const GRAPH_DEFAULTS = {
    rowHeight: 28,
    laneWidth: 14,
    nodeX: 7,
    radius: 4
};

export function layoutGraph(
    commits: { hash: string; parents: string[] }[],
    opts?: { rowHeight?: number; laneWidth?: number }
): GraphLayoutResult {
    const rowHeight = opts?.rowHeight ?? GRAPH_DEFAULTS.rowHeight;
    const laneWidth = opts?.laneWidth ?? GRAPH_DEFAULTS.laneWidth;
    const nodeX = GRAPH_DEFAULTS.nodeX;
    const mid = rowHeight / 2;

    const lanes: string[] = [];
    const laneColor: number[] = [];
    const rows: GraphRowRender[] = [];
    let maxLanes = 1;

    for (let r = 0; r < commits.length; r++) {
        const commit = commits[r];
        const paths: GraphPath[] = [];

        // 1. Find lanes that expect this commit (its parents pointers).
        const matches: number[] = [];
        for (let i = 0; i < lanes.length; i++) {
            if (lanes[i] === commit.hash) {
                matches.push(i);
            }
        }

        // 2. Allocate the node lane.
        let col: number;
        let color: number;
        if (matches.length > 0) {
            col = matches[0];
            color = laneColor[col];
        } else {
            col = lanes.length;
            lanes.push(commit.hash);
            color = r % PALETTE_SIZE;
            laneColor.push(color);
            matches.push(col);
        }

        // 3. Lines crossing this row + incoming merge curves.
        if (r > 0) {
            for (let i = 0; i < lanes.length; i++) {
                if (matches.includes(i)) { continue; }
                const x = i * laneWidth + nodeX;
                paths.push({ d: `M ${x} 0 L ${x} ${rowHeight}`, colorIndex: laneColor[i] });
            }
            const nodeColX = col * laneWidth + nodeX;
            paths.push({ d: `M ${nodeColX} 0 L ${nodeColX} ${mid}`, colorIndex: color });
            for (const i of matches.slice(1)) {
                const x0 = i * laneWidth + nodeX;
                paths.push({
                    d: `M ${x0} 0 C ${x0} ${mid} ${nodeColX} ${mid} ${nodeColX} ${mid}`,
                    colorIndex: laneColor[i]
                });
            }
        }

        // 4. Continue the lane with the first parent; branch out others.
        for (const i of matches) {
            lanes[i] = TOMBSTONE;
        }
        if (commit.parents.length > 0) {
            lanes[col] = commit.parents[0];
            const x = col * laneWidth + nodeX;
            paths.push({ d: `M ${x} ${mid} L ${x} ${rowHeight}`, colorIndex: color });

            let colorSeq = r + 1;
            for (const parent of commit.parents.slice(1)) {
                let existing = -1;
                for (let i = 0; i < lanes.length; i++) {
                    if (i !== col && lanes[i] === parent) {
                        existing = i;
                        break;
                    }
                }
                const x0 = col * laneWidth + nodeX;
                if (existing >= 0) {
                    const x1 = existing * laneWidth + nodeX;
                    paths.push({
                        d: `M ${x0} ${mid} C ${x0} ${rowHeight} ${x1} ${rowHeight} ${x1} ${rowHeight}`,
                        colorIndex: laneColor[existing]
                    });
                } else {
                    const newLane = lanes.length;
                    lanes.push(parent);
                    const newColor = colorSeq % PALETTE_SIZE;
                    colorSeq++;
                    laneColor.push(newColor);
                    const x1 = newLane * laneWidth + nodeX;
                    paths.push({
                        d: `M ${x0} ${mid} C ${x0} ${rowHeight} ${x1} ${rowHeight} ${x1} ${rowHeight}`,
                        colorIndex: newColor
                    });
                }
            }
        } else {
            lanes.splice(col, 1);
            laneColor.splice(col, 1);
        }

        // 5. Remove consumed lanes.
        for (let i = lanes.length - 1; i >= 0; i--) {
            if (lanes[i] === TOMBSTONE) {
                lanes.splice(i, 1);
                laneColor.splice(i, 1);
            }
        }

        maxLanes = Math.max(maxLanes, col + 1, lanes.length);
        rows.push({ hash: commit.hash, col, colorIndex: color, paths });
    }

    return { rows, laneCount: maxLanes, rowHeight, laneWidth };
}
