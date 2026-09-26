import * as vscode from 'vscode';
import type { RepositoryManager, GitOperationLock } from '../application/repository/RepositoryService';
import type { CommitService } from '../application/commit/CommitService';
import type { BranchService } from '../application/branch/BranchService';
import type { RemoteService } from '../application/remote/RemoteService';
import type { StashService } from '../application/stash/StashService';
import type { FileHistoryService } from '../application/history/FileHistoryService';
import type { GitWebviewNotifier } from '../presentation/commands/GitWebviewNotifier';
import type { ExtensionStorage } from '../infrastructure/persistence/ExtensionStorage';
import { registerCommitCommands } from '../presentation/commands/CommitCommands';
import { registerBranchCommands } from '../presentation/commands/BranchCommands';
import { registerLogCommands } from '../presentation/commands/LogCommands';
import { registerRemoteCommands } from '../presentation/commands/RemoteCommands';
import { registerHistoryCommands } from '../presentation/commands/HistoryCommands';
import { registerAiCommands } from '../presentation/commands/AiCommands';

export interface CommandServices {
    repositories: RepositoryManager;
    lock: GitOperationLock;
    commits: CommitService;
    branches: BranchService;
    remotes: RemoteService;
    stashes: StashService;
    history: FileHistoryService;
    notifier: GitWebviewNotifier;
    storage: ExtensionStorage;
    config(): { forcePushConfirm: boolean; pullMode: 'merge' | 'rebase'; discardConfirm: boolean };
}

/**
 * Registers every command declared in package.json (document §53).
 */
export function registerCommands(context: vscode.ExtensionContext, services: CommandServices): void {
    const commands: Record<string, (...args: unknown[]) => unknown> = {};

    registerLogCommands(commands, services.repositories, services.notifier, services.lock);
    registerCommitCommands(commands, services.repositories, services.commits, services.notifier);
    registerBranchCommands(commands, services.repositories, services.branches);
    registerRemoteCommands(commands, services.repositories, services.remotes, services.stashes, services.config);
    const blameStore: { blameDecoration?: vscode.TextEditorDecorationType } = {};
    registerHistoryCommands(commands, services.repositories, services.history, services.notifier, blameStore);
    registerAiCommands(commands, services.storage);

    for (const [id, handler] of Object.entries(commands)) {
        context.subscriptions.push(vscode.commands.registerCommand(id, handler));
    }
}
