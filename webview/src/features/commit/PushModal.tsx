import { useGitStore } from '../../store/gitStore';

/**
 * Push preview dialog (document §32): lists the commits ahead of upstream.
 */
export function PushModal(): JSX.Element | null {
    const preview = useGitStore(s => s.pushPreview);
    const push = useGitStore(s => s.push);
    const set = (patch: { pushPreview?: undefined }) => useGitStore.setState(patch);

    if (!preview) {
        return null;
    }

    const doCommitFirst = useGitStore.getState().commitMessage !== ''
        || Object.values(useGitStore.getState().checked).some(Boolean);

    return (
        <div className="git-modal-backdrop" onClick={() => set({ pushPreview: undefined })}>
            <div className="git-modal" onClick={e => e.stopPropagation()}>
                <div className="git-modal-title">
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
