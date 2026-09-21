import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { GitCli } from '../../src/infrastructure/git-cli/GitCli';
import { Logger } from '../../src/shared/logger';
import { GitLogParser, LOG_FORMAT } from '../../src/infrastructure/git-cli/GitLogParser';

/**
 * Integration tests (document §64): create a temporary real git repository
 * and exercise the CLI adapter against it. Skipped when git is unavailable.
 */

const gitAvailable = (() => {
    try {
        execFileSync('git', ['--version'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
})();

describe.skipIf(!gitAvailable)('GitCli against a real repository', () => {
    let repoDir: string;
    const cli = new GitCli(new Logger());

    const git = (args: string[], cwd: string = repoDir) =>
        execFileSync('git', args, { cwd, encoding: 'utf8' });

    beforeAll(() => {
        repoDir = mkdtempSync(join(tmpdir(), 'idea-git-test-'));
        git(['init', '--initial-branch=main']);
        git(['config', 'user.name', 'test']);
        git(['config', 'user.email', 'test@example.com']);
        writeFileSync(join(repoDir, 'a.txt'), 'hello\n');
        git(['add', '.']);
        git(['commit', '-m', 'feat: initial commit 中文 🎉']);
        git(['checkout', '-b', 'feature']);
        writeFileSync(join(repoDir, 'b.txt'), 'feature\n');
        git(['add', '.']);
        git(['commit', '-m', 'feat: feature work']);
        git(['checkout', 'main']);
        writeFileSync(join(repoDir, 'c.txt'), 'main\n');
        git(['add', '.']);
        git(['commit', '-m', 'fix: main work']);
        git(['merge', '--no-ff', '--no-edit', 'feature']); // merge commit
    });

    afterAll(() => {
        try {
            rmSync(repoDir, { recursive: true, force: true });
        } catch {
            // best effort cleanup
        }
    });

    it('lists commits including the merge commit', async () => {
        const out = await cli.out(repoDir, [
            'log', '--all', '--date=iso-strict', `--pretty=format:${LOG_FORMAT}`
        ]);
        const parser = new GitLogParser();
        const commits = parser.parseCommits(out);
        expect(commits.length).toBeGreaterThanOrEqual(4);
        const merge = commits.find(c => c.parents.length === 2);
        expect(merge).toBeDefined();
        expect(commits.some(c => c.subject.includes('中文'))).toBe(true);
    });

    it('lists branches with for-each-ref', async () => {
        const out = await cli.out(repoDir, [
            'for-each-ref',
            '--format=%(refname)%09%(objectname:short)%09%(upstream)%09%(HEAD)',
            'refs/heads', 'refs/remotes', 'refs/tags'
        ]);
        const names = out.trim().split('\n').map(l => l.split('\t')[0]);
        expect(names).toContain('refs/heads/main');
        expect(names).toContain('refs/heads/feature');
    });

    it('creates, renames and deletes a branch', async () => {
        await cli.out(repoDir, ['branch', 'temp-branch']);
        await cli.out(repoDir, ['branch', '-m', 'temp-branch', 'renamed-branch']);
        const branches = await cli.out(repoDir, ['branch', '--list', 'renamed-branch']);
        expect(branches).toContain('renamed-branch');
        await cli.out(repoDir, ['branch', '-D', 'renamed-branch']);
        const gone = await cli.out(repoDir, ['branch', '--list', 'renamed-branch']);
        expect(gone.trim()).toBe('');
    });

    it('stashes and restores changes', async () => {
        writeFileSync(join(repoDir, 'a.txt'), 'modified\n');
        await cli.out(repoDir, ['stash', 'push', '-m', 'wip']);
        const clean = await cli.out(repoDir, ['status', '--porcelain']);
        expect(clean.trim()).toBe('');
        await cli.out(repoDir, ['stash', 'pop']);
        const restored = await cli.out(repoDir, ['status', '--porcelain']);
        expect(restored).toContain('M a.txt');
        writeFileSync(join(repoDir, 'a.txt'), 'hello\n');
    });

    it('rejects invalid branch names via check-ref-format', async () => {
        await expect(
            cli.out(repoDir, ['check-ref-format', '--branch', '-bad'])
        ).rejects.toThrow();
    });

    it('maps not-a-repository errors', async () => {
        const empty = mkdtempSync(join(tmpdir(), 'idea-git-empty-'));
        try {
            await expect(cli.out(empty, ['log', '--oneline'])).rejects.toThrow(/repository/i);
        } finally {
            rmSync(empty, { recursive: true, force: true });
        }
    });
});
