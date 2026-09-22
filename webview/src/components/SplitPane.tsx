import { useRef } from 'react';
import type { ReactNode } from 'react';

/**
 * Horizontal split pane with draggable dividers (document §88).
 * Sizes are percentages; persistence is handled by the caller (workspaceState).
 */
export function SplitPane({ sizes, onResize, children }: {
    sizes: number[];
    onResize: (sizes: number[]) => void;
    children: ReactNode[];
}): JSX.Element {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const drag = useRef<{ x: number; sizes: number[] }>();
    const resize = (index: number, delta: number, initial = sizes) => {
        const next = [...initial];
        const change = Math.max(8 - next[index], Math.min(delta, next[index + 1] - 8));
        next[index] += change;
        next[index + 1] -= change;
        onResize(next);
    };

    return (
        <div ref={containerRef} className="git-split">
            {children.map((child, i) => (
                <div key={i} className="git-split-pane" style={{ flex: `${sizes[i]} 1 0` }}>
                    {child}
                </div>
            )).flatMap((pane, i) => i < children.length - 1
                ? [pane, (
                    <div
                        key={`divider-${i}`}
                        className="git-split-divider"
                        role="separator"
                        tabIndex={0}
                        aria-label={`Resize pane ${i + 1}`}
                        aria-orientation="vertical"
                        aria-valuemin={8}
                        aria-valuemax={sizes[i] + sizes[i + 1] - 8}
                        aria-valuenow={Math.round(sizes[i])}
                        onPointerDown={e => {
                            drag.current = { x: e.clientX, sizes: [...sizes] };
                            e.currentTarget.setPointerCapture(e.pointerId);
                        }}
                        onPointerMove={e => {
                            if (!drag.current) { return; }
                            const width = (containerRef.current?.clientWidth ?? 0) - (children.length - 1) * 4;
                            if (width > 0) { resize(i, (e.clientX - drag.current.x) / width * 100, drag.current.sizes); }
                        }}
                        onPointerUp={e => { drag.current = undefined; e.currentTarget.releasePointerCapture(e.pointerId); }}
                        onLostPointerCapture={() => { drag.current = undefined; }}
                        onKeyDown={e => {
                            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                                e.preventDefault(); resize(i, e.key === 'ArrowLeft' ? -2 : 2);
                            }
                        }}
                    />
                )]
                : [pane])}
        </div>
    );
}
