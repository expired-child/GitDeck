import { useState } from 'react';
import type { DragEvent } from 'react';
import { useGitStore } from '../../store/gitStore';
import type { MenuItem } from '../../store/gitStore';
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

function ChangeRow({ change, groupPaths }: { change: FileChangeDto; groupPaths: string[] }): JSX.Element {
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
    const setHistoryPath = useGitStore(s => s.setHistoryPath);
    const changelists = useGitStore(s => s.changelists);
    const createChangelist = useGitStore(s => s.createChangelist);
    const moveToChangelist = useGitStore(s => s.moveToChangelist);
    const showInputDialog = useGitStore(s => s.showInputDialog);

    const diffTarget = (kind: 'worktree' | 'index' | 'untracked' | 'deleted') => ({
        kind,
        path: change.path,
        originalPath: change.originalPath,
        repositoryId: activeRepoId ?? ''
    });

    const currentChangelist = changelists.find(c => c.paths.includes(change.path))?.name;
    const checkedMap = useGitStore(s => s.checked);

    return (
        <div
            className="git-file-row"
            draggable
            onDragStart={e => {
                // Dragging a checked file moves every checked file in the same group, like IDEA.
                const groupSet = new Set(groupPaths);
                const checkedPaths = Object.keys(checkedMap).filter(p => checkedMap[p] && groupSet.has(p));
                const paths = checkedPaths.includes(change.path) ? checkedPaths : [change.path];
                e.dataTransfer.setData('application/gitdeck-paths', JSON.stringify(paths));
                e.dataTransfer.effectAllowed = 'move';
            }}
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
                    { label: 'Show History', action: () => { setHistoryPath(change.path); setActiveTab('history'); } },
                    { label: 'Add to .gitignore', action: () => void ignoreFile(change.path) },
                    { label: 'Copy Relative Path', action: () => void navigator.clipboard.writeText(change.path) },
                    { separator: true },
                    ...changelists
                        .filter(c => c.name !== currentChangelist)
                        .map(c => ({ label: `Move to ${c.name}`, action: () => void moveToChangelist(c.name, [change.path]) })),
                    {
                        label: 'New Changelist...',
                        action: () => {
                            void showInputDialog({ title: 'New Changelist', placeholder: 'Changelist name' }).then(name => {
                                if (name?.trim()) { void createChangelist(name, [change.path]); }
                            });
                        }
                    }
                ]);
            }}
        >
            <input
                type="checkbox"
                aria-label={`Include ${change.path} in commit`}
                checked={checked}
                onClick={e => e.stopPropagation()}
                onChange={e => setChecked(change.path, e.target.checked)}
            />
            <i className="codicon codicon-file git-file-icon" aria-hidden="true" />
            <span className={`git-file-path${checked ? '' : ' unchecked'}`} title={change.originalPath ? `${change.originalPath} → ${change.path}` : change.path}>
                {change.path.split('/').pop()}
                <span className="git-file-directory">{change.path.includes('/') ? change.path.slice(0, change.path.lastIndexOf('/')) : ''}</span>
            </span>
            <span className={`git-file-status ${statusClass(change.status)}`}>
                {STATUS_LABEL[change.status]}
            </span>
        </div>
    );
}

function FileGroup({ title, changes, groupKey, headerMenu, renderWhenEmpty, onDropPaths }: {
    title: string;
    changes: FileChangeDto[];
    groupKey: string;
    headerMenu?: (changes: FileChangeDto[]) => MenuItem[];
    /** Custom changelists stay visible even when empty, like IDEA. */
    renderWhenEmpty?: boolean;
    /** Accepts files dragged from another group (IDEA-style move). */
    onDropPaths?: (paths: string[]) => void;
}): JSX.Element | null {
    const collapsed = useGitStore(s => s.collapsedGroups[groupKey] ?? false);
    const toggle = useGitStore(s => s.toggleGroup);
    const checked = useGitStore(s => s.checked);
    const setChecked = useGitStore(s => s.setChecked);
    const openMenu = useGitStore(s => s.openMenu);
    const [dragOver, setDragOver] = useState(false);
    const allChecked = changes.length > 0 && changes.every(change => checked[change.path]);
    const someChecked = changes.some(change => checked[change.path]);
    const groupPaths = changes.map(change => change.path);
    if (changes.length === 0 && !renderWhenEmpty) {
        return null;
    }
    const dropHandlers = onDropPaths ? {
        onDragOver: (e: DragEvent<HTMLDivElement>) => {
            if (!e.dataTransfer.types.includes('application/gitdeck-paths')) { return; }
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDragOver(true);
        },
        onDragLeave: (e: DragEvent<HTMLDivElement>) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) { return; }
            setDragOver(false);
        },
        onDrop: (e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setDragOver(false);
            try {
                const raw = e.dataTransfer.getData('application/gitdeck-paths');
                const paths: string[] = raw ? JSON.parse(raw) : [];
                if (paths.length > 0) { onDropPaths(paths); }
            } catch {
                // ignore malformed drag payloads
            }
        }
    } : {};
    return (
        <div className={`git-file-group${dragOver ? ' drag-over' : ''}`} {...dropHandlers}>
            <div
                className="git-group-header"
                onContextMenu={e => {
                    if (!headerMenu) { return; }
                    e.preventDefault();
                    openMenu(e.clientX, e.clientY, headerMenu(changes));
                }}
            >
                <button className="git-toolbar-button" aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${title}`} aria-expanded={!collapsed} onClick={() => toggle(groupKey)}>
                    <i className={`codicon codicon-chevron-${collapsed ? 'right' : 'down'}`} />
                </button>
                <input type="checkbox" aria-label={`Include all ${title}`} checked={allChecked}
                    ref={el => { if (el) { el.indeterminate = someChecked && !allChecked; } }}
                    onChange={e => changes.forEach(change => setChecked(change.path, e.target.checked))} />
                <button className="git-toolbar-text-button" onClick={() => toggle(groupKey)}>{title} ({changes.length})</button>
            </div>
            {!collapsed && changes.length === 0 && <div className="git-empty-group">Changelist is empty</div>}
            {!collapsed && changes.map(change => (
                <ChangeRow key={`${change.path}-${change.staged}`} change={change} groupPaths={groupPaths} />
            ))}
        </div>
    );
}

export function ChangesView(): JSX.Element {
    const status = useGitStore(s => s.status);
    const changelists = useGitStore(s => s.changelists);
    const setAllChecked = useGitStore(s => s.setAllChecked);
    const refreshStatus = useGitStore(s => s.refreshStatus);
    const loadStashes = useGitStore(s => s.loadStashes);
    const stashChanges = useGitStore(s => s.stashChanges);
    const applyStash = useGitStore(s => s.applyStash);
    const openMenu = useGitStore(s => s.openMenu);
    const createChangelist = useGitStore(s => s.createChangelist);
    const deleteChangelist = useGitStore(s => s.deleteChangelist);
    const renameChangelist = useGitStore(s => s.renameChangelist);
    const showInputDialog = useGitStore(s => s.showInputDialog);
    const createPatch = useGitStore(s => s.createPatch);
    const shelveChanges = useGitStore(s => s.shelveChanges);
    const unassignFromChangelist = useGitStore(s => s.unassignFromChangelist);
    const setChecked = useGitStore(s => s.setChecked);
    const discardFiles = useGitStore(s => s.discardFiles);
    const moveToChangelist = useGitStore(s => s.moveToChangelist);

    if (!status) {
        return <div className="git-empty">No local changes.</div>;
    }

    const hasConflicts = status.conflicts.length > 0;
    const allChanges = [...status.conflicts, ...status.changes, ...status.untracked];
    const assigned = new Map<string, string>();
    for (const changelist of changelists) {
        for (const p of changelist.paths) {
            if (!assigned.has(p)) { assigned.set(p, changelist.name); }
        }
    }
    const unassigned = (changes: FileChangeDto[]): FileChangeDto[] => changes.filter(c => !assigned.has(c.path));
    const inChangelist = (name: string): FileChangeDto[] => {
        const paths = new Set(changelists.find(c => c.name === name)?.paths ?? []);
        return allChanges.filter(c => paths.has(c.path));
    };
    const newChangelistItem = (movePaths?: string[]): MenuItem => ({
        label: 'New Changelist...',
        action: () => {
            void showInputDialog({ title: 'New Changelist', placeholder: 'Changelist name' }).then(name => {
                if (name?.trim()) { void createChangelist(name, movePaths); }
            });
        }
    });
    const shelveItem = (paths: string[]): MenuItem => ({
        label: 'Shelve Changes...',
        action: () => {
            void showInputDialog({ title: 'Shelve Changes', placeholder: 'Shelf message (optional)' }).then(message => {
                if (message === null) { return; }
                void shelveChanges(paths, message.trim() || undefined);
            });
        }
    });
    const patchItems = (paths: string[]): MenuItem[] => [
        { label: 'Create Patch from Local Changes...', action: () => void createPatch(paths, 'save') },
        { label: 'Copy as Patch to Clipboard', action: () => void createPatch(paths, 'copy') }
    ];
    /** IDEA "Commit Files...": select the group's files and focus the commit message. */
    const commitFilesItem = (paths: string[]): MenuItem => ({
        label: 'Commit Files...',
        action: () => {
            paths.forEach(p => setChecked(p, true));
            document.querySelector<HTMLTextAreaElement>('.git-commit-message')?.focus();
        }
    });
    const rollbackItem = (paths: string[]): MenuItem => ({
        label: 'Rollback...',
        danger: true,
        action: () => {
            void showInputDialog({
                title: `Rollback changes in ${paths.length === 1 ? paths[0] : `${paths.length} files`}?`,
                confirmOnly: true,
                confirmLabel: 'Rollback',
                danger: true
            }).then(ok => {
                if (ok !== null) { void discardFiles(paths); }
            });
        }
    });
    const moveToItem = (paths: string[]): MenuItem | null => {
        const targets = changelists.filter(c => !paths.every(p => c.paths.includes(p)));
        if (targets.length === 0) { return null; }
        return {
            label: 'Move Files to Another Changelist...',
            items: targets.map(c => ({ label: c.name, action: () => void moveToChangelist(c.name, paths) }))
        };
    };
    const defaultHeaderMenu = (changes: FileChangeDto[]): MenuItem[] => {
        const paths = changes.map(c => c.path);
        const move = moveToItem(paths);
        return [
            commitFilesItem(paths),
            rollbackItem(paths),
            ...(move ? [move] : []),
            { separator: true },
            ...patchItems(paths),
            shelveItem(paths),
            { separator: true },
            newChangelistItem(),
            { separator: true },
            { label: 'Refresh', action: () => void refreshStatus() }
        ];
    };
    const changelistHeaderMenu = (name: string, changes: FileChangeDto[]): MenuItem[] => {
        const paths = changes.map(c => c.path);
        const move = moveToItem(paths);
        return [
            ...(paths.length > 0 ? [commitFilesItem(paths), rollbackItem(paths)] : []),
            ...(move ? [move] : []),
            { separator: true },
            ...(paths.length > 0 ? [...patchItems(paths), shelveItem(paths), { separator: true } as MenuItem] : []),
            newChangelistItem(),
            { separator: true },
            {
                label: 'Edit Changelist...',
                action: () => {
                    void showInputDialog({ title: 'Edit Changelist', initialValue: name }).then(next => {
                        if (next?.trim()) { void renameChangelist(name, next); }
                    });
                }
            },
            { label: 'Delete Changelist', danger: true, action: () => void deleteChangelist(name) },
            { separator: true },
            { label: 'Refresh', action: () => void refreshStatus() }
        ];
    };

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
                <button
                    title="New Changelist — create a custom file group"
                    onClick={() => {
                        void showInputDialog({ title: 'New Changelist', placeholder: 'Changelist name' }).then(name => {
                            if (name?.trim()) { void createChangelist(name); }
                        });
                    }}
                >
                    <i className="codicon codicon-add" />
                </button>
                <button title="Refresh" onClick={() => void refreshStatus()}><i className="codicon codicon-refresh" /></button>
                <button title="Check all" onClick={() => setAllChecked(true)}>All</button>
                <button title="Check none" onClick={() => setAllChecked(false)}>None</button>
                <span className="git-toolbar-spacer" />
                <button
                    title="Stash changes"
                    onClick={e => {
                        openMenu(e.clientX, e.clientY, [
                            {
                                label: 'Stash Changes...',
                                action: () => {
                                    void showInputDialog({ title: 'Stash Changes', placeholder: 'Stash message (optional)' }).then(message => {
                                        if (message === null) { return; }
                                        void stashChanges(message.trim() || undefined);
                                    });
                                }
                            },
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
                <FileGroup title="Merge Conflicts" changes={unassigned(status.conflicts)} groupKey="conflicts" headerMenu={defaultHeaderMenu} onDropPaths={paths => void unassignFromChangelist(paths)} />
            )}
            <FileGroup title="Changes" changes={unassigned(status.changes)} groupKey="changes" headerMenu={defaultHeaderMenu} renderWhenEmpty onDropPaths={paths => void unassignFromChangelist(paths)} />
            {changelists.map(changelist => (
                <FileGroup
                    key={changelist.name}
                    title={changelist.name}
                    changes={inChangelist(changelist.name)}
                    groupKey={`changelist:${changelist.name}`}
                    headerMenu={changes => changelistHeaderMenu(changelist.name, changes)}
                    renderWhenEmpty
                    onDropPaths={paths => void moveToChangelist(changelist.name, paths)}
                />
            ))}
            <FileGroup title="Unversioned Files" changes={unassigned(status.untracked)} groupKey="untracked" headerMenu={defaultHeaderMenu} renderWhenEmpty onDropPaths={paths => void unassignFromChangelist(paths)} />
            {allChanges.length === 0 && (
                <div className="git-empty">No local changes.</div>
            )}
        </div>
    );
}
