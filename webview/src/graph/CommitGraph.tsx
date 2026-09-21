import { useMemo } from 'react';
import { layoutGraph } from './GraphLayout';
import { GraphRowSvg } from './GraphRenderer';
import type { CommitDto } from '../bridge/protocol';

/**
 * Commit graph column: computes the full layout once per page and exposes
 * per-row renderers for the virtual list (document §15, §17).
 */
export function useCommitGraph(commits: CommitDto[], enabled: boolean) {
    return useMemo(() => {
        if (!enabled) {
            return { layout: null, rowByHash: new Map<string, { col: number; colorIndex: number }>() };
        }
        const layout = layoutGraph(commits);
        const rowByHash = new Map<string, { col: number; colorIndex: number }>();
        for (const row of layout.rows) {
            rowByHash.set(row.hash, { col: row.col, colorIndex: row.colorIndex });
        }
        return { layout, rowByHash };
    }, [commits, enabled]);
}

export function CommitGraphCell({ layout, hash }: { layout: ReturnType<typeof layoutGraph> | null; hash: string }) {
    if (!layout) {
        return null;
    }
    const row = layout.rows.find(r => r.hash === hash);
    if (!row) {
        return null;
    }
    return (
        <GraphRowSvg
            row={row}
            laneCount={layout.laneCount}
            laneWidth={layout.laneWidth}
            rowHeight={layout.rowHeight}
        />
    );
}
