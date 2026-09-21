import * as path from 'node:path';
import { GitError, GitErrorCode } from '../../shared/GitError';
import type { CommitRequestDto } from '../../shared/protocol';
import { GitCli } from '../../infrastructure/git-cli/GitCli';
import { GitCommandBuilder } from '../../infrastructure/git-cli/GitCommandBuilder';
import { GitOperationLock, type RepositoryManager } from '../repository/RepositoryService';
import type { ExtensionStorage } from '../../infrastructure/persistence/ExtensionStorage';

/**
 * Commit workflow (document §11):
 * select files -> message -> pre-commit check -> stage selected -> commit -> record message.
 */
export class CommitService {
    constructor(
        private readonly repositories: RepositoryManager,
        private readonly lock: GitOperationLock,
        private readonly cli: GitCli,
        private readonly storage: ExtensionStorage
    ) {}

    async commit(request: CommitRequestDto): Promise<void> {
        const repo = this.repositories.getRequired(request.repositoryId);
        const message = request.message.trim();

        if (!request.amend && !message) {
            throw new GitError(GitErrorCode.INVALID_INPUT, 'Commit message is empty.');
        }
        if (!request.amend && request.paths.length === 0) {
            throw new GitError(GitErrorCode.INVALID_INPUT, 'No files selected for commit.');
        }
        if (request.amend && !message) {
            // Amend without a new message: keep the previous one.
            request.message = await this.getLastMessage(repo.id);
        }

        await this.lock.run(repo.id, async () => {
            if (request.paths.length > 0) {
                const uris = request.paths.map(p => path.join(repo.rootPath, ...p.split('/')));
                await repo.vscodeRepository.add(uris);
            }
            await repo.vscodeRepository.commit(request.message, { amend: request.amend });
        });

        await this.storage.addCommitMessage(message || request.message);
    }

    async getLastMessage(repositoryId: string): Promise<string> {
        const repo = this.repositories.getRequired(repositoryId);
        return (
            await this.cli.out(repo.rootPath, ['log', '-1', '--pretty=%B'])
        ).trim();
    }

    getMessageHistory(): string[] {
        return this.storage.getCommitMessageHistory();
    }

    async cherryPick(repositoryId: string, hash: string): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        await this.lock.run(repo.id, async () => {
            await this.cli.out(repo.rootPath, ['cherry-pick', hash], { timeout: 120_000 });
        });
    }

    async revert(repositoryId: string, hash: string): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        await this.lock.run(repo.id, async () => {
            await this.cli.out(repo.rootPath, ['revert', '--no-edit', hash], { timeout: 120_000 });
        });
    }

    async reset(repositoryId: string, hash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        await this.lock.run(repo.id, async () => {
            await this.cli.out(repo.rootPath, ['reset', `--${mode}`, hash], { timeout: 120_000 });
        });
    }

    async checkoutRevision(repositoryId: string, hash: string): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        await this.lock.run(repo.id, async () => {
            await repo.vscodeRepository.checkout(hash);
        });
    }

    async createTag(repositoryId: string, name: string, hash?: string): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        await this.lock.run(repo.id, async () => {
            const args = hash ? ['tag', name, hash] : ['tag', name];
            await this.cli.out(repo.rootPath, args);
        });
    }

    async unstage(repositoryId: string, paths: string[]): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        await this.lock.run(repo.id, async () => {
            await this.cli.out(repo.rootPath, ['reset', '--', ...paths]);
        });
    }
}

/** Re-exported builder helper for other services. */
export function gitCommand(subcommand: string): GitCommandBuilder {
    return new GitCommandBuilder(subcommand);
}
