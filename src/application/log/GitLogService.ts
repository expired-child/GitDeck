import type { CancellationToken } from 'vscode';
import type { Commit } from '../../domain/commit/Commit';
import type { ChangeStatusCode } from '../../domain/change/ChangeStatus';
import type {
    GitLogPageDto, GitLogRequestDto, CommitFileDto, CommitDetailsDto, CommitDto
} from '../../shared/protocol';
import { GitCli } from '../../infrastructure/git-cli/GitCli';
import { GitCommandBuilder } from '../../infrastructure/git-cli/GitCommandBuilder';
import { GitLogParser, LOG_FORMAT, LOG_WITH_BODY_FORMAT } from '../../infrastructure/git-cli/GitLogParser';
import type { RepositoryManager } from '../repository/RepositoryService';

/**
 * 未推送提交的采集上限。`rev-list` 按提交时间倒序输出，因此只保留最近的本地提交；
 * 超过该数量级的仓库，更早的提交会按“已推送”处理（正常仓库远达不到）。
 */
const LOCAL_ONLY_LIMIT = 2000;

/**
 * Git Log service (document §14, §16, §18, §19, §85).
 * Always paged — never loads the whole history (document §16).
 */
export class GitLogService {
    private readonly parser = new GitLogParser();
    /**
     * 未推送提交集合按仓库缓存：翻页时复用，只有页 0（重新加载）才重新计算，
     * 避免每次滚动加载都遍历一遍历史。
     */
    private readonly localOnlyCache = new Map<string, Set<string> | null>();

    constructor(
        private readonly repositories: RepositoryManager,
        private readonly cli: GitCli
    ) {}

    async load(request: GitLogRequestDto, cancellationToken?: CancellationToken): Promise<GitLogPageDto> {
        const repo = this.repositories.getRequired(request.repositoryId);
        const pageSize = Math.max(1, request.pageSize);

        const cmd = new GitCommandBuilder('log')
            .raw(`--pretty=format:${LOG_FORMAT}`)
            .flag('--date=iso-strict', `--max-count=${pageSize + 1}`, `--skip=${Math.max(0, request.page) * pageSize}`)
            .flagIf(!request.filter?.branches?.length, '--all');

        const filter = request.filter ?? {};
        if (filter.text) {
            cmd.flag(`--grep=${filter.text}`, '--fixed-strings', '--all-match', '-i');
        }
        for (const author of filter.authors ?? []) {
            cmd.flag(`--author=${author}`);
        }
        if (filter.after) { cmd.flag(`--since=${filter.after}`); }
        if (filter.before) { cmd.flag(`--until=${filter.before}`); }

        if (filter.branches?.length) {
            cmd.value(...filter.branches);
        }
        if (filter.paths?.length) {
            cmd.raw('--').value(...filter.paths);
        }

        const out = await this.cli.out(repo.rootPath, cmd.build(), {
            timeout: 60_000,
            cancellation: cancellationToken
        });
        const commits = this.parser.parseCommits(out);
        const hasMore = commits.length > pageSize;
        const localOnly = await this.getLocalOnlyHashes(repo.rootPath, repo.id, request.page <= 0);
        return {
            commits: (hasMore ? commits.slice(0, pageSize) : commits).map(c => toCommitDto(c, localOnly)),
            hasMore,
            page: request.page
        };
    }

    /**
     * 本地分支可达、但任何远端跟踪引用都不可达的提交集合，用于区分
     * “已提交到本地”与“已推送到云端”。
     *
     * 返回 null 表示不做区分：仓库没有任何远端跟踪引用时无从比较，
     * 此时若照常标记会把整个历史都染成“本地提交”。
     */
    private async getLocalOnlyHashes(root: string, repositoryId: string, recompute: boolean): Promise<Set<string> | null> {
        if (!recompute && this.localOnlyCache.has(repositoryId)) {
            return this.localOnlyCache.get(repositoryId) ?? null;
        }
        const hashes = await this.collectLocalOnly(root);
        this.localOnlyCache.set(repositoryId, hashes);
        return hashes;
    }

    private async collectLocalOnly(root: string): Promise<Set<string> | null> {
        try {
            const remoteRefs = await this.cli.out(root, ['for-each-ref', '--count=1', '--format=%(refname)', 'refs/remotes']);
            if (!remoteRefs.trim()) { return null; }
            const out = await this.cli.out(root, [
                'rev-list', `--max-count=${LOCAL_ONLY_LIMIT}`, '--branches', '--not', '--remotes'
            ]);
            return new Set(out.split('\n').map(line => line.trim()).filter(Boolean));
        } catch {
            // 标记失败不能让日志本身失败，退化为不做区分。
            return null;
        }
    }

    async getCommit(repositoryId: string, hash: string): Promise<CommitDetailsDto> {
        const repo = this.repositories.getRequired(repositoryId);
        const cmd = new GitCommandBuilder('show')
            .flag('--no-patch', '--no-color')
            .raw(`--pretty=format:${LOG_WITH_BODY_FORMAT}`)
            .value(hash);
        const out = await this.cli.out(repo.rootPath, cmd.build());
        const commit = this.parser.parseCommitWithBody(out);
        if (!commit) {
            throw new Error(`Commit not found: ${hash}`);
        }
        return { ...toCommitDto(commit), body: commit.body };
    }

    async getChangedFiles(repositoryId: string, hash: string): Promise<CommitFileDto[]> {
        const repo = this.repositories.getRequired(repositoryId);
        const commits = await this.getParentInfo(repo.rootPath, hash);
        let out: string;
        if (commits.parents.length === 0) {
            // Root commit: diff against the empty tree.
            const cmd = new GitCommandBuilder('diff-tree')
                .flag('--root', '--no-commit-id', '--name-status', '-r', '-M')
                .value(hash);
            out = await this.cli.out(repo.rootPath, cmd.build());
        } else {
            const cmd = new GitCommandBuilder('diff')
                .flag('--name-status', '-M', '--no-color')
                .value(`${commits.parents[0]}`, hash);
            out = await this.cli.out(repo.rootPath, cmd.build());
        }
        return this.parseNameStatus(out);
    }

    /** Lists commits between an upstream and HEAD (document §32 push preview). */
    async getCommitsAhead(repositoryId: string): Promise<CommitDto[]> {
        const repo = this.repositories.getRequired(repositoryId);
        if (!repo.getHead().commit) { return []; }
        const cmd = new GitCommandBuilder('log')
            .raw(`--pretty=format:${LOG_FORMAT}`)
            .flag('--date=iso-strict')
            .flag('--max-count=200')
            .value(repo.getHead().upstream ? '@{u}..HEAD' : 'HEAD');
        const out = await this.cli.out(repo.rootPath, cmd.build());
        return this.parser.parseCommits(out).map(c => toCommitDto(c));
    }

    private async getParentInfo(root: string, hash: string): Promise<{ parents: string[] }> {
        const out = await this.cli.out(root, ['rev-list', '--parents', '-n', '1', hash]);
        const parts = out.trim().split(' ');
        return { parents: parts.slice(1) };
    }

    private parseNameStatus(out: string): CommitFileDto[] {
        const files: CommitFileDto[] = [];
        for (const line of out.split('\n')) {
            if (!line.trim()) { continue; }
            const parts = line.split('\t');
            const rawStatus = parts[0];
            const code = rawStatus[0] as ChangeStatusCode;
            if ((code === 'R' || code === 'C') && parts.length >= 3) {
                files.push({ status: code, originalPath: parts[1], path: parts[2] });
            } else if (parts.length >= 2) {
                files.push({ status: code, path: parts[1] });
            }
        }
        return files;
    }
}

function toCommitDto(c: Commit, localOnly?: Set<string> | null): CommitDto {
    return {
        hash: c.hash,
        parents: c.parents,
        authorName: c.authorName,
        authorEmail: c.authorEmail,
        date: c.date,
        refs: c.refs,
        subject: c.subject,
        localOnly: localOnly ? localOnly.has(c.hash) : false
    };
}
