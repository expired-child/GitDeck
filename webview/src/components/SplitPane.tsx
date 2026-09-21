import { useCallback, useRef } from 'react';
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
    const draggingRef = useRef<number | null>(null);

    const onMouseDown = useCallback((index: number) => {
        draggingRef.current = index;
        const move = (e: MouseEvent) => {
            const container = containerRef.current;
            const dragIndex = draggingRef.current;
            if (!container || dragIndex === null) { return; }
            const rect = container.getBoundingClientRect();
            const ratio = ((e.clientX - rect.left) / rect.width) * 100;
            const next = [...sizes];
            const min = 8;
            const left = Math.max(min, Math.min(ratio, next[dragIndex] + next[dragIndex + 1] - min));
            const delta = left - next[dragIndex];
            next[dragIndex] = left;
            next[dragIndex + 1] -= delta;
            onResize(next);
        };
        const up = () => {
            draggingRef.current = null;
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
    }, [sizes, onResize]);

    return (
        <div ref={containerRef} className="git-split">
            {children.map((child, i) => (
                <div key={i} className="git-split-pane" style={{ width: `${sizes[i]}%` }}>
                    {child}
                </div>
            )).flatMap((pane, i) => i < children.length - 1
                ? [pane, (
                    <div
                        key={`divider-${i}`}
                        className="git-split-divider"
                        onMouseDown={() => onMouseDown(i)}
                    />
                )]
                : [pane])}
        </div>
    );
}
