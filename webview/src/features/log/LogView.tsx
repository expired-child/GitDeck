import { useGitStore } from '../../store/gitStore';
import { VirtualList } from '../../components/VirtualList';
import { SplitPane } from '../../components/SplitPane';
import { Toolbar, ToolbarButton } from '../../components/Toolbar';
import { CommitGraphCell, useCommitGraph } from '../../graph/CommitGraph';
import { BranchesPanel } from './BranchesPanel';
import { CommitDetailsPanel } from './CommitDetailsPanel';
import type { CommitDto } from '../../bridge/protocol';

function commitMenu(commit: CommitDto): Parameters<ReturnType<typeof useGitStore.getState>['openMenu']>[2] {
    const store = useGitStore.getState();
    return [
        { label: 'Show Diff', action: () => {
            void store.selectCommit(commit.hash);
            store.setActiveTab('log');
        } },
        { separator: true },
        { label: 'Checkout Revision', action: () => void store.checkoutRevision(commit.hash) },
        { label: 'New Branch from Here...', action: () => {
            const name = window.prompt('New branch name');
            if (name) { void store.createBranch(name, commit.hash, true); }
        } },
        { label: 'New Tag...', action: () => {
            const name = window.prompt('Tag name');
            if (name) { void store.createTag(name, commit.hash); }
        } },
        { separator: true },
        { label: 'Cherry-Pick', action: () => void store.cherryPick(commit.hash) },
        { label: 'Revert Commit', action: () => void store.revertCommit(commit.hash) },
        { separator: true },
        { label: 'Reset Current Branch to Here (Soft)', action: () => void store.resetTo(commit.hash, 'soft') },
        { label: 'Reset Current Branch to Here (Mixed)', action: () => void store.resetTo(commit.hash, 'mixed') },
        { label: 'Reset Current Branch to Here (Hard)', danger: true, action: () => void store.resetTo(commit.hash, 'hard') },
        { separator: true },
        { label: 'Copy Revision Number', action: () => void navigator.clipboard.writeText(commit.hash) },
        { label: 'Copy Commit Message', action: () => void navigator.clipboard.writeText(commit.subject) }
    ];
}

function CommitRow({ commit, index, layout }: { commit: CommitDto; index: number; layout: ReturnType<typeof useCommitGraph>['layout'] }): JSX.Element {
    const selectedHash = useGitStore(s => s.selectedHash);
    const selectCommit = useGitStore(s => s.selectCommit);
    const openMenu = useGitStore(s => s.openMenu);
    const showGraph = layout !== null;

    return (
        <div
            className={`git-commit-row${selectedHash === commit.hash ? ' selected' : ''}${index % 2 ? ' odd' : ''}`}
            onClick={() => void selectCommit(commit.hash)}
            onContextMenu={e => {
                e.preventDefault();
                openMenu(e.clientX, e.clientY, commitMenu(commit));
            }}
        >
            {showGraph && layout ? (
                <span className="git-commit-graph-cell">
                    <CommitGraphCell layout={layout} hash={commit.hash} />
                </span>
            ) : null}
            <span className="git-commit-refs">
                {commit.refs.map(ref => (
                    <span
                        key={ref}
                        className={`git-ref-badge${ref.startsWith('tag:') ? ' tag' : ref.startsWith('HEAD') ? ' head' : ref.includes('/') ? ' remote' : ' local'}`}
                    >
                        {ref.replace(/^HEAD -> /, '')}
                    </span>
                ))}
            </span>
            <span className="git-commit-subject" title={commit.subject}>{commit.subject}</span>
            <span className="git-commit-author">{commit.authorName}</span>
            <span className="git-commit-date">
                {formatDate(commit.date)}
            </span>
        </div>
    );
}

function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) { return iso; }
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
        return d.toTimeString().slice(0, 5);
    }
    return d.toISOString().slice(0, 10);
}

const ROW_HEIGHT = 28;

/**
 * Git Log: Branches | Commits (graph) | Details, three draggable columns
 * (document §13, §20, §88).
 */
export function LogView(): JSX.Element {
    const commits = useGitStore(s => s.commits);
    const hasMore = useGitStore(s => s.hasMore);
    const logLoading = useGitStore(s => s.logLoading);
    const loadCommits = useGitStore(s => s.loadCommits);
    const refresh = useGitStore(s => s.loadCommits);
    const filter = useGitStore(s => s.filter);
    const setFilter = useGitStore(s => s.setFilter);
    const splitSizes = useGitStore(s => s.splitSizes);
    const setSplitSizes = useGitStore(s => s.setSplitSizes);
    const graphEnabled = useGitStore(s => s.showGraph);
    const { layout } = useCommitGraph(commits, graphEnabled);

    return (
        <div className="git-log-view">
            <Toolbar>
                <ToolbarButton icon="refresh" title="Refresh" onClick={() => void refresh(true)} />
                <input
                    className="git-search-input"
                    placeholder="Search commits..."
                    value={filter.text ?? ''}
                    onChange={e => setFilter({ text: e.target.value || undefined })}
                />
                <input
                    className="git-filter-input"
                    placeholder="Author"
                    value={filter.authors?.[0] ?? ''}
                    onChange={e => setFilter({ authors: e.target.value ? [e.target.value] : undefined })}
                />
                <input
                    className="git-filter-input"
                    placeholder="Path"
                    value={filter.paths?.[0] ?? ''}
                    onChange={e => setFilter({ paths: e.target.value ? [e.target.value] : undefined })}
                />
            </Toolbar>
            {commits.length === 0 && !logLoading ? (
                <div className="git-empty">No commits yet.</div>
            ) : (
                <SplitPane sizes={splitSizes} onResize={setSplitSizes}>
                    <BranchesPanel />
                    <div className="git-commits">
                        <VirtualList
                            itemCount={commits.length}
                            rowHeight={ROW_HEIGHT}
                            onNearBottom={() => {
                                if (hasMore && !logLoading) {
                                    void loadCommits(false);
                                }
                            }}
                            renderRow={i => <CommitRow commit={commits[i]} index={i} layout={layout} />}
                        />
                        {logLoading && <div className="git-loading">Loading…</div>}
                    </div>
                    <CommitDetailsPanel />
                </SplitPane>
            )}
        </div>
    );
}
