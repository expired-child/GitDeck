import type { HistoryEntryDto, FileHistoryRequestDto } from '../../shared/protocol';
import { GitCli } from '../../infrastructure/git-cli/GitCli';
import { GitCommandBuilder } from '../../infrastructure/git-cli/GitCommandBuilder';
import { GitLogParser, LOG_FORMAT } from '../../infrastructure/git-cli/GitLogParser';
import type { RepositoryManager } from '../repository/RepositoryService';

/**
 * File history with rename following (document §36): `git log --follow -- <path>`.
 */
export class FileHistoryService {
    private readonly parser = new GitLogParser();

    constructor(
        private readonly repositories: RepositoryManager,
        private readonly cli: GitCli
    ) {}

    async load(request: FileHistoryRequestDto): Promise<HistoryEntryDto[]> {
        const repo = this.repositories.getRequired(request.repositoryId);
        const cmd = new GitCommandBuilder('log')
            .flag('--follow', '--no-color')
            .raw(`--pretty=format:${LOG_FORMAT}`)
            .flag('--date=iso-strict', `--max-count=${Math.max(1, request.pageSize)}`, `--skip=${Math.max(0, request.page) * request.pageSize}`)
            .raw('--')
            .value(request.path);
        const out = await this.cli.out(repo.rootPath, cmd.build(), { timeout: 60_000 });
        return this.parser.parseCommits(out).map(c => ({
            hash: c.hash,
            author: c.authorName,
            date: c.date,
            subject: c.subject
        }));
    }

    /** Simple blame summary (document §37): per-line commit/author/date. */
    async blame(repositoryId: string, filePath: string): Promise<Map<number, { hash: string; author: string; date: string; summary: string }>> {
        const repo = this.repositories.getRequired(repositoryId);
        const out = await this.cli.out(repo.rootPath, ['blame', '--line-porcelain', '--', filePath], { timeout: 60_000 });
        const result = new Map<number, { hash: string; author: string; date: string; summary: string }>();
        let lineNo = 0;
        let current: { hash: string; author: string; date: string; summary: string } | null = null;
        for (const line of out.split('\n')) {
            if (line.startsWith('\t')) {
                lineNo += 1;
                if (current) {
                    result.set(lineNo, current);
                }
                continue;
            }
            if (line.length >= 40 && /^[0-9a-f]{40} /.test(line)) {
                current = { hash: line.slice(0, 40), author: '', date: '', summary: '' };
            } else if (current) {
                if (line.startsWith('author ')) { current.author = line.slice(7); }
                else if (line.startsWith('author-time ')) {
                    current.date = new Date(Number(line.slice(12)) * 1000).toISOString();
                } else if (line.startsWith('summary ')) { current.summary = line.slice(8); }
            }
        }
        return result;
    }
}
