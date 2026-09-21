import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useGitStore } from '../store/gitStore';

/**
 * Custom context menu rendered from store state (document §38).
 */
export function ContextMenu(): JSX.Element | null {
    const menu = useGitStore(s => s.menu);
    const close = useGitStore(s => s.closeMenu);
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!menu) { return; }
        const onClick = () => close();
        window.addEventListener('click', onClick);
        window.addEventListener('contextmenu', onClick);
        return () => {
            window.removeEventListener('click', onClick);
            window.removeEventListener('contextmenu', onClick);
        };
    }, [menu, close]);

    if (!menu) {
        return null;
    }

    const style: CSSProperties = {
        left: Math.min(menu.x, window.innerWidth - 220),
        top: Math.min(menu.y, window.innerHeight - menu.items.length * 24 - 12)
    };

    return (
        <div ref={ref} className="git-context-menu" style={style}>
            {menu.items.map((item, i) => item.separator
                ? <div key={i} className="git-context-menu-separator" />
                : (
                    <button
                        key={i}
                        className={`git-context-menu-item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}`}
                        disabled={item.disabled}
                        onClick={() => {
                            close();
                            item.action?.();
                        }}
                    >
                        {item.label}
                    </button>
                ))}
        </div>
    );
}
