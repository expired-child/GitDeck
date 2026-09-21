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
 * Git Log service (document §14, §16, §18, §19, §85).
 * Always paged — never loads the whole history (document §16).
 */
export class GitLogService {
    private readonly parser = new GitLogParser();

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
        return {
            commits: hasMore ? commits.slice(0, pageSize).map(toCommitDto) : commits.map(toCommitDto),
            hasMore,
            page: request.page
        };
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
        return this.parser.parseCommits(out).map(toCommitDto);
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

function toCommitDto(c: Commit): CommitDto {
    return {
        hash: c.hash,
        parents: c.parents,
        authorName: c.authorName,
        authorEmail: c.authorEmail,
        date: c.date,
        refs: c.refs,
        subject: c.subject
    };
}
