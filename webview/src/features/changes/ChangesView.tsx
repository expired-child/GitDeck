import { useGitStore } from '../../store/gitStore';
import type { FileChangeDto, ChangeStatusCode } from '../../bridge/protocol';

const STATUS_LABEL: Record<ChangeStatusCode, string> = {
    M: 'M', A: 'A', D: 'D', R: 'R', C: 'C', U: 'U', '?': '?', '!': '!'
};

function statusClass(status: ChangeStatusCode): string {
    switch (status) {
        case 'M': return 'modified';
        case 'A': return 'added';
        case 'D': return 'deleted';
        case 'R': return 'renamed';
        case 'C': return 'renamed';
        case 'U': return 'conflict';
        case '?': return 'untracked';
        default: return 'ignored';
    }
}

function ChangeRow({ change }: { change: FileChangeDto }): JSX.Element {
    const checked = useGitStore(s => s.checked[change.path] ?? false);
    const setChecked = useGitStore(s => s.setChecked);
    const openMenu = useGitStore(s => s.openMenu);
    const showDiff = useGitStore(s => s.showDiff);
    const openFile = useGitStore(s => s.openFile);
    const addFiles = useGitStore(s => s.addFiles);
    const unstageFiles = useGitStore(s => s.unstageFiles);
    const discardFiles = useGitStore(s => s.discardFiles);
    const ignoreFile = useGitStore(s => s.ignoreFile);
    const activeRepoId = useGitStore(s => s.activeRepoId);
    const setActiveTab = useGitStore(s => s.setActiveTab);
    const loadHistory = useGitStore(s => s.loadHistory);
    const setHistoryPath = useGitStore(s => s.setHistoryPath);

    const diffTarget = (kind: 'worktree' | 'index' | 'untracked' | 'deleted') => ({
        kind,
        path: change.path,
        originalPath: change.originalPath,
        repositoryId: activeRepoId ?? ''
    });

    return (
        <div
            className="git-file-row"
            onClick={() => {
                if (change.status === '?') {
                    void openFile(change.path);
                } else {
                    void showDiff(diffTarget(change.staged ? 'index' : change.status === 'D' ? 'deleted' : 'worktree'));
                }
            }}
            onContextMenu={e => {
                e.preventDefault();
                openMenu(e.clientX, e.clientY, [
                    { label: 'Show Diff', action: () => void showDiff(diffTarget(change.staged ? 'index' : change.status === 'D' ? 'deleted' : change.status === '?' ? 'untracked' : 'worktree')) },
                    { label: 'Open File', action: () => void openFile(change.path) },
                    { separator: true },
                    change.staged
                        ? { label: 'Unstage', action: () => void unstageFiles([change.path]) }
                        : { label: 'Add', action: () => void addFiles([change.path]) },
                    { label: 'Discard', danger: true, action: () => void discardFiles([change.path]) },
                    { separator: true },
                    { label: 'Show History', action: () => { setHistoryPath(change.path); void loadHistory(change.path); setActiveTab('history'); } },
                    { label: 'Add to .gitignore', action: () => void ignoreFile(change.path) },
                    { label: 'Copy Relative Path', action: () => void navigator.clipboard.writeText(change.path) }
                ]);
            }}
        >
            <input
                type="checkbox"
                checked={checked}
                onClick={e => e.stopPropagation()}
                onChange={e => setChecked(change.path, e.target.checked)}
            />
            <span className={`git-file-path${checked ? '' : ' unchecked'}`}>
                {change.originalPath ? `${change.originalPath} → ${change.path}` : change.path}
            </span>
            <span className={`git-file-status ${statusClass(change.status)}`}>
                {STATUS_LABEL[change.status]}
            </span>
        </div>
    );
}

function FileGroup({ title, changes, groupKey }: {
    title: string;
    changes: FileChangeDto[];
    groupKey: string;
}): JSX.Element | null {
    const collapsed = useGitStore(s => s.collapsedGroups[groupKey] ?? false);
    const toggle = useGitStore(s => s.toggleGroup);
    if (changes.length === 0) {
        return null;
    }
    return (
        <div className="git-file-group">
            <div className="git-group-header" onClick={() => toggle(groupKey)}>
                <i className={`codicon codicon-chevron-${collapsed ? 'right' : 'down'}`} />
                <span>{title} ({changes.length})</span>
            </div>
            {!collapsed && changes.map(change => (
                <ChangeRow key={`${change.path}-${change.staged}`} change={change} />
            ))}
        </div>
    );
}

export function ChangesView(): JSX.Element {
    const status = useGitStore(s => s.status);
    const setAllChecked = useGitStore(s => s.setAllChecked);
    const refreshStatus = useGitStore(s => s.refreshStatus);
    const loadStashes = useGitStore(s => s.loadStashes);
    const stashChanges = useGitStore(s => s.stashChanges);
    const applyStash = useGitStore(s => s.applyStash);
    const openMenu = useGitStore(s => s.openMenu);

    if (!status) {
        return <div className="git-empty">No local changes.</div>;
    }

    const hasConflicts = status.conflicts.length > 0;

    return (
        <div className="git-changes">
            {status.state !== 'NORMAL' && (
                <div className="git-state-banner">
                    <span className="git-state-label">
                        {status.state}
                        {status.rebaseProgress ? ` ${status.rebaseProgress.current} / ${status.rebaseProgress.total}` : ''}
                    </span>
                    <button onClick={() => void useGitStore.getState().operationContinue()}>Continue</button>
                    {status.state === 'REBASING' && (
                        <button onClick={() => void useGitStore.getState().operationSkip()}>Skip</button>
                    )}
                    <button className="danger" onClick={() => void useGitStore.getState().operationAbort()}>Abort</button>
                </div>
            )}
            <div className="git-changes-toolbar">
                <button title="Refresh" onClick={() => void refreshStatus()}><i className="codicon codicon-refresh" /></button>
                <button title="Check all" onClick={() => setAllChecked(true)}>All</button>
                <button title="Check none" onClick={() => setAllChecked(false)}>None</button>
                <span className="git-toolbar-spacer" />
                <button
                    title="Stash changes"
                    onClick={e => {
                        openMenu(e.clientX, e.clientY, [
                            { label: 'Stash Changes...', action: () => void stashChanges(window.prompt('Stash message') ?? undefined) },
                            { label: 'Load Stashes', action: () => void loadStashes() },
                            ...(useGitStore.getState().stashes.length > 0
                                ? useGitStore.getState().stashes.map(s => ({
                                    label: `Apply #${s.index} ${s.message.slice(0, 40)}`,
                                    action: () => void applyStash(s.index, true)
                                }))
                                : [])
                        ]);
                    }}
                >
                    <i className="codicon codicon-archive" /> Stash
                </button>
            </div>
            {hasConflicts && (
                <FileGroup title="Merge Conflicts" changes={status.conflicts} groupKey="conflicts" />
            )}
            <FileGroup title="Changes" changes={status.changes} groupKey="changes" />
            <FileGroup title="Unversioned Files" changes={status.untracked} groupKey="untracked" />
            {status.changes.length + status.untracked.length + status.conflicts.length === 0 && (
                <div className="git-empty">No local changes.</div>
            )}
        </div>
    );
}
