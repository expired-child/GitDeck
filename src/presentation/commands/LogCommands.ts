import * as vscode from 'vscode';
import type { RepositoryManager, GitOperationLock } from '../../application/repository/RepositoryService';
import type { GitWebviewNotifier } from './GitWebviewNotifier';
import { runCommand } from './errors';

/**
 * View navigation and repository-level commands (document §53, §91).
 */
export function registerLogCommands(
    commands: Record<string, (...args: unknown[]) => unknown>,
    repositories: RepositoryManager,
    notifier: GitWebviewNotifier,
    _lock: GitOperationLock
): void {
    commands['ideaGit.open'] = () => notifier.openChanges();

    commands['ideaGit.openLog'] = () => notifier.openLog();

    commands['ideaGit.refresh'] = runCommand(async () => {
        await repositories.refresh();
        notifier.refresh();
    });

    commands['ideaGit.selectRepository'] = runCommand(async () => {
        const all = repositories.getRepositories();
        if (all.length === 0) {
            vscode.window.showInformationMessage('No Git repositories found in this workspace.');
            return;
        }
        const picked = await vscode.window.showQuickPick(
            all.map(r => ({ label: r.name, description: r.rootPath, id: r.id })),
            { title: 'Select active repository' }
        );
        if (picked) {
            repositories.setActiveRepository(picked.id);
        }
    });

    commands['ideaGit.initRepository'] = runCommand(async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) { return; }
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Initializing Git repository...' },
            async () => {
                const { execFile } = await import('node:child_process');
                const { promisify } = await import('node:util');
                await promisify(execFile)('git', ['init'], { cwd: folder.uri.fsPath });
            }
        );
        // Give vscode.git a moment to pick up the new repository, then rescan.
        await new Promise(resolve => setTimeout(resolve, 800));
        await repositories.refresh();
        notifier.refresh();
        vscode.window.showInformationMessage('Git repository initialized.');
    });
}
