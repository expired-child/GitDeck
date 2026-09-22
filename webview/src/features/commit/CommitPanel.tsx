import { useState } from 'react';
import { useGitStore } from '../../store/gitStore';

/**
 * Commit message area + action buttons (document §10.1, §11).
 */
export function CommitPanel(): JSX.Element | null {
    const status = useGitStore(s => s.status);
    const commitMessage = useGitStore(s => s.commitMessage);
    const setCommitMessage = useGitStore(s => s.setCommitMessage);
    const amend = useGitStore(s => s.amend);
    const setAmend = useGitStore(s => s.setAmend);
    const messageHistory = useGitStore(s => s.messageHistory);
    const commit = useGitStore(s => s.commit);
    const commitBusy = useGitStore(s => s.commitBusy);
    const [historyOpen, setHistoryOpen] = useState(false);

    const hasSelection = useGitStore(s => Object.values(s.checked).some(Boolean));
    if (!status) {
        return null;
    }
    const isBusy = status.state !== 'NORMAL' || commitBusy;
    const canCommit = !isBusy && (hasSelection || amend) && Boolean(commitMessage.trim());

    return (
        <div className="git-commit-panel">
            <div className="git-commit-message-wrap">
                <textarea
                    className="git-commit-message"
                    placeholder="Commit message"
                    aria-label="Commit message"
                    value={commitMessage}
                    onChange={e => setCommitMessage(e.target.value)}
                    onKeyDown={e => {
                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canCommit) {
                            void commit(false);
                        }
                    }}
                />
                {messageHistory.length > 0 && (
                    <button
                        className="git-history-toggle"
                        title="Commit message history"
                        onClick={() => setHistoryOpen(o => !o)}
                    >
                        <i className="codicon codicon-history" />
                    </button>
                )}
                {historyOpen && (
                    <div className="git-message-history">
                        {messageHistory.map((message, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    setCommitMessage(message);
                                    setHistoryOpen(false);
                                }}
                            >
                                {message.length > 60 ? `${message.slice(0, 60)}…` : message}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <label className="git-amend-row">
                <input
                    type="checkbox"
                    checked={amend}
                    onChange={e => void setAmend(e.target.checked)}
                />
                Amend
            </label>
            <div className="git-commit-buttons">
                <button
                    className="git-primary-button"
                    disabled={!canCommit}
                    onClick={() => void commit(false)}
                >
                    {commitBusy ? 'Committing…' : 'Commit'}
                </button>
                <button
                    className="git-secondary-button"
                    disabled={!canCommit}
                    onClick={() => void commit(true)}
                    title="Commit, then review and push"
                >
                    Commit &amp; Push…
                </button>
            </div>
        </div>
    );
}
