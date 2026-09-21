import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { RemoteService } from '../../src/application/remote/RemoteService';
import { GitCli } from '../../src/infrastructure/git-cli/GitCli';
import { Logger } from '../../src/shared/logger';

describe('remote log updates against real local Git remotes', () => {
    let root: string, local: string, peer: string;
    let service: RemoteService;
    let head: any;
    let repo: any;
    const cli = new GitCli(new Logger());
    const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    beforeAll(() => {
        root = mkdtempSync(join(tmpdir(), 'gitdeck-remote-test-'));
        local = join(root, 'local'); peer = join(root, 'peer');
        const remote = join(root, 'remote.git'); mkdirSync(remote); mkdirSync(peer);
        git(remote, 'init', '--bare', '--initial-branch=main');
        git(peer, 'init', '--initial-branch=main');
        git(peer, 'config', 'user.name', 'Colleague'); git(peer, 'config', 'user.email', 'peer@example.test');
        writeFileSync(join(peer, 'shared.txt'), 'base\n');
        git(peer, 'add', '.'); git(peer, 'commit', '-m', 'initial');
        git(peer, 'remote', 'add', 'origin', remote); git(peer, 'push', '-u', 'origin', 'main');
        git(root, 'clone', remote, local); git(local, 'remote', 'rename', 'origin', 'team');
        git(local, 'checkout', '-b', 'topic', '--track', 'team/main');
        git(local, 'config', 'user.name', 'Local'); git(local, 'config', 'user.email', 'local@example.test');
        writeFileSync(join(local, 'local.txt'), 'local commit\n');
        git(local, 'add', '.'); git(local, 'commit', '-m', 'local-only');
        writeFileSync(join(local, 'shared.txt'), 'staged\n'); git(local, 'add', 'shared.txt');
        writeFileSync(join(local, 'shared.txt'), 'unstaged\n');
        writeFileSync(join(local, 'untracked.txt'), 'do not touch\n');
        head = { branch: 'topic', commit: git(local, 'rev-parse', 'HEAD'), upstream: { remote: 'team', name: 'main' } };
        repo = { id: local, rootPath: local, getHead: () => head,
            vscodeRepository: {
                status: vi.fn(async () => {}),
                fetch: vi.fn(async (options: { remote: string; ref: string }) => {
                    await cli.out(local, ['fetch', '--no-tags', options.remote, options.ref]);
                })
            }
        };
        service = new RemoteService({ getRequired: () => repo } as any, cli, {} as any);
    });
    afterAll(() => {
        if (root && resolve(root).startsWith(resolve(tmpdir()) + '\\gitdeck-remote-test-')) {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('discovers colleague commits on the tracked branch without changing HEAD, index or files', async () => {
        const before = {
            head: git(local, 'rev-parse', 'HEAD'), index: readFileSync(join(local, '.git', 'index')),
            status: git(local, 'status', '--porcelain'), worktree: readFileSync(join(local, 'shared.txt')),
            untracked: readFileSync(join(local, 'untracked.txt'))
        };
        writeFileSync(join(peer, 'shared.txt'), 'colleague update\n');
        git(peer, 'add', '.'); git(peer, 'commit', '-m', 'fix: teammate update'); git(peer, 'push');
        expect(git(local, 'rev-list', '--count', 'HEAD..team/main')).toBe('0');
        const publish = vi.fn(); service.onLogUpdated = publish;
        const pending = service.updateLog(local);
        expect(service.updateLog(local)).toBe(pending);
        const result = await pending;
        expect(result).toMatchObject({ branch: 'topic', upstream: 'team/main', ahead: 1, behind: 1 });
        expect(result.commits.map(c => [c.subject, c.authorName])).toEqual([['fix: teammate update', 'Colleague']]);
        expect(git(local, 'rev-list', '--count', 'HEAD..team/main')).toBe('1');
        expect(git(local, 'rev-parse', 'HEAD')).toBe(before.head);
        expect(readFileSync(join(local, '.git', 'index'))).toEqual(before.index);
        expect(git(local, 'status', '--porcelain')).toBe(before.status);
        expect(readFileSync(join(local, 'shared.txt'))).toEqual(before.worktree);
        expect(readFileSync(join(local, 'untracked.txt'))).toEqual(before.untracked);
        expect(publish).toHaveBeenCalledOnce();
        expect(repo.vscodeRepository.fetch).toHaveBeenCalledWith({ remote: 'team', ref: '+refs/heads/main:refs/remotes/team/main', prune: false });
    });

    it('rejects missing upstream without fetching or claiming success', async () => {
        const saved = head; head = { ...head, upstream: undefined };
        const count = repo.vscodeRepository.fetch.mock.calls.length;
        await expect(service.updateLog(local)).rejects.toThrow('上游');
        expect(repo.vscodeRepository.fetch).toHaveBeenCalledTimes(count);
        head = saved;
    });

    it('reports a failed fetch and allows a subsequent retry', async () => {
        repo.vscodeRepository.fetch.mockRejectedValueOnce(new Error('authentication failed'));
        const publish = vi.fn(); service.onLogUpdated = publish;
        await expect(service.updateLog(local)).rejects.toThrow('authentication failed');
        expect(publish).not.toHaveBeenCalled();
        await expect(service.updateLog(local)).resolves.toMatchObject({ behind: 1 });
    });

    it('does not publish results if an external checkout occurs during fetch', async () => {
        const saved = head;
        repo.vscodeRepository.fetch.mockImplementationOnce(async () => { head = { ...head, branch: 'other' }; });
        const publish = vi.fn(); service.onLogUpdated = publish;
        await expect(service.updateLog(local)).rejects.toThrow('分支已变化');
        expect(publish).not.toHaveBeenCalled();
        head = saved;
    });
});
