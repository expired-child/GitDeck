import type { ReactNode } from 'react';

/**
 * Empty / error states (document §90).
 */
export function EmptyState({ message, hint, children }: {
    message: string;
    hint?: string;
    children?: ReactNode;
}): JSX.Element {
    return (
        <div className="git-empty">
            <div className="git-empty-icon">⎇</div>
            <div className="git-empty-message">{message}</div>
            {hint ? <div className="git-empty-hint">{hint}</div> : null}
            {children ? <div className="git-empty-actions">{children}</div> : null}
        </div>
    );
}
