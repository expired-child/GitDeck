import { describe, it, expect, vi, afterEach } from 'vitest';
import { RemoteService } from '../../src/application/remote/RemoteService';
import { GitLogService } from '../../src/application/log/GitLogService';
import { registerRemoteUpdates } from '../../src/bootstrap/registerRemoteUpdates';
import { workspace, window } from '../mocks/vscode';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); window.state.focused = true; });
const fixture = () => {
    const native = { fetch: vi.fn(), push: vi.fn(), status: vi.fn() };
    const repo = { id: 'repo', rootPath: '/repo', getHead: () => ({ branch: 'main', commit: 'abc', upstream: null }),
        getRemotes: () => ['origin'], vscodeRepository: native };
    const repositories = { getRequired: () => repo, getActiveRepository: () => repo };
    const cli = { out: vi.fn(async () => '') };
    const log = new GitLogService(repositories as any, cli as any);
    const service = new RemoteService(repositories as any, cli as any, log);
    return { native, cli, log, service, repositories };
};
describe('public API contracts and background checks', () => {
    it('passes fetch options and force-with-lease using the real VS Code signatures', async () => {
        const { native, service } = fixture();
        await service.fetch('repo', true);
        expect(native.fetch).toHaveBeenCalledWith({ all: true, prune: true });
        await service.push('repo', true);
        expect(native.push).toHaveBeenCalledWith('origin', 'main', true, 1);
    });
    it('uses explicit pull strategies, rather than passing rebase as the unshallow argument', async () => {
        const { cli, service } = fixture();
        await service.pull('repo', true);
        expect(cli.out).toHaveBeenCalledWith('/repo', ['pull', '--rebase'], { timeout: 120_000 });
        await service.pull('repo', false);
        expect(cli.out).toHaveBeenCalledWith('/repo', ['pull', '--no-rebase'], { timeout: 120_000 });
    });
    it('includes HEAD in the first-push preview and propagates actual log failures', async () => {
        const { cli, log } = fixture();
        await log.getCommitsAhead('repo');
        expect(cli.out.mock.calls[0][1]).toContain('HEAD');
        cli.out.mockRejectedValueOnce(new Error('read failed'));
        await expect(log.getCommitsAhead('repo')).rejects.toThrow('read failed');
    });
    it('checks only focused tracked repositories and disposes the timer', async () => {
        vi.useFakeTimers();
        const subscriptions: any[] = [];
        const updateLog = vi.fn(async () => {});
        const repo = { id: 'repo', getHead: () => ({ upstream: { remote: 'origin' } }) };
        registerRemoteUpdates({ subscriptions } as any, { getActiveRepository: () => repo } as any,
            { updateLog } as any, { isBusy: () => false } as any, { error: vi.fn() } as any);
        await vi.advanceTimersByTimeAsync(180_000);
        expect(updateLog).toHaveBeenCalledOnce();
        window.state.focused = false;
        await vi.advanceTimersByTimeAsync(180_000);
        expect(updateLog).toHaveBeenCalledOnce();
        subscriptions.forEach(s => s.dispose()); window.state.focused = true;
        await vi.advanceTimersByTimeAsync(180_000);
        expect(updateLog).toHaveBeenCalledOnce();
    });
    it('allows users to disable automatic remote checks', async () => {
        vi.useFakeTimers();
        vi.spyOn(workspace, 'getConfiguration').mockReturnValue({ get: () => 0 });
        const subscriptions: any[] = []; const updateLog = vi.fn();
        registerRemoteUpdates({ subscriptions } as any, { getActiveRepository: vi.fn() } as any,
            { updateLog } as any, {} as any, {} as any);
        await vi.advanceTimersByTimeAsync(360_000);
        expect(updateLog).not.toHaveBeenCalled();
        subscriptions.forEach(s => s.dispose());
    });
});
