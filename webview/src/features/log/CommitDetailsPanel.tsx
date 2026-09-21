import { useGitStore } from '../../store/gitStore';
import type { CommitFileDto } from '../../bridge/protocol';

function fileMenu(file: CommitFileDto): Parameters<ReturnType<typeof useGitStore.getState>['openMenu']>[2] {
    const store = useGitStore.getState();
    const repoId = store.activeRepoId ?? '';
    return [
        { label: 'Show Diff', action: () => void store.showDiff({ kind: 'commit-file', path: file.path, originalPath: file.originalPath, hash: store.selectedHash, repositoryId: repoId }) },
        { label: 'Open File', action: () => void store.openFile(file.path) },
        { separator: true },
        { label: 'Copy Path', action: () => void navigator.clipboard.writeText(file.path) }
    ];
}

function ChangedFiles(): JSX.Element {
    const files = useGitStore(s => s.selectedFiles);
    const selectedHash = useGitStore(s => s.selectedHash);
    const showDiff = useGitStore(s => s.showDiff);
    const openMenu = useGitStore(s => s.openMenu);
    const activeRepoId = useGitStore(s => s.activeRepoId);

    if (!selectedHash) {
        return <div className="git-details-section" />;
    }
    return (
        <div className="git-details-section">
            <div className="git-section-title">Changed Files ({files.length})</div>
            {files.length === 0 && <div className="git-empty">Loading…</div>}
            {files.map(file => (
                <div
                    key={file.path}
                    className="git-file-row"
                    onClick={() => void showDiff({
                        kind: 'commit-file',
                        path: file.path,
                        originalPath: file.originalPath,
                        hash: selectedHash,
                        repositoryId: activeRepoId ?? ''
                    })}
                    onContextMenu={e => {
                        e.preventDefault();
                        openMenu(e.clientX, e.clientY, fileMenu(file));
                    }}
                >
                    <span className="git-file-path">{file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}</span>
                    <span className={`git-file-status ${file.status === 'A' ? 'added' : file.status === 'D' ? 'deleted' : 'modified'}`}>
                        {file.status}
                    </span>
                </div>
            ))}
        </div>
    );
}

function CommitDetails(): JSX.Element {
    const details = useGitStore(s => s.selectedDetails);
    const selectedHash = useGitStore(s => s.selectedHash);
    const openMenu = useGitStore(s => s.openMenu);

    if (!selectedHash) {
        return <div className="git-details-section" />;
    }
    if (!details) {
        return <div className="git-details-section"><div className="git-empty">Loading…</div></div>;
    }
    return (
        <div
            className="git-details-section"
            onContextMenu={e => {
                e.preventDefault();
                const store = useGitStore.getState();
                openMenu(e.clientX, e.clientY, [
                    { label: 'Checkout Revision', action: () => void store.checkoutRevision(selectedHash) },
                    { label: 'New Branch from Here...', action: () => {
                        const name = window.prompt('New branch name');
                        if (name) { void store.createBranch(name, selectedHash, true); }
                    } },
                    { label: 'New Tag...', action: () => {
                        const name = window.prompt('Tag name');
                        if (name) { void store.createTag(name, selectedHash); }
                    } },
                    { separator: true },
                    { label: 'Cherry-Pick', action: () => void store.cherryPick(selectedHash) },
                    { label: 'Revert Commit', action: () => void store.revertCommit(selectedHash) },
                    { separator: true },
                    { label: 'Reset Current Branch to Here (Soft)', action: () => void store.resetTo(selectedHash, 'soft') },
                    { label: 'Reset Current Branch to Here (Mixed)', action: () => void store.resetTo(selectedHash, 'mixed') },
                    { label: 'Reset Current Branch to Here (Hard)', danger: true, action: () => void store.resetTo(selectedHash, 'hard') },
                    { separator: true },
                    { label: 'Copy Revision Number', action: () => void navigator.clipboard.writeText(selectedHash) },
                    { label: 'Copy Commit Message', action: () => void navigator.clipboard.writeText(details.subject) }
                ]);
            }}
        >
            <div className="git-section-title">Commit Details</div>
            <div className="git-detail-grid">
                <div className="git-detail-label">Commit</div>
                <div className="git-detail-value mono">{details.hash.slice(0, 12)}</div>
                <div className="git-detail-label">Author</div>
                <div className="git-detail-value">{details.authorName} &lt;{details.authorEmail}&gt;</div>
                <div className="git-detail-label">Date</div>
                <div className="git-detail-value">{new Date(details.date).toLocaleString()}</div>
                <div className="git-detail-label">Parents</div>
                <div className="git-detail-value mono">{details.parents.map(p => p.slice(0, 7)).join(', ') || '—'}</div>
                {details.refs.length > 0 && (
                    <>
                        <div className="git-detail-label">Branches</div>
                        <div className="git-detail-value">
                            {details.refs.map(ref => <span key={ref} className="git-ref-badge">{ref}</span>)}
                        </div>
                    </>
                )}
                <div className="git-detail-label">Message</div>
                <div className="git-detail-value pre">{details.body || details.subject}</div>
            </div>
        </div>
    );
}

/**
 * Right column of the Log view (document §18, §19): Changed Files + Details.
 */
export function CommitDetailsPanel(): JSX.Element {
    return (
        <div className="git-commit-details">
            <ChangedFiles />
            <CommitDetails />
        </div>
    );
}
