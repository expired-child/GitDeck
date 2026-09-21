import * as vscode from 'vscode';
import * as path from 'node:path';
import type { CommitService } from '../../application/commit/CommitService';
import type { RepositoryManager } from '../../application/repository/RepositoryService';
import type { GitWebviewNotifier } from './GitWebviewNotifier';

/**
 * Commit-related palette commands (document §52, §53).
 * The actual commit UI lives in the webview; these commands open it.
 */
export function registerCommitCommands(
    commands: Record<string, (...args: unknown[]) => unknown>,
    repositories: RepositoryManager,
    commits: CommitService,
    notifier: GitWebviewNotifier
): void {
    commands['ideaGit.commit'] = () => notifier.openChanges();

    commands['ideaGit.openCommit'] = () => notifier.openChanges();
}

/** Discard helper used by the webview and command palette. */
export async function discardChanges(
    repositories: RepositoryManager,
    repositoryId: string,
    paths: string[],
    confirm: boolean
): Promise<void> {
    const repo = repositories.getRequired(repositoryId);
    if (confirm) {
        const label = paths.length === 1 ? paths[0] : `${paths.length} files`;
        const choice = await vscode.window.showWarningMessage(
            `Discard changes in ${label}?`,
            { modal: true, detail: 'This operation cannot be undone by Git.' },
            'Discard'
        );
        if (choice !== 'Discard') {
            return;
        }
    }
    const uris = paths.map(p => path.join(repo.rootPath, ...p.split('/')));
    await repo.vscodeRepository.clean(uris);
}
