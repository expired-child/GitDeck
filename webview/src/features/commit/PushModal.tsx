import { useEffect, useRef } from 'react';
import { useGitStore } from '../../store/gitStore';

/**
 * Push preview dialog (document §32): lists the commits ahead of upstream.
 */
export function PushModal(): JSX.Element | null {
    const preview = useGitStore(s => s.pushPreview);
    const push = useGitStore(s => s.push);
    const dialog = useRef<HTMLDivElement>(null);
    const set = (patch: { pushPreview?: undefined }) => useGitStore.setState(patch);

    useEffect(() => {
        if (!preview) { return; }
        const previous = document.activeElement as HTMLElement | null;
        dialog.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
        return () => { previous?.focus(); };
    }, [preview]);

    if (!preview) {
        return null;
    }

    const doCommitFirst = useGitStore.getState().commitMessage !== ''
        || Object.values(useGitStore.getState().checked).some(Boolean);

    return (
        <div className="git-modal-backdrop" onClick={() => set({ pushPreview: undefined })}>
            <div className="git-modal" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="git-push-title"
                onClick={e => e.stopPropagation()}
                onKeyDown={e => {
                    if (e.key === 'Escape') { e.stopPropagation(); set({ pushPreview: undefined }); }
                    if (e.key === 'Tab') {
                        const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
                        if (!buttons?.length) { return; }
                        const first = buttons[0]; const last = buttons[buttons.length - 1];
                        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
                    }
                }}>
                <div className="git-modal-title" id="git-push-title">
                    Push Commits — {preview.branch} → {preview.upstream ?? '(no upstream)'}
                </div>
                <div className="git-modal-body">
                    {doCommitFirst && (
                        <div className="git-modal-hint">
                            There are uncommitted selected changes — commit first via the Commit button, or push only existing commits.
                        </div>
                    )}
                    {preview.commits.length === 0 && <div className="git-empty">Nothing to push.</div>}
                    {preview.commits.map(commit => (
                        <div key={commit.hash} className="git-push-commit">
                            <i className="codicon codicon-git-commit" />
                            <span className="mono">{commit.hash.slice(0, 7)}</span>
                            <span>{commit.subject}</span>
                        </div>
                    ))}
                </div>
                <div className="git-modal-buttons">
                    <button
                        className="git-primary-button"
                        disabled={preview.commits.length === 0}
                        onClick={() => void push(false)}
                    >
                        Push
                    </button>
                    <button
                        className="git-secondary-button"
                        disabled={preview.commits.length === 0}
                        onClick={() => {
                            if (window.confirm('Force push using --force-with-lease?')) {
                                void push(true);
                            }
                        }}
                    >
                        Force Push
                    </button>
                    <button className="git-secondary-button" onClick={() => set({ pushPreview: undefined })}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
