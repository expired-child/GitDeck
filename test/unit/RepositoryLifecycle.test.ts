import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter, extensions } from '../mocks/vscode';
import { RepositoryManager } from '../../src/application/repository/RepositoryService';
import { VscodeGitAdapter } from '../../src/infrastructure/vscode-git/VscodeGitAdapter';
import { registerEvents } from '../../src/bootstrap/registerEvents';
import { GitStatusService } from '../../src/application/status/GitStatusService';
import { VscodeRepositoryAdapter } from '../../src/infrastructure/vscode-git/VscodeRepositoryAdapter';

const makeRepo = (id: string) => ({
    rootUri: { fsPath: id }, status: vi.fn(async () => {}),
    state: { HEAD: { name: 'main', commit: 'a' }, refs: [], remotes: [],
        indexChanges: [], workingTreeChanges: [], mergeChanges: [], onDidChange: new EventEmitter<void>().event }
});
function fixture() {
    const opened = new EventEmitter<any>();
    const closed = new EventEmitter<any>();
    const api = { repositories: [] as any[], onDidOpenRepository: opened.event, onDidCloseRepository: closed.event };
    const manager = new RepositoryManager({ getApi: async () => api } as any, {
        getActiveRepositoryId: () => '/second', setActiveRepositoryId: vi.fn()
    } as any);
    return { api, manager, opened, closed };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('VS Code Git discovery and automatic refresh', () => {
    it('reads the public repositories property and restores the saved active repository with an event', async () => {
        const { api, manager } = fixture();
        api.repositories = [makeRepo('/first'), makeRepo('/second')];
        const active = vi.fn(); manager.onDidChangeActiveRepository(active);
        await Promise.all([manager.initialize(), manager.refresh()]);
        expect(manager.getActiveRepository()?.id).toBe('/second');
        expect(active.mock.calls.at(-1)?.[0].id).toBe('/second');
        expect(api.repositories[1].status).toHaveBeenCalledOnce();
        manager.dispose();
    });

    it('accepts late discovery and reattaches after close/reopen; refreshes logs only for ref changes', async () => {
        vi.useFakeTimers();
        const { manager, opened, closed } = fixture();
        const subscriptions: any[] = [];
        const postEvent = vi.fn();
        registerEvents({ subscriptions } as any, manager, { getStatus: async (repo: any) => ({ repositoryId: repo.id }) } as any,
            { postEvent } as any, { update: vi.fn(), show: vi.fn() } as any);
        await manager.initialize();
        let changed = new EventEmitter<void>();
        const repo = makeRepo('/first'); repo.state.onDidChange = changed.event;
        opened.fire(repo);
        await vi.advanceTimersByTimeAsync(0);
        expect(postEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'status.changed' }));
        postEvent.mockClear();
        changed.fire(); changed.fire(); changed.fire();
        await vi.advanceTimersByTimeAsync(300);
        expect(postEvent.mock.calls.filter(([e]) => e.type === 'status.changed')).toHaveLength(1);
        expect(postEvent.mock.calls.filter(([e]) => e.type === 'log.changed')).toHaveLength(0);
        closed.fire(repo);
        changed = new EventEmitter<void>();
        const reopened = makeRepo('/first'); reopened.state.onDidChange = changed.event;
        opened.fire(reopened);
        await vi.advanceTimersByTimeAsync(0);
        postEvent.mockClear();
        reopened.state.HEAD.commit = 'b'; changed.fire();
        await vi.advanceTimersByTimeAsync(300);
        expect(postEvent).toHaveBeenCalledWith({ type: 'log.changed', repositoryId: '/first' });
        postEvent.mockClear(); changed.fire();
        subscriptions.forEach(s => s.dispose());
        await vi.advanceTimersByTimeAsync(300);
        expect(postEvent).not.toHaveBeenCalled();
        manager.dispose();
    });

    it('retries API acquisition after an initial rejection', async () => {
        const api = { repositories: [] };
        vi.spyOn(extensions, 'getExtension').mockReturnValueOnce(undefined).mockReturnValue({
            isActive: true, exports: { enabled: true, getAPI: () => api }
        });
        const adapter = new VscodeGitAdapter();
        await expect(adapter.getApi()).rejects.toThrow();
        await expect(adapter.getApi()).resolves.toBe(api);
    });

    it('uses actual modified/deleted enum values and includes separate untracked files once', async () => {
        const repo: any = makeRepo('/not-on-disk');
        const change = (name: string, status: number) => ({ uri: { fsPath: `/not-on-disk/${name}` }, originalUri: { fsPath: `/not-on-disk/${name}` }, status });
        repo.state.workingTreeChanges = [change('modified', 5), change('deleted', 6), change('new', 7)];
        repo.state.untrackedChanges = [change('new', 7), change('other', 7)];
        const status = await new GitStatusService().getStatus(new VscodeRepositoryAdapter(repo));
        expect(status.changes.map(c => [c.path, c.status])).toEqual([['modified', 'M'], ['deleted', 'D']]);
        expect(status.untracked.map(c => c.path)).toEqual(['new', 'other']);
        expect(status.changes.every(c => c.originalPath === undefined)).toBe(true);
    });
});
