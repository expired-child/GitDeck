import * as vscode from 'vscode';
import type { RepositoryManager, GitOperationLock } from '../application/repository/RepositoryService';
import type { RemoteService } from '../application/remote/RemoteService';
import type { Logger } from '../shared/logger';

/** Background metadata checks only while the editor is focused. */
export function registerRemoteUpdates(
    context: vscode.ExtensionContext, repositories: RepositoryManager,
    remotes: RemoteService, lock: GitOperationLock, logger: Logger
): void {
    let timer: NodeJS.Timeout | undefined;
    let running = false;
    const check = async () => {
        const repo = repositories.getActiveRepository();
        if (running || !vscode.window.state.focused || !repo || lock.isBusy(repo.id)
            || !repo.getHead().upstream || repo.getHead().upstream?.remote === '.') { return; }
        running = true;
        try {
            await remotes.updateLog(repo.id);
        } catch (error) {
            // A failed check must not be presented as "up to date".
            logger.error('Automatic remote log check failed', error instanceof Error ? error.message : String(error));
        } finally { running = false; }
    };
    const configure = () => {
        clearInterval(timer);
        const seconds = vscode.workspace.getConfiguration('ideaGit').get<number>('remoteLog.autoRefreshInterval', 180);
        if (Number.isFinite(seconds) && seconds > 0) {
            timer = setInterval(() => { void check(); }, Math.max(30, seconds) * 1000);
        }
    };
    configure();
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('ideaGit.remoteLog.autoRefreshInterval')) { configure(); }
        }),
        { dispose: () => clearInterval(timer) }
    );
}
