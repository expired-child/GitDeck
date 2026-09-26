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
            void store.showInputDialog({ title: 'New Branch from Here', placeholder: 'Branch name' }).then(name => {
                if (name?.trim()) { void store.createBranch(name, commit.hash, true); }
            });
        } },
        { label: 'New Tag...', action: () => {
            void store.showInputDialog({ title: 'New Tag', placeholder: 'Tag name' }).then(name => {
                if (name?.trim()) { void store.createTag(name, commit.hash); }
            });
        } },
        { separator: true },
        { label: 'Cherry-Pick', action: () => void store.cherryPick(commit.hash) },
        {
            label: 'Reset Current Branch to Here...',
            action: () => {
                // IDEA-style mode chooser (Soft / Mixed / Hard).
                void store.showInputDialog({
                    title: 'Reset Current Branch to Here',
                    options: [
                        { value: 'soft', label: 'Soft', description: 'Keep changes staged' },
                        { value: 'mixed', label: 'Mixed', description: 'Keep changes in working tree' },
                        { value: 'hard', label: 'Hard', description: 'Discard all uncommitted changes' }
                    ],
                    confirmLabel: 'Reset'
                }).then(mode => {
                    if (mode === 'soft' || mode === 'mixed' || mode === 'hard') {
                        void store.resetTo(commit.hash, mode);
                    }
                });
            }
        },
        { label: 'Revert Commit', action: () => void store.revertCommit(commit.hash) },
        {
            // IDEA: only the current branch tip can be undone.
            label: 'Undo Commit...',
            disabled: store.status?.head.commit !== commit.hash || commit.parents.length === 0,
            danger: true,
            action: () => {
                const parent = commit.parents[0];
                void store.showInputDialog({
                    title: `Undo Commit "${commit.subject}"?`,
                    confirmOnly: true,
                    confirmLabel: 'Undo',
                    danger: true
                }).then(ok => {
                    if (ok !== null) { void store.undoCommit(commit.hash, parent, commit.subject); }
                });
            }
        },
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
            className={`git-commit-row${selectedHash === commit.hash ? ' selected' : ''}${index % 2 ? ' odd' : ''}${commit.localOnly ? ' local-only' : ''}`}
            role="button"
            tabIndex={0}
            aria-pressed={selectedHash === commit.hash}
            title={commit.localOnly ? 'Local commit — not pushed to any remote yet' : undefined}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void selectCommit(commit.hash); } }}
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
            <span className="git-commit-author" title={commit.authorName}>{commit.authorName}</span>
            <span className="git-commit-date">
                {formatDate(commit.date)}
            </span>
            <span className="git-commit-hash mono">{commit.hash.slice(0, 7)}</span>
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
            <SplitPane sizes={splitSizes} onResize={setSplitSizes}>
                <BranchesPanel />
                <div className="git-commits">
                    <Toolbar>
                        <ToolbarButton icon="refresh" title="Refresh" onClick={() => void refresh(true)} />
                        <input
                            className="git-search-input"
                            placeholder="Search commits..."
                            aria-label="Search commits"
                            value={filter.text ?? ''}
                            onChange={e => setFilter({ text: e.target.value || undefined })}
                        />
                        <input
                            className="git-filter-input"
                            placeholder="Author"
                            aria-label="Filter by author"
                            value={filter.authors?.[0] ?? ''}
                            onChange={e => setFilter({ authors: e.target.value ? [e.target.value] : undefined })}
                        />
                        <input
                            className="git-filter-input"
                            placeholder="Path"
                            aria-label="Filter by path"
                            value={filter.paths?.[0] ?? ''}
                            onChange={e => setFilter({ paths: e.target.value ? [e.target.value] : undefined })}
                        />
                        <ToolbarButton icon="clear-all" title="Clear all filters" onClick={() => setFilter({ text: undefined, authors: undefined, paths: undefined, branches: undefined, after: undefined, before: undefined })} />
                    </Toolbar>
                    <div className="git-log-scope">
                        <span title={filter.branches?.join(', ') ?? 'All branches'}>{filter.branches?.join(', ') ?? 'All branches'}</span>
                        <span>{commits.length}{hasMore ? '+' : ''} commits</span>
                    </div>
                    <div className="git-log-columns" aria-hidden="true"><span>Graph / Commit message</span><span>Author</span><span>Date</span><span>Hash</span></div>
                    {commits.length === 0 && !logLoading ? (
                        <div className="git-empty">{Object.values(filter).some(Boolean) ? 'No commits match these filters.' : 'No commits yet.'}</div>
                    ) : (
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
                    )}
                    {logLoading && <div className="git-loading" role="status">Loading…</div>}
                </div>
                <CommitDetailsPanel />
            </SplitPane>
        </div>
    );
}
