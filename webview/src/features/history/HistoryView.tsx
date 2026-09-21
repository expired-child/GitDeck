import { useGitStore } from '../../store/gitStore';
import { Toolbar, ToolbarButton } from '../../components/Toolbar';

/**
 * File history (document §36): git log --follow for a single file.
 */
export function HistoryView(): JSX.Element {
    const historyPath = useGitStore(s => s.historyPath);
    const setHistoryPath = useGitStore(s => s.setHistoryPath);
    const entries = useGitStore(s => s.historyEntries);
    const loading = useGitStore(s => s.historyLoading);
    const loadHistory = useGitStore(s => s.loadHistory);
    const showDiff = useGitStore(s => s.showDiff);
    const activeRepoId = useGitStore(s => s.activeRepoId);

    return (
        <div className="git-history-view">
            <Toolbar>
                <input
                    className="git-search-input"
                    placeholder="File path"
                    value={historyPath}
                    onChange={e => setHistoryPath(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            void loadHistory(historyPath);
                        }
                    }}
                />
                <ToolbarButton icon="refresh" title="Show History" onClick={() => void loadHistory(historyPath)} />
            </Toolbar>
            {loading && <div className="git-loading">Loading…</div>}
            {!loading && entries.length === 0 && (
                <div className="git-empty">No history for this file.</div>
            )}
            <div className="git-history-list">
                {entries.map(entry => (
                    <div
                        key={entry.hash}
                        className="git-history-row"
                        onClick={() => void showDiff({
                            kind: 'commit-file',
                            path: historyPath,
                            hash: entry.hash,
                            repositoryId: activeRepoId ?? ''
                        })}
                        title="Show diff at this revision"
                    >
                        <span className="git-commit-subject">{entry.subject}</span>
                        <span className="git-commit-author">{entry.author}</span>
                        <span className="git-commit-date">{entry.hash.slice(0, 7)} · {new Date(entry.date).toLocaleDateString()}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
