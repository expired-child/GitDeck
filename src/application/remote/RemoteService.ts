import type { PushPreviewDto, RemoteLogDto } from '../../shared/protocol';
import { GitCli } from '../../infrastructure/git-cli/GitCli';
import { GitOperationLock, type RepositoryManager } from '../repository/RepositoryService';
import { ForcePushMode } from '../../infrastructure/vscode-git/git';
import { GitLogParser, LOG_FORMAT } from '../../infrastructure/git-cli/GitLogParser';
import type { GitLogService } from '../log/GitLogService';

/**
 * Remote operations (document §32-§35): fetch / pull / push.
 * Force push always uses --force-with-lease (document §4.4, §33).
 */
export class RemoteService {
    private readonly updating = new Map<string, Promise<RemoteLogDto>>();
    onLogUpdated?: (result: RemoteLogDto) => void;

    constructor(
        private readonly repositories: RepositoryManager,
        private readonly cli: GitCli,
        private readonly logService: GitLogService,
        private readonly lock: GitOperationLock = new GitOperationLock()
    ) {}

    async fetch(repositoryId: string, prune: boolean): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        await this.lock.run(repo.id, async () => {
            await repo.vscodeRepository.fetch({ all: prune, prune });
            await repo.vscodeRepository.status();
        });
    }

    async pull(repositoryId: string, rebase: boolean): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        await this.lock.run(repo.id, async () => {
            await this.cli.out(repo.rootPath, ['pull', rebase ? '--rebase' : '--no-rebase'], { timeout: 120_000 });
            await repo.vscodeRepository.status();
        });
    }

    async push(repositoryId: string, force: boolean): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        await this.lock.run(repo.id, async () => {
            const head = repo.getHead();
            const mode = force ? ForcePushMode.ForceWithLease : undefined;
            if (!head.upstream && head.branch) {
                const remotes = repo.getRemotes();
                if (remotes.length === 0) { throw new Error('No remote configured for this repository.'); }
                await repo.vscodeRepository.push(remotes[0], head.branch, true, mode);
            } else {
                await repo.vscodeRepository.push(undefined, undefined, false, mode);
            }
        });
    }

    async pushPreview(repositoryId: string): Promise<PushPreviewDto> {
        const repo = this.repositories.getRequired(repositoryId);
        const head = repo.getHead();
        const commits = await this.logService.getCommitsAhead(repositoryId);
        return {
            repositoryId,
            branch: head.branch ?? 'HEAD',
            upstream: head.upstream ? `${head.upstream.remote}/${head.upstream.name}` : null,
            commits
        };
    }

    /** Fetch only the tracked remote branch; never move HEAD, index or worktree. */
    updateLog(repositoryId: string): Promise<RemoteLogDto> {
        const pending = this.updating.get(repositoryId);
        if (pending) { return pending; }
        const operation = this.lock.run(repositoryId, async () => {
            const repo = this.repositories.getRequired(repositoryId);
            await repo.vscodeRepository.status();
            const head = repo.getHead();
            if (!head.branch || !head.commit || !head.upstream) {
                throw new Error('当前分支未设置上游分支，无法检查远端提交。请先设置跟踪分支。');
            }
            const { remote, name } = head.upstream;
            if (remote === '.') { throw new Error('当前分支跟踪的是本地分支，没有远端提交可更新。'); }
            // Explicit remote-tracking destination: even a custom fetch refspec cannot update a local branch.
            await repo.vscodeRepository.fetch({
                remote, ref: `+refs/heads/${name}:refs/remotes/${remote}/${name}`, prune: false
            });
            await repo.vscodeRepository.status();
            const current = repo.getHead();
            if (current.branch !== head.branch || current.commit !== head.commit
                || current.upstream?.remote !== remote || current.upstream?.name !== name) {
                throw new Error('检查期间当前分支已变化，请重新更新提交日志。');
            }
            const upstreamRef = `refs/remotes/${remote}/${name}`;
            // Freeze both revisions so external commits/checkouts cannot mix the result.
            const remoteCommit = (await this.cli.out(repo.rootPath, ['rev-parse', '--verify', upstreamRef])).trim();
            const [counts, output] = await Promise.all([
                this.cli.out(repo.rootPath, ['rev-list', '--left-right', '--count', `${head.commit}...${remoteCommit}`]),
                this.cli.out(repo.rootPath, ['log', '--max-count=100', '--date=iso-strict',
                    `--pretty=format:${LOG_FORMAT}`, `${head.commit}..${remoteCommit}`])
            ]);
            const [ahead, behind] = counts.trim().split(/\s+/).map(Number);
            const result: RemoteLogDto = {
                repositoryId, branch: head.branch, headCommit: head.commit,
                upstream: `${remote}/${name}`, checkedAt: new Date().toISOString(), ahead, behind,
                commits: new GitLogParser().parseCommits(output)
            };
            this.onLogUpdated?.(result);
            return result;
        }).finally(() => { this.updating.delete(repositoryId); });
        this.updating.set(repositoryId, operation);
        return operation;
    }
}
