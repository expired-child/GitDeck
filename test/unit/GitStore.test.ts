import { describe, it, expect, vi, beforeEach } from 'vitest';
const bridge = vi.hoisted(() => ({ request: vi.fn(), listener: undefined as any }));
vi.mock('../../webview/src/bridge/vscode', () => ({
    request: bridge.request, onEvent: (listener: any) => { bridge.listener = listener; },
    postState: vi.fn(), copyToClipboard: vi.fn()
}));
const deferred = <T>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
};
beforeEach(() => { vi.resetModules(); bridge.request.mockReset(); });
describe('webview refresh races', () => {
    it('does not drop a refresh while the previous log request is in flight', async () => {
        const { useGitStore } = await import('../../webview/src/store/gitStore');
        useGitStore.setState({ activeRepoId: 'repo' });
        const first = deferred<any>(); const second = deferred<any>();
        bridge.request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const old = useGitStore.getState().loadCommits(true);
        const fresh = useGitStore.getState().loadCommits(true);
        second.resolve({ commits: [{ hash: 'new' }], hasMore: false }); await fresh;
        first.resolve({ commits: [{ hash: 'old' }], hasMore: true }); await old;
        expect(useGitStore.getState().commits.map(c => c.hash)).toEqual(['new']);
        expect(useGitStore.getState().hasMore).toBe(false);
    });
    it('ignores responses from the previously active repository', async () => {
        const { useGitStore } = await import('../../webview/src/store/gitStore');
        useGitStore.setState({ activeRepoId: 'first' });
        const pending = deferred<any>(); bridge.request.mockReturnValue(pending.promise);
        const loading = useGitStore.getState().loadBranches();
        useGitStore.setState({ activeRepoId: 'second', branches: [] });
        pending.resolve([{ name: 'wrong-repo' }]); await loading;
        expect(useGitStore.getState().branches).toEqual([]);
    });
    it('clears closed repositories and initializes checkbox state from automatic status events', async () => {
        const { useGitStore } = await import('../../webview/src/store/gitStore');
        bridge.request.mockImplementation(async type => type === 'git.repositories.get' ? { repositories: [] } : []);
        await useGitStore.getState().boot();
        useGitStore.setState({ activeRepoId: 'repo', checked: { removed: true, existing: false } });
        bridge.listener({ type: 'status.changed', repositoryId: 'repo', status: {
            repositoryId: 'repo', head: {}, changes: [{ path: 'existing' }], untracked: [{ path: 'new' }], conflicts: []
        } });
        expect(useGitStore.getState().checked).toEqual({ existing: false, new: true });
        bridge.listener({ type: 'repository.changed', repositories: [] });
        expect(useGitStore.getState().activeRepoId).toBeUndefined();
        expect(useGitStore.getState().status).toBeUndefined();
        expect(useGitStore.getState().commits).toEqual([]);
    });
});

describe('Commit and Push workflow', () => {
    const status = { repositoryId: 'repo', head: {}, state: 'NORMAL' as const, changes: [{ path: 'file.ts', status: 'M' as const, staged: false }],
        untracked: [], conflicts: [], staged: [], remotes: [], rebaseProgress: null };

    it('commits selected files before previewing, without pushing or committing twice', async () => {
        const { useGitStore } = await import('../../webview/src/store/gitStore');
        useGitStore.setState({ activeRepoId: 'repo', status, commitMessage: 'Fix layout', checked: { 'file.ts': true } });
        const saving = deferred<void>();
        bridge.request.mockImplementation(async type => {
            if (type === 'git.commit') { return saving.promise; }
            if (type === 'git.status.get') { return { ...status, changes: [] }; }
            if (type === 'git.log.load') { return { commits: [], hasMore: false }; }
            if (type === 'git.remote.pushPreview') { return { repositoryId: 'repo', branch: 'main', upstream: 'origin/main', commits: [{ hash: 'new' }] }; }
            return [];
        });
        const operation = useGitStore.getState().commit(true);
        await useGitStore.getState().commit(true);
        expect(bridge.request.mock.calls.map(([type]) => type)).toEqual(['git.commit']);
        saving.resolve(); await operation;
        const types = bridge.request.mock.calls.map(([type]) => type);
        expect(types.filter(type => type === 'git.commit')).toHaveLength(1);
        expect(types).toContain('git.remote.pushPreview');
        expect(types).not.toContain('git.remote.push');
        expect(useGitStore.getState().pushPreview?.commits[0].hash).toBe('new');
        expect(useGitStore.getState().commitMessage).toBe('');
        expect(useGitStore.getState().commitBusy).toBe(false);
    });

    it('keeps the draft and never opens push when commit fails', async () => {
        const { useGitStore } = await import('../../webview/src/store/gitStore');
        useGitStore.setState({ activeRepoId: 'repo', status, commitMessage: 'Keep this draft', checked: { 'file.ts': true } });
        bridge.request.mockRejectedValue(new Error('commit hook failed'));
        await useGitStore.getState().commit(true);
        expect(bridge.request.mock.calls.map(([type]) => type)).toEqual(['git.commit']);
        expect(useGitStore.getState().commitMessage).toBe('Keep this draft');
        expect(useGitStore.getState().pushPreview).toBeUndefined();
        expect(useGitStore.getState().commitBusy).toBe(false);
    });

    it('ordinary Push previews existing commits even when files and a draft are selected', async () => {
        const { useGitStore } = await import('../../webview/src/store/gitStore');
        useGitStore.setState({ activeRepoId: 'repo', status, commitMessage: 'Unfinished', checked: { 'file.ts': true } });
        bridge.request.mockResolvedValue({ commits: [] });
        await useGitStore.getState().openPushPreview();
        expect(bridge.request.mock.calls.map(([type]) => type)).toEqual(['git.remote.pushPreview']);
        expect(useGitStore.getState().commitMessage).toBe('Unfinished');
    });
});
