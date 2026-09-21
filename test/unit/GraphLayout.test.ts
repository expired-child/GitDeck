import { describe, it, expect } from 'vitest';
import { layoutGraph } from '../../webview/src/graph/GraphLayout';

describe('GraphLayout', () => {
    it('assigns a single lane to linear history (A-B-C-D)', () => {
        const result = layoutGraph([
            { hash: 'd', parents: ['c'] },
            { hash: 'c', parents: ['b'] },
            { hash: 'b', parents: ['a'] },
            { hash: 'a', parents: [] }
        ]);
        expect(result.rows.map(r => r.col)).toEqual([0, 0, 0, 0]);
        expect(result.laneCount).toBe(1);
        // Color stability along the lane
        expect(new Set(result.rows.map(r => r.colorIndex)).size).toBe(1);
    });

    it('allocates a new lane for a branch fork (A-B, B-D-E)', () => {
        const result = layoutGraph([
            { hash: 'e', parents: ['d'] },
            { hash: 'd', parents: ['b'] },
            { hash: 'c', parents: ['b'] }, // unrelated branch
            { hash: 'b', parents: ['a'] },
            { hash: 'a', parents: [] }
        ]);
        const cols = Object.fromEntries(result.rows.map(r => [r.hash, r.col]));
        expect(cols['d']).toBe(cols['e']);
        expect(cols['d']).not.toBe(cols['c']);
        expect(result.laneCount).toBeGreaterThanOrEqual(2);
    });

    it('renders a merge with an incoming edge (A-B, B-C-D, D-F merging B)', () => {
        const result = layoutGraph([
            { hash: 'f', parents: ['d', 'b'] }, // merge commit
            { hash: 'd', parents: ['b'] },
            { hash: 'c', parents: ['b'] },
            { hash: 'b', parents: ['a'] },
            { hash: 'a', parents: [] }
        ]);
        const mergeRow = result.rows.find(r => r.hash === 'f')!;
        expect(mergeRow).toBeDefined();
        // The merge commit's row must contain a curve reaching another lane.
        const curves = mergeRow.paths.filter(p => p.d.includes('C '));
        expect(curves.length).toBeGreaterThanOrEqual(1);
    });

    it('keeps colors stable per lane', () => {
        const result = layoutGraph([
            { hash: 'c', parents: ['b'] },
            { hash: 'b', parents: ['a'] },
            { hash: 'a', parents: [] }
        ]);
        expect(result.rows[0].colorIndex).toBe(result.rows[2].colorIndex);
    });

    it('handles empty input', () => {
        const result = layoutGraph([]);
        expect(result.rows).toHaveLength(0);
        expect(result.laneCount).toBe(1);
    });

    it('emits node coordinates within row bounds', () => {
        const result = layoutGraph([
            { hash: 'b', parents: ['a'] },
            { hash: 'a', parents: [] }
        ]);
        for (const row of result.rows) {
            expect(row.col).toBeLessThan(result.laneCount);
            expect(row.col).toBeGreaterThanOrEqual(0);
        }
    });
});
