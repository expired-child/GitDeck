import { GRAPH_DEFAULTS } from './GraphLayout';
import type { GraphRowRender } from './GraphLayout';

/**
 * Renders one graph row as an inline SVG (document §15: SVG over Canvas).
 */
export function GraphRowSvg({ row, laneCount, laneWidth, rowHeight }: {
    row: GraphRowRender;
    laneCount: number;
    laneWidth: number;
    rowHeight: number;
}): JSX.Element {
    const width = Math.max(laneCount * laneWidth, laneWidth);
    return (
        <svg
            className="git-graph-svg"
            width={width}
            height={rowHeight}
            viewBox={`0 0 ${width} ${rowHeight}`}
        >
            {row.paths.map((p, i) => (
                <path
                    key={i}
                    d={p.d}
                    className={`git-graph-line git-graph-color-${p.colorIndex % 7}`}
                />
            ))}
            <circle
                cx={row.col * laneWidth + GRAPH_DEFAULTS.nodeX}
                cy={rowHeight / 2}
                r={GRAPH_DEFAULTS.radius}
                className={`git-graph-node git-graph-color-${row.colorIndex % 7}`}
            />
        </svg>
    );
}
