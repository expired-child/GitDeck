import type { ReactNode } from 'react';

export function Toolbar({ children }: { children: ReactNode }): JSX.Element {
    return <div className="git-toolbar">{children}</div>;
}

export function ToolbarButton({ icon, title, onClick, active }: {
    icon: string;
    title: string;
    onClick: () => void;
    active?: boolean;
}): JSX.Element {
    return (
        <button
            className={`git-toolbar-button${active ? ' active' : ''}`}
            title={title}
            aria-label={title}
            onClick={onClick}
        >
            <i className={`codicon codicon-${icon}`} aria-hidden="true" />
        </button>
    );
}
