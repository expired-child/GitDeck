import * as vscode from 'vscode';
import * as path from 'node:path';
import { GitCli } from '../../infrastructure/git-cli/GitCli';
import type { RepositoryManager } from '../repository/RepositoryService';

/**
 * Conflict integration (document §59): the first version delegates the actual
 * resolution to the VS Code Merge Editor and only orchestrates continue/abort.
 */
export class ConflictService {
    constructor(
        private readonly repositories: RepositoryManager,
        private readonly cli: GitCli
    ) {}

    /** Opens the VS Code Merge Editor for one conflicted file. */
    async openMergeEditor(repositoryId: string, relativePath: string): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        const uri = vscode.Uri.file(path.join(repo.rootPath, ...relativePath.split('/')));
        await vscode.commands.executeCommand('git.openMergeEditor', {
            theirs: this.repositories.toGitUri(uri, 'MERGE_HEAD'),
            ours: this.repositories.toGitUri(uri, 'HEAD'),
            local: uri
        });
    }

    async continue(repositoryId: string): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        const { state } = await repo.detectState();
        if (state === 'REBASING') {
            await this.cli.out(repo.rootPath, ['rebase', '--continue'], { timeout: 120_000 });
        } else if (state === 'CHERRY_PICKING') {
            await this.cli.out(repo.rootPath, ['cherry-pick', '--continue'], { timeout: 120_000 });
        } else if (state === 'REVERTING') {
            await this.cli.out(repo.rootPath, ['revert', '--continue'], { timeout: 120_000 });
        } else {
            await this.cli.out(repo.rootPath, ['commit', '--no-edit'], { timeout: 120_000 });
        }
    }

    async skip(repositoryId: string): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        await this.cli.out(repo.rootPath, ['rebase', '--skip'], { timeout: 120_000 });
    }

    async abort(repositoryId: string): Promise<void> {
        const repo = this.repositories.getRequired(repositoryId);
        const { state } = await repo.detectState();
        if (state === 'REBASING') {
            await this.cli.out(repo.rootPath, ['rebase', '--abort'], { timeout: 120_000 });
        } else if (state === 'CHERRY_PICKING') {
            await this.cli.out(repo.rootPath, ['cherry-pick', '--abort'], { timeout: 120_000 });
        } else if (state === 'REVERTING') {
            await this.cli.out(repo.rootPath, ['revert', '--abort'], { timeout: 120_000 });
        } else {
            await this.cli.out(repo.rootPath, ['merge', '--abort'], { timeout: 120_000 });
        }
    }
}
