import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useGitStore } from '../store/gitStore';
import type { MenuItem } from '../store/gitStore';

function MenuItems({ items }: { items: MenuItem[] }): JSX.Element {
    return (
        <>
            {items.map((item, i) => item.separator
                ? <div key={i} className="git-context-menu-separator" />
                : item.items
                    ? (
                        <div key={i} className="git-context-menu-has-submenu">
                            <button className="git-context-menu-item git-context-menu-with-sub" disabled={item.disabled}>
                                <span className="git-context-menu-label">{item.label}</span>
                                <i className="codicon codicon-chevron-right" />
                            </button>
                            <div className="git-context-menu git-context-submenu">
                                <MenuItems items={item.items} />
                            </div>
                        </div>
                    )
                    : (
                        <button
                            key={i}
                            className={`git-context-menu-item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}`}
                            disabled={item.disabled}
                            onClick={() => item.action?.()}
                        >
                            {item.label}
                        </button>
                    ))}
        </>
    );
}

/**
 * Custom context menu rendered from store state (document §38).
 * Supports one nested submenu level, mirroring IDEA's Git menus.
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
        left: Math.min(menu.x, window.innerWidth - 240),
        top: Math.min(menu.y, window.innerHeight - menu.items.length * 24 - 12)
    };

    return (
        <div ref={ref} className="git-context-menu" style={style}>
            <MenuItems items={menu.items} />
        </div>
    );
}
