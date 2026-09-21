import { GitCommandBuilder } from '../../infrastructure/git-cli/GitCommandBuilder';
import { GitCli } from '../../infrastructure/git-cli/GitCli';
import { GitLogParser } from '../../infrastructure/git-cli/GitLogParser';
import type { StashDto } from '../../shared/protocol';
import type { RepositoryManager } from '../repository/RepositoryService';

/**
 * Stash support (document §31).
 */
export class StashService {
    private readonly parser = new GitLogParser();

    constructor(
        private readonly repositories: RepositoryManager,
        private readonly cli: GitCli
    ) {}

    async list(repositoryId: string): Promise<StashDto[]> {
        const repo = this.repositories.getRequired(repositoryId);
        const out = await this.cli.out(repo.rootPath, [
            'stash', 'list', '--date=iso-strict',
            '--pretty=format:%gd\x1f%H\x1f%gs\x1f%ad\x1e'
        ]);
        return this.parser.parseStashes(out);
    }

    async push(repositoryId: string, message?: string): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        const args = message
            ? ['stash', 'push', '-m', message]
            : ['stash', 'push'];
        await this.cli.out(repo.rootPath, args, { timeout: 120_000 });
    }

    async apply(repositoryId: string, index: number, pop: boolean): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        const cmd = new GitCommandBuilder('stash')
            .flag(pop ? 'pop' : 'apply')
            .value(`stash@{${index}}`);
        await this.cli.out(repo.rootPath, cmd.build(), { timeout: 120_000 });
    }

    async drop(repositoryId: string, index: number): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        const cmd = new GitCommandBuilder('stash')
            .flag('drop')
            .value(`stash@{${index}}`);
        await this.cli.out(repo.rootPath, cmd.build());
    }
}
