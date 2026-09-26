import { create } from 'zustand';
import {
    request, onEvent, postState, copyToClipboard
} from '../bridge/vscode';
import type {
    RepositoryDto, RepositoryStatusDto, CommitDto, CommitFileDto, CommitDetailsDto,
    BranchDto, GitLogFilterDto, PushPreviewDto, HistoryEntryDto, StashDto,
    GitLogRequestDto, DiffTargetDto, WebviewPersistedState, RemoteLogDto, ChangelistDto
} from '../bridge/protocol';

export type TabId = 'changes' | 'log' | 'history';

export interface MenuItem {
    label?: string;
    separator?: boolean;
    action?: () => void;
    danger?: boolean;
    disabled?: boolean;
    /** Renders a hover submenu instead of a clickable action. */
    items?: MenuItem[];
}

export interface ContextMenuState {
    x: number;
    y: number;
    items: MenuItem[];
}

/**
 * In-webview replacement for window.prompt/window.confirm, which are silently
 * blocked inside the VS Code webview iframe.
 */
export interface InputDialogState {
    title: string;
    placeholder?: string;
    initialValue?: string;
    confirmLabel?: string;
    /** Hide the text input and render a plain OK/Cancel confirmation. */
    confirmOnly?: boolean;
    /** Renders a radio group (IDEA-style choice dialog) instead of a text input. */
    options?: { value: string; label: string; description?: string }[];
    danger?: boolean;
    resolve: (value: string | null) => void;
}

interface GitStore {
    // repository
    repositories: RepositoryDto[];
    activeRepoId?: string;
    status?: RepositoryStatusDto;
    statusLoading: boolean;
    commitBusy: boolean;
    remoteLog?: RemoteLogDto;
    remoteLogLoading: boolean;
    updateRemoteLog(): Promise<void>;
    checked: Record<string, boolean>;
    commitMessage: string;
    amend: boolean;
    messageHistory: string[];
    aiBusy: boolean;
    generateCommitMessage(): Promise<void>;
    // log
    activeTab: TabId;
    commits: CommitDto[];
    logPage: number;
    hasMore: boolean;
    logLoading: boolean;
    filter: GitLogFilterDto;
    selectedHash?: string;
    selectedFiles: CommitFileDto[];
    selectedDetails?: CommitDetailsDto;
    branches: BranchDto[];
    // history
    historyPath: string;
    historyEntries: HistoryEntryDto[];
    historyLoading: boolean;
    stashes: StashDto[];
    changelists: ChangelistDto[];
    // ui
    toast?: { kind: 'error' | 'info'; message: string };
    menu: ContextMenuState | null;
    dialog: InputDialogState | null;
    pushPreview?: PushPreviewDto;
    splitSizes: number[];
    collapsedGroups: Record<string, boolean>;
    showGraph: boolean;

    boot(): Promise<void>;
    persist(state: Partial<WebviewPersistedState>): void;
    setSplitSizes(sizes: number[]): void;
    toggleGroup(group: string): void;
    showToast(kind: 'error' | 'info', message: string): void;
    openMenu(x: number, y: number, items: MenuItem[]): void;
    closeMenu(): void;
    showInputDialog(options: Omit<InputDialogState, 'resolve'>): Promise<string | null>;
    resolveDialog(value: string | null): void;

    selectRepository(id: string): Promise<void>;
    refreshStatus(): Promise<void>;
    loadBranches(): Promise<void>;
    initRepository(): Promise<void>;

    setCommitMessage(message: string): void;
    setAmend(amend: boolean): Promise<void>;
    setChecked(path: string, value: boolean): void;
    setAllChecked(value: boolean): void;
    commit(pushAfter: boolean): Promise<void>;

    setActiveTab(tab: TabId): void;
    setFilter(patch: Partial<GitLogFilterDto>): void;
    loadCommits(reset: boolean): Promise<void>;
    refreshCommits(): Promise<void>;
    selectCommit(hash?: string): Promise<void>;
    loadCommitDetails(hash: string): Promise<void>;

    showDiff(target: DiffTargetDto): Promise<void>;
    openFile(path: string): Promise<void>;
    addFiles(paths: string[]): Promise<void>;
    unstageFiles(paths: string[]): Promise<void>;
    discardFiles(paths: string[]): Promise<void>;
    ignoreFile(path: string): Promise<void>;

    checkoutBranch(branch: string): Promise<void>;
    createBranch(name: string, base?: string, checkout?: boolean): Promise<void>;
    renameBranch(oldName: string, newName: string): Promise<void>;
    deleteBranch(branch: string, remote: boolean): Promise<void>;
    mergeBranch(branch: string): Promise<void>;
    rebaseBranch(branch: string): Promise<void>;
    compareBranch(branch: string): Promise<void>;
    pushBranch(branch: string): Promise<void>;

    cherryPick(hash: string): Promise<void>;
    revertCommit(hash: string): Promise<void>;
    resetTo(hash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<void>;
    undoCommit(hash: string, parentHash: string, subject: string): Promise<void>;
    checkoutRevision(hash: string): Promise<void>;
    createTag(name: string, hash?: string): Promise<void>;

    openPushPreview(): Promise<void>;
    push(force: boolean): Promise<void>;
    fetch(prune: boolean): Promise<void>;
    pull(): Promise<void>;

    loadStashes(): Promise<void>;
    stashChanges(message?: string): Promise<void>;
    applyStash(index: number, pop: boolean): Promise<void>;
    dropStash(index: number): Promise<void>;

    loadChangelists(): Promise<void>;
    createChangelist(name: string, movePaths?: string[]): Promise<void>;
    deleteChangelist(name: string): Promise<void>;
    renameChangelist(oldName: string, newName: string): Promise<void>;
    moveToChangelist(name: string, paths: string[]): Promise<void>;

    updateBranch(branch: string): Promise<void>;
    pushSelectedBranch(branch: string): Promise<void>;
    diffBranchWithWorktree(branch: string): Promise<void>;
    addWorktree(branch: string, dir: string): Promise<void>;
    setUpstream(branch: string, upstream?: string): Promise<void>;

    createPatch(paths: string[], mode: 'copy' | 'save'): Promise<void>;
    shelveChanges(paths: string[], message?: string): Promise<void>;
    unassignFromChangelist(paths: string[]): Promise<void>;

    operationContinue(): Promise<void>;
    operationSkip(): Promise<void>;
    operationAbort(): Promise<void>;

    loadHistory(path: string): Promise<void>;
    setHistoryPath(path: string): void;
}

export const useGitStore = create<GitStore>((set, get) => {
    let booted = false;
    let repositoryRevision = 0;
    let statusRevision = 0;
    let branchesRevision = 0;
    let logRevision = 0;
    let commitsRefreshing = false;
    let commitsRefreshPending = false;
    const applyStatus = (status: RepositoryStatusDto) => {
        if (get().activeRepoId !== status.repositoryId) { return; }
        const checked: Record<string, boolean> = {};
        for (const change of [...status.changes, ...status.untracked, ...status.conflicts]) {
            checked[change.path] = get().checked[change.path] ?? true;
        }
        const remoteLog = get().remoteLog;
        set({ status, checked, statusLoading: false,
            repositories: get().repositories.map(repo => repo.id === status.repositoryId ? { ...repo, branch: status.head.branch } : repo),
            remoteLog: remoteLog && remoteLog.branch === status.head.branch && remoteLog.headCommit === status.head.commit
                && remoteLog.upstream === `${status.head.upstream?.remote}/${status.head.upstream?.name}` ? remoteLog : undefined });
    };
    const applyRepositories = (repositories: RepositoryDto[], activeRepoId?: string) => {
        if (get().activeRepoId !== activeRepoId) {
            ++statusRevision; ++branchesRevision; ++logRevision;
            set({ status: undefined, checked: {}, commits: [], branches: [], remoteLog: undefined,
                selectedHash: undefined, selectedFiles: [], selectedDetails: undefined,
                historyEntries: [], historyPath: '', filter: {}, logLoading: false,
                statusLoading: false, hasMore: false, logPage: 0, pushPreview: undefined,
                changelists: [] });
        }
        set({ repositories, activeRepoId });
    };
    const withRepo = <P extends { repositoryId: string }, R>(payload: Omit<P, 'repositoryId'>, type: Parameters<typeof request>[0]): Promise<R> => {
        const { activeRepoId } = get();
        if (!activeRepoId) {
            return Promise.reject(new Error('No active repository'));
        }
        return request<R>(type, { ...payload, repositoryId: activeRepoId });
    };

    const handleError = (e: unknown): void => {
        set({ toast: { kind: 'error', message: e instanceof Error ? e.message : String(e) } });
    };

    const refreshAll = async (): Promise<void> => {
        await Promise.all([get().refreshStatus(), get().loadBranches(), get().refreshCommits(), get().loadChangelists()]);
    };

    return {
        repositories: [],
        activeRepoId: undefined,
        status: undefined,
        statusLoading: false,
        commitBusy: false,
        remoteLogLoading: false,
        checked: {},
        commitMessage: '',
        amend: false,
        messageHistory: [],
        aiBusy: false,
        activeTab: typeof document !== 'undefined' && document.body.dataset.surface === 'log' ? 'log' : 'changes',
        commits: [],
        logPage: 0,
        hasMore: false,
        logLoading: false,
        filter: {},
        selectedHash: undefined,
        selectedFiles: [],
        selectedDetails: undefined,
        branches: [],
        historyPath: '',
        historyEntries: [],
        historyLoading: false,
        stashes: [],
        changelists: [],
        toast: undefined,
        menu: null,
        dialog: null,
        splitSizes: [18, 54, 28],
        collapsedGroups: {},
        showGraph: true,

        async boot(): Promise<void> {
            if (booted) { return; }
            booted = true;
            onEvent(event => {
                switch (event.type) {
                    case 'repository.changed':
                        ++repositoryRevision;
                        {
                            const changed = get().activeRepoId !== event.activeRepositoryId;
                            applyRepositories(event.repositories, event.activeRepositoryId);
                            if (changed) { void refreshAll(); }
                        }
                        break;
                    case 'status.changed':
                        if (event.repositoryId === get().activeRepoId && event.status) {
                            ++statusRevision;
                            applyStatus(event.status);
                        }
                        break;
                    case 'branch.changed':
                        if (event.repositoryId === get().activeRepoId) {
                            void get().loadBranches();
                        }
                        break;
                    case 'log.changed':
                        if (event.repositoryId === get().activeRepoId) {
                            void get().refreshCommits();
                            if (get().historyPath) { void get().loadHistory(get().historyPath); }
                        }
                        break;
                    case 'repository.refresh':
                        if (event.repositoryId === get().activeRepoId) { void refreshAll(); }
                        break;
                    case 'remoteLog.updated':
                        if (event.result.repositoryId === get().activeRepoId) {
                            const head = get().status?.head;
                            if (head?.branch === event.result.branch && head.commit === event.result.headCommit) {
                                set({ remoteLog: event.result });
                            }
                            void refreshAll();
                        }
                        break;
                    case 'history.open':
                        void get().loadHistory(event.path);
                        set({ activeTab: 'history', historyPath: event.path });
                        break;
                    case 'view.showTab':
                        set({ activeTab: event.tab });
                        if (event.tab === 'history' && event.path) {
                            set({ historyPath: event.path });
                            void get().loadHistory(event.path);
                        }
                        break;
                }
            });
            try {
                const version = repositoryRevision;
                const { repositories, activeRepositoryId } = await request<{ repositories: RepositoryDto[]; activeRepositoryId?: string }>('git.repositories.get');
                if (version === repositoryRevision) {
                    applyRepositories(repositories, activeRepositoryId ?? repositories[0]?.id);
                }
                await Promise.all([get().refreshStatus(), get().loadBranches(), get().loadCommits(true)]);
                const history = await request<string[]>('git.commit.getMessageHistory');
                set({ messageHistory: history });
            } catch (e) {
                handleError(e);
            }
            // Navigation must remain usable even when the first repository read fails.
            try {
                const persisted = await request<WebviewPersistedState>('webview.ready');
                const sizes = persisted?.splitPaneSizes;
                if (sizes?.length === 3 && sizes.every(n => Number.isFinite(n) && n >= 8)
                    && Math.abs(sizes.reduce((a, b) => a + b, 0) - 100) < 1) {
                    set({ splitSizes: sizes });
                }
            } catch (e) {
                handleError(e);
            }
        },

        persist(state: Partial<WebviewPersistedState>): void {
            postState(state);
        },

        setSplitSizes(sizes: number[]): void {
            set({ splitSizes: sizes });
            get().persist({ splitPaneSizes: sizes });
        },

        toggleGroup(group: string): void {
            const collapsed = { ...get().collapsedGroups };
            collapsed[group] = !collapsed[group];
            set({ collapsedGroups: collapsed });
        },

        showToast(kind, message): void {
            set({ toast: { kind, message } });
        },

        openMenu(x, y, items): void {
            // Defer past the triggering event: the ContextMenu registers a
            // window-level contextmenu/click listener that closes the menu,
            // and that listener would otherwise fire during the same event
            // bubbling and instantly dismiss the freshly opened menu.
            setTimeout(() => {
                set({ menu: { x, y, items } });
            }, 0);
        },

        closeMenu(): void {
            set({ menu: null });
        },

        showInputDialog(options): Promise<string | null> {
            return new Promise(resolve => {
                // Cancel any dialog that is still pending.
                get().dialog?.resolve(null);
                set({ dialog: { ...options, resolve } });
            });
        },

        resolveDialog(value): void {
            const dialog = get().dialog;
            if (!dialog) { return; }
            set({ dialog: null });
            dialog.resolve(value);
        },

        async selectRepository(id): Promise<void> {
            await request('git.repository.setActive', { repositoryId: id }).catch(handleError);
        },

        async refreshStatus(): Promise<void> {
            const { activeRepoId } = get();
            if (!activeRepoId) {
                set({ status: undefined });
                return;
            }
            const version = ++statusRevision;
            set({ statusLoading: true });
            try {
                const status = await request<RepositoryStatusDto>('git.status.get', { repositoryId: activeRepoId });
                if (version === statusRevision && get().activeRepoId === activeRepoId) { applyStatus(status); }
            } catch (e) {
                if (version === statusRevision && get().activeRepoId === activeRepoId) {
                    set({ statusLoading: false });
                    handleError(e);
                }
            }
        },

        async loadBranches(): Promise<void> {
            const { activeRepoId } = get();
            if (!activeRepoId) { return; }
            const version = ++branchesRevision;
            try {
                const branches = await request<BranchDto[]>('git.branch.list', { repositoryId: activeRepoId });
                if (version === branchesRevision && get().activeRepoId === activeRepoId) { set({ branches }); }
            } catch (e) {
                handleError(e);
            }
        },

        async initRepository(): Promise<void> {
            await request('git.repo.init').catch(handleError);
        },

        setCommitMessage(message): void {
            set({ commitMessage: message });
        },

        /**
         * 用 AI 生成提交信息。只把已勾选的文件交给后端；一个都没勾选时
         * 传空数组，由后端按“工作区全部改动”处理。
         */
        async generateCommitMessage(): Promise<void> {
            const { activeRepoId, checked, aiBusy } = get();
            if (!activeRepoId || aiBusy) { return; }
            const paths = Object.entries(checked).filter(([, value]) => value).map(([path]) => path);
            set({ aiBusy: true });
            try {
                const message = await request<string>('git.ai.generateCommitMessage', { repositoryId: activeRepoId, paths });
                if (message.trim()) { set({ commitMessage: message.trim() }); }
            } catch (e) {
                handleError(e);
            } finally {
                set({ aiBusy: false });
            }
        },

        async setAmend(amend): Promise<void> {
            set({ amend });
            if (amend) {
                try {
                    const { activeRepoId } = get();
                    if (activeRepoId) {
                        const last = await request<string>('git.commit.getLastMessage', { repositoryId: activeRepoId });
                        set({ commitMessage: last });
                    }
                } catch (e) {
                    handleError(e);
                }
            }
        },

        setChecked(path, value): void {
            set(state => ({ checked: { ...state.checked, [path]: value } }));
        },

        setAllChecked(value): void {
            const status = get().status;
            if (!status) { return; }
            const checked: Record<string, boolean> = { ...get().checked };
            for (const change of [...status.changes, ...status.untracked]) {
                checked[change.path] = value;
            }
            set({ checked });
        },

        async commit(pushAfter): Promise<void> {
            if (get().commitBusy) { return; }
            const { commitMessage, amend, checked, status } = get();
            const selectedPaths = Object.entries(checked)
                .filter(([, v]) => v)
                .map(([k]) => k);
            const known = new Set<string>([
                ...(status?.changes ?? []),
                ...(status?.untracked ?? [])
            ].map(c => c.path));
            const paths = selectedPaths.filter(p => known.has(p));
            if (!commitMessage.trim() || (!paths.length && !amend) || status?.state !== 'NORMAL') { return; }
            set({ commitBusy: true });
            try {
                await withRepo({ message: commitMessage, paths, amend }, 'git.commit');
                set({ commitMessage: '', amend: false });
                const history = await request<string[]>('git.commit.getMessageHistory');
                set({ messageHistory: history, toast: { kind: 'info', message: 'Commit successful' } });
                await refreshAll();
                if (pushAfter) {
                    await get().openPushPreview();
                }
            } catch (e) {
                handleError(e);
            } finally {
                set({ commitBusy: false });
            }
        },

        setActiveTab(tab): void {
            const surface = typeof document !== 'undefined' ? document.body.dataset.surface : undefined;
            if ((surface === 'commit' && tab !== 'changes') || (surface === 'log' && tab === 'changes')) {
                void request('git.view.open', { tab, path: get().historyPath || undefined }).catch(handleError);
                return;
            }
            set({ activeTab: tab });
            get().persist({ activeTab: tab });
        },

        setFilter(patch): void {
            set(state => ({ filter: { ...state.filter, ...patch } }));
            void get().loadCommits(true);
        },

        async loadCommits(reset): Promise<void> {
            const { activeRepoId, logLoading } = get();
            if (!activeRepoId || (logLoading && !reset)) { return; }
            const version = ++logRevision;
            const page = reset ? 0 : get().logPage + 1;
            set({ logLoading: true });
            try {
                const req: GitLogRequestDto = {
                    repositoryId: activeRepoId,
                    page,
                    pageSize: 200,
                    filter: get().filter
                };
                const result = await request<{ commits: CommitDto[]; hasMore: boolean }>('git.log.load', req);
                if (version !== logRevision || get().activeRepoId !== activeRepoId) { return; }
                set(state => ({
                    commits: reset ? result.commits : [...state.commits, ...result.commits],
                    hasMore: result.hasMore,
                    logPage: page,
                    logLoading: false
                }));
            } catch (e) {
                if (version !== logRevision || get().activeRepoId !== activeRepoId) { return; }
                set({ logLoading: false });
                handleError(e);
            }
        },

        /**
         * 重新读取日志，并保持用户已经翻到的页数。
         * 定时刷新不该把列表截断回第一页，否则后台每跑一次就会丢掉滚动位置。
         * 刷新期间再次触发会合并成一次补刷，避免请求被静默丢掉。
         */
        async refreshCommits(): Promise<void> {
            if (commitsRefreshing) {
                commitsRefreshPending = true;
                return;
            }
            commitsRefreshing = true;
            try {
                do {
                    commitsRefreshPending = false;
                    const loadedPages = get().logPage;
                    await get().loadCommits(true);
                    for (let page = 1; page <= loadedPages; page++) {
                        if (!get().hasMore) { break; }
                        await get().loadCommits(false);
                    }
                } while (commitsRefreshPending);
            } finally {
                commitsRefreshing = false;
            }
        },

        async selectCommit(hash): Promise<void> {
            set({ selectedHash: hash, selectedFiles: [], selectedDetails: undefined });
            if (hash) {
                await get().loadCommitDetails(hash);
            }
        },

        async loadCommitDetails(hash): Promise<void> {
            const { activeRepoId } = get();
            if (!activeRepoId) { return; }
            try {
                const [files, details] = await Promise.all([
                    request<CommitFileDto[]>('git.commit.getChangedFiles', { repositoryId: activeRepoId, hash }),
                    request<CommitDetailsDto>('git.commit.getDetails', { repositoryId: activeRepoId, hash })
                ]);
                if (get().activeRepoId === activeRepoId && get().selectedHash === hash) {
                    set({ selectedFiles: files, selectedDetails: details });
                }
            } catch (e) {
                handleError(e);
            }
        },

        async showDiff(target): Promise<void> {
            await request('git.diff.show', target).catch(handleError);
        },

        async openFile(path): Promise<void> {
            await withRepo({ path }, 'git.file.open').catch(handleError);
        },

        async addFiles(paths): Promise<void> {
            await withRepo({ paths }, 'git.file.add').catch(handleError);
        },

        async unstageFiles(paths): Promise<void> {
            await withRepo({ paths }, 'git.file.unstage').catch(handleError);
        },

        async discardFiles(paths): Promise<void> {
            await withRepo({ paths }, 'git.file.discard').catch(handleError);
            await get().refreshStatus();
        },

        async ignoreFile(path): Promise<void> {
            await withRepo({ path }, 'git.file.ignore').catch(handleError);
            await get().refreshStatus();
        },

        async checkoutBranch(branch): Promise<void> {
            await withRepo({ branch }, 'git.branch.checkout').catch(handleError);
            await get().refreshStatus();
        },

        async createBranch(name, base, checkout = true): Promise<void> {
            await withRepo({ name, base, checkout }, 'git.branch.create').catch(handleError);
            await get().loadBranches();
        },

        async renameBranch(oldName, newName): Promise<void> {
            await withRepo({ oldName, newName }, 'git.branch.rename').catch(handleError);
            await get().loadBranches();
        },

        async deleteBranch(branch, remote): Promise<void> {
            await withRepo({ name: branch, remote }, 'git.branch.delete').catch(handleError);
            await Promise.all([get().loadBranches(), get().refreshStatus()]);
        },

        async mergeBranch(branch): Promise<void> {
            await withRepo({ branch }, 'git.branch.merge').catch(handleError);
            await refreshAll();
        },

        async rebaseBranch(branch): Promise<void> {
            await withRepo({ branch }, 'git.branch.rebase').catch(handleError);
            await refreshAll();
        },

        async compareBranch(branch): Promise<void> {
            await withRepo({ branch }, 'git.branch.compare').catch(handleError);
        },

        async updateBranch(branch): Promise<void> {
            await withRepo({ branch }, 'git.branch.update').catch(handleError);
            set({ toast: { kind: 'info', message: `Branch "${branch}" updated` } });
            await refreshAll();
        },

        async pushSelectedBranch(branch): Promise<void> {
            try {
                await withRepo({ branch }, 'git.branch.push');
                set({ toast: { kind: 'info', message: `Branch "${branch}" pushed` } });
                await get().loadBranches();
            } catch (e) {
                handleError(e);
            }
        },

        async diffBranchWithWorktree(branch): Promise<void> {
            await withRepo({ branch }, 'git.branch.diffWorktree').catch(handleError);
        },

        async addWorktree(branch, dir): Promise<void> {
            await withRepo({ branch, path: dir }, 'git.branch.worktree.add').catch(handleError);
            await get().loadBranches();
        },

        async setUpstream(branch, upstream): Promise<void> {
            await withRepo({ branch, upstream }, 'git.branch.setUpstream').catch(handleError);
            set({ toast: { kind: 'info', message: `Branch "${branch}" now tracks "${upstream ?? `origin/${branch}`}"` } });
            await get().loadBranches();
        },

        async pushBranch(branch): Promise<void> {
            // Push the current branch with the standard flow.
            void branch;
            await get().push(false);
        },

        async cherryPick(hash): Promise<void> {
            await withRepo({ hash }, 'git.commit.cherryPick').catch(handleError);
            await refreshAll();
        },

        async revertCommit(hash): Promise<void> {
            await withRepo({ hash }, 'git.commit.revert').catch(handleError);
            await refreshAll();
        },

        async resetTo(hash, mode): Promise<void> {
            await withRepo({ hash, mode }, 'git.commit.reset').catch(handleError);
            await refreshAll();
        },

        async undoCommit(hash, parentHash, subject): Promise<void> {
            void hash;
            try {
                // IDEA "Undo Commit": soft-reset to the parent so the changes
                // stay staged, and restore the message into the commit box.
                await withRepo({ hash: parentHash, mode: 'soft' }, 'git.commit.reset');
                set({
                    commitMessage: subject,
                    toast: { kind: 'info', message: 'Commit undone. Changes kept staged; message restored to the commit box.' }
                });
                await refreshAll();
            } catch (e) {
                handleError(e);
            }
        },

        async checkoutRevision(hash): Promise<void> {
            await withRepo({ hash }, 'git.commit.checkoutRevision').catch(handleError);
            await get().refreshStatus();
        },

        async createTag(name, hash): Promise<void> {
            await withRepo({ name, hash }, 'git.tag.create').catch(handleError);
            await get().loadBranches();
        },

        async openPushPreview(): Promise<void> {
            try {
                const preview = await withRepo({}, 'git.remote.pushPreview') as PushPreviewDto;
                set({ pushPreview: preview });
            } catch (e) {
                handleError(e);
            }
        },

        async push(force): Promise<void> {
            try {
                await withRepo({ force }, 'git.remote.push');
                set({ pushPreview: undefined, toast: { kind: 'info', message: 'Push successful' } });
                await get().refreshStatus();
            } catch (e) {
                handleError(e);
            }
        },

        async updateRemoteLog(): Promise<void> {
            const repositoryId = get().activeRepoId;
            if (!repositoryId || get().remoteLogLoading) { return; }
            set({ remoteLogLoading: true });
            try {
                const result = await request<RemoteLogDto>('git.remote.updateLog', { repositoryId });
                if (get().activeRepoId === repositoryId) {
                    await refreshAll();
                    const head = get().status?.head;
                    if (head?.branch === result.branch && head.commit === result.headCommit) {
                        set({ remoteLog: result, toast: { kind: 'info', message: '远端提交日志已更新，本地代码未改变。' } });
                    }
                }
            } catch (e) { handleError(e); }
            finally { set({ remoteLogLoading: false }); }
        },

        async fetch(prune): Promise<void> {
            await withRepo({ prune }, 'git.remote.fetch').catch(handleError);
            await refreshAll();
        },

        async pull(): Promise<void> {
            await withRepo({}, 'git.remote.pull').catch(handleError);
            await refreshAll();
        },

        async loadStashes(): Promise<void> {
            try {
                const stashes = await withRepo({}, 'git.stash.list') as StashDto[];
                set({ stashes });
            } catch (e) {
                handleError(e);
            }
        },

        async stashChanges(message): Promise<void> {
            await withRepo({ message }, 'git.stash.push').catch(handleError);
            await get().refreshStatus();
        },

        async applyStash(index, pop): Promise<void> {
            await withRepo({ index, pop }, 'git.stash.apply').catch(handleError);
            await refreshAll();
        },

        async dropStash(index): Promise<void> {
            await withRepo({ index }, 'git.stash.drop').catch(handleError);
            await get().loadStashes();
        },

        async loadChangelists(): Promise<void> {
            const { activeRepoId } = get();
            if (!activeRepoId) { return; }
            try {
                const changelists = await request<ChangelistDto[]>('git.changelist.list', { repositoryId: activeRepoId });
                if (get().activeRepoId === activeRepoId) { set({ changelists }); }
            } catch (e) {
                handleError(e);
            }
        },

        async createChangelist(name, movePaths): Promise<void> {
            const trimmed = name.trim();
            if (!trimmed) { return; }
            try {
                const changelists = await withRepo({ name: trimmed }, 'git.changelist.create') as ChangelistDto[];
                set({ changelists, toast: { kind: 'info', message: `Changelist "${trimmed}" created` } });
                if (movePaths?.length) {
                    await get().moveToChangelist(trimmed, movePaths);
                }
            } catch (e) {
                handleError(e);
            }
        },

        async deleteChangelist(name): Promise<void> {
            try {
                const changelists = await withRepo({ name }, 'git.changelist.delete') as ChangelistDto[];
                set({ changelists });
            } catch (e) {
                handleError(e);
            }
        },

        async renameChangelist(oldName, newName): Promise<void> {
            const trimmed = newName.trim();
            if (!trimmed || trimmed === oldName) { return; }
            try {
                const changelists = await withRepo({ oldName, newName: trimmed }, 'git.changelist.rename') as ChangelistDto[];
                set({ changelists });
            } catch (e) {
                handleError(e);
            }
        },

        async moveToChangelist(name, paths): Promise<void> {
            try {
                const changelists = await withRepo({ name, paths }, 'git.changelist.moveFiles') as ChangelistDto[];
                set({ changelists });
            } catch (e) {
                handleError(e);
            }
        },

        async createPatch(paths, mode): Promise<void> {
            const { activeRepoId } = get();
            if (!activeRepoId) { return; }
            try {
                if (mode === 'save') {
                    await request('git.patch.save', { repositoryId: activeRepoId, paths });
                    return;
                }
                const patch = await request<string>('git.patch.get', { repositoryId: activeRepoId, paths });
                if (!patch.trim()) {
                    set({ toast: { kind: 'info', message: 'No local changes to create a patch from.' } });
                    return;
                }
                copyToClipboard(patch);
                set({ toast: { kind: 'info', message: 'Patch copied to clipboard' } });
            } catch (e) {
                handleError(e);
            }
        },

        async shelveChanges(paths, message): Promise<void> {
            try {
                await withRepo({ paths, message }, 'git.changes.shelve');
                set({ toast: { kind: 'info', message: 'Changes shelved' } });
                await refreshAll();
                await get().loadStashes();
            } catch (e) {
                handleError(e);
            }
        },

        async unassignFromChangelist(paths): Promise<void> {
            try {
                const changelists = await withRepo({ paths }, 'git.changelist.unassign') as ChangelistDto[];
                set({ changelists });
            } catch (e) {
                handleError(e);
            }
        },

        async operationContinue(): Promise<void> {
            await withRepo({}, 'git.operation.continue').catch(handleError);
            await refreshAll();
        },

        async operationSkip(): Promise<void> {
            await withRepo({}, 'git.operation.skip').catch(handleError);
            await refreshAll();
        },

        async operationAbort(): Promise<void> {
            await withRepo({}, 'git.operation.abort').catch(handleError);
            await refreshAll();
        },

        setHistoryPath(path): void {
            set({ historyPath: path });
        },

        async loadHistory(path): Promise<void> {
            const { activeRepoId } = get();
            if (!activeRepoId || !path) {
                set({ historyEntries: [] });
                return;
            }
            set({ historyLoading: true, historyPath: path });
            try {
                const entries = await request<HistoryEntryDto[]>('git.history.load', {
                    repositoryId: activeRepoId, path, page: 0, pageSize: 200
                });
                if (get().activeRepoId === activeRepoId && get().historyPath === path) {
                    set({ historyEntries: entries, historyLoading: false });
                }
            } catch (e) {
                set({ historyEntries: [], historyLoading: false });
                handleError(e);
            }
        }
    };
});

export { copyToClipboard };
