import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/**
 * Minimal windowed list (document §17): renders only the visible window plus
 * overscan, mandatory for large repositories.
 */
export function VirtualList({ itemCount, rowHeight, overscan = 12, renderRow, onNearBottom }: {
    itemCount: number;
    rowHeight: number;
    overscan?: number;
    renderRow: (index: number) => ReactNode;
    onNearBottom?: () => void;
}): JSX.Element {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(600);
    const nearBottomRef = useRef(false);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) { return; }
        const observer = new ResizeObserver(() => setViewportHeight(el.clientHeight));
        observer.observe(el);
        setViewportHeight(el.clientHeight);
        return () => observer.disconnect();
    }, []);

    const onScroll = useCallback(() => {
        const el = containerRef.current;
        if (!el) { return; }
        setScrollTop(el.scrollTop);
        const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (onNearBottom && distanceToBottom < rowHeight * 4) {
            if (!nearBottomRef.current) {
                nearBottomRef.current = true;
                onNearBottom();
            }
        } else {
            nearBottomRef.current = false;
        }
    }, [onNearBottom, rowHeight]);

    const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
    const last = Math.min(itemCount, first + visibleCount);
    const items: ReactNode[] = [];
    for (let i = first; i < last; i++) {
        const style: CSSProperties = {
            position: 'absolute',
            top: i * rowHeight,
            height: rowHeight,
            left: 0,
            right: 0
        };
        items.push(
            <div key={i} style={style} className="git-virtual-row">
                {renderRow(i)}
            </div>
        );
    }

    return (
        <div ref={containerRef} className="git-virtual-list" onScroll={onScroll}>
            <div style={{ height: itemCount * rowHeight, position: 'relative' }}>
                {items}
            </div>
        </div>
    );
}
