import { GitError, GitErrorCode } from '../../shared/GitError';
import type { BranchDto } from '../../shared/protocol';
import { GitCli } from '../../infrastructure/git-cli/GitCli';
import { GitCommandBuilder } from '../../infrastructure/git-cli/GitCommandBuilder';
import { GitVersionDetector } from '../../infrastructure/git-cli/GitVersionDetector';
import { GitOperationLock, type RepositoryManager } from '../repository/RepositoryService';

const REF_FORMAT = '%(refname)%09%(objectname:short)%09%(upstream)%09%(HEAD)';

/**
 * Branch operations (document §22-§25): listing, checkout with version-aware
 * syntax, create with validation, rename, delete with confirmation handled by
 * the caller, merge and rebase.
 */
export class BranchService {
    private readonly versionDetector: GitVersionDetector;

    constructor(
        private readonly repositories: RepositoryManager,
        private readonly lock: GitOperationLock,
        private readonly cli: GitCli
    ) {
        this.versionDetector = new GitVersionDetector(cli);
    }

    async list(repositoryId: string): Promise<BranchDto[]> {
        const repo = this.repositories.getRequired(repositoryId);
        const out = await this.cli.out(repo.rootPath, [
            'for-each-ref', `--format=${REF_FORMAT}`,
            'refs/heads', 'refs/remotes', 'refs/tags'
        ]);
        const branches: BranchDto[] = [];
        for (const line of out.split('\n')) {
            if (!line.trim()) { continue; }
            const [refname, commit, upstream, headFlag] = line.trim().split('\t');
            if (refname.startsWith('refs/tags/')) {
                branches.push({ name: refname.slice('refs/tags/'.length), type: 'tag', current: false, commit });
            } else if (refname.startsWith('refs/remotes/')) {
                const short = refname.slice('refs/remotes/'.length);
                if (short.endsWith('/HEAD')) { continue; }
                const slash = short.indexOf('/');
                branches.push({
                    name: short,
                    type: 'remote',
                    remote: slash >= 0 ? short.slice(0, slash) : short,
                    current: false,
                    upstream: upstream || null,
                    commit
                });
            } else if (refname.startsWith('refs/heads/')) {
                branches.push({
                    name: refname.slice('refs/heads/'.length),
                    type: 'local',
                    current: headFlag === '*',
                    upstream: upstream || null,
                    commit
                });
            }
        }
        return branches;
    }

    async checkout(repositoryId: string, branch: string): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        await this.lock.run(repo.id, async () => {
            if (branch.includes('/')) {
                // Might be a remote branch like origin/foo -> create a tracking branch.
                const branches = await this.list(repo.id);
                const isRemoteOnly = branches.some(b => b.type === 'remote' && b.name === branch)
                    && !branches.some(b => b.type === 'local' && b.name === branch);
                if (isRemoteOnly) {
                    const localName = branch.slice(branch.indexOf('/') + 1);
                    const useSwitch = await this.versionDetector.supportsSwitch(repo.rootPath);
                    const args = useSwitch
                        ? ['switch', '-c', localName, '--track', branch]
                        : ['checkout', '-b', localName, '--track', branch];
                    await this.cli.out(repo.rootPath, args);
                    return;
                }
            }
            const useSwitch = await this.versionDetector.supportsSwitch(repo.rootPath);
            const cmd = new GitCommandBuilder(useSwitch ? 'switch' : 'checkout').value(branch);
            await this.cli.out(repo.rootPath, cmd.build());
        });
    }

    async create(repositoryId: string, name: string, base: string | undefined, checkout: boolean): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        await this.validateBranchName(repo.rootPath, name);
        await this.lock.run(repo.id, async () => {
            await repo.vscodeRepository.createBranch(name, checkout, base);
        });
    }

    async rename(repositoryId: string, oldName: string, newName: string): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        await this.validateBranchName(repo.rootPath, newName);
        await this.lock.run(repo.id, async () => {
            const cmd = new GitCommandBuilder('branch').flag('-m').value(oldName, newName);
            await this.cli.out(repo.rootPath, cmd.build());
        });
    }

    async deleteLocal(repositoryId: string, name: string, force: boolean): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        await this.lock.run(repo.id, async () => {
            const cmd = new GitCommandBuilder('branch').flag(force ? '-D' : '-d').value(name);
            await this.cli.out(repo.rootPath, cmd.build());
        });
    }

    async deleteRemote(repositoryId: string, remote: string, branch: string): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        await this.lock.run(repo.id, async () => {
            const cmd = new GitCommandBuilder('push').value(remote).flag('--delete').value(branch);
            await this.cli.out(repo.rootPath, cmd.build(), { timeout: 120_000 });
        });
    }

    async merge(repositoryId: string, branch: string): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        await this.lock.run(repo.id, async () => {
            const cmd = new GitCommandBuilder('merge').value(branch);
            await this.cli.out(repo.rootPath, cmd.build(), { timeout: 120_000 });
        });
    }

    async rebase(repositoryId: string, branch: string): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        await this.lock.run(repo.id, async () => {
            const cmd = new GitCommandBuilder('rebase').value(branch);
            await this.cli.out(repo.rootPath, cmd.build(), { timeout: 120_000 });
        });
    }

    /** Compare branch with the current one: opens a virtual document with the commit list. */
    async compare(repositoryId: string, branch: string): Promise<string> {
        const repo = this.repositories.getRequired(repositoryId);
        const current = repo.getHead().branch ?? 'HEAD';
        const out = await this.cli.out(repo.rootPath, [
            'log', '--oneline', '--no-decorate', `${current}..${branch}`
        ]);
        return out || 'No commits to compare.';
    }

    async setUpstream(repositoryId: string, branch: string, remote: string): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        await this.lock.run(repo.id, async () => {
            await repo.vscodeRepository.push(remote, branch, true);
        });
    }

    private async validateBranchName(root: string, name: string): Promise<void> {
        if (!name || name.trim() !== name || name.startsWith('-')) {
            throw new GitError(GitErrorCode.INVALID_INPUT, `Invalid branch name: "${name}"`);
        }
        try {
            await this.cli.out(root, ['check-ref-format', '--branch', name]);
        } catch {
            throw new GitError(GitErrorCode.INVALID_INPUT, `"${name}" is not a valid branch name.`);
        }
    }
}
