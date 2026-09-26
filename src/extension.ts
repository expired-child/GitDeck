import * as vscode from 'vscode';
import { Logger } from './shared/logger';
import { VscodeGitAdapter } from './infrastructure/vscode-git/VscodeGitAdapter';
import { GitCli } from './infrastructure/git-cli/GitCli';
import { ExtensionStorage } from './infrastructure/persistence/ExtensionStorage';
import { RepositoryManager, GitOperationLock } from './application/repository/RepositoryService';
import { GitStatusService } from './application/status/GitStatusService';
import { CommitService } from './application/commit/CommitService';
import { BranchService } from './application/branch/BranchService';
import { GitLogService } from './application/log/GitLogService';
import { FileHistoryService } from './application/history/FileHistoryService';
import { DiffService } from './application/diff/DiffService';
import { RemoteService } from './application/remote/RemoteService';
import { ConflictService } from './application/conflict/ConflictService';
import { StashService } from './application/stash/StashService';
import { ChangelistService } from './application/changelist/ChangelistService';
import { CommitMessageService } from './application/ai/CommitMessageService';
import { registerCommands } from './bootstrap/registerCommands';
import { registerViews } from './bootstrap/registerViews';
import { registerRemoteUpdates } from './bootstrap/registerRemoteUpdates';
import { registerLogAutoRefresh } from './bootstrap/registerLogAutoRefresh';
import { registerEvents } from './bootstrap/registerEvents';
import { GitStatusBar } from './presentation/statusbar/GitStatusBar';

export function activate(context: vscode.ExtensionContext): void {
    const outputChannel = vscode.window.createOutputChannel('IDEA Git');
    context.subscriptions.push(outputChannel);

    const logger = new Logger();
    logger.addSink({ appendLine: line => outputChannel.appendLine(line) });
    logger.info('IDEA Git activating');

    const gitAdapter = new VscodeGitAdapter();
    const storage = new ExtensionStorage(context);
    const repositories = new RepositoryManager(gitAdapter, storage, logger);
    const lock = new GitOperationLock();
    const statusService = new GitStatusService();
    const cli = new GitCli(logger, async () => (await gitAdapter.getApi()).git.path);
    const commits = new CommitService(repositories, lock, cli, storage);
    const branches = new BranchService(repositories, lock, cli);
    const logService = new GitLogService(repositories, cli);
    const history = new FileHistoryService(repositories, cli);
    const diff = new DiffService(repositories, cli, context);
    const remotes = new RemoteService(repositories, cli, logService, lock);
    const conflicts = new ConflictService(repositories, cli);
    const stashes = new StashService(repositories, cli);
    const changelists = new ChangelistService(repositories, storage);
    const ai = new CommitMessageService(repositories, commits, storage);

    const statusBar = new GitStatusBar(repositories);
    context.subscriptions.push(statusBar, repositories);

    const config = () => ({
        forcePushConfirm: vscode.workspace.getConfiguration('ideaGit').get<boolean>('confirm.forcePush', true),
        pullMode: vscode.workspace.getConfiguration('ideaGit').get<'merge' | 'rebase'>('pullMode', 'merge'),
        discardConfirm: vscode.workspace.getConfiguration('ideaGit').get<boolean>('confirm.discardChanges', true)
    });

    const { provider, notifier } = registerViews(context, {
        repositories, lock, status: statusService, commits, branches,
        log: logService, history, diff, remotes, conflicts, stashes, changelists,
        ai, storage, config
    });

    registerCommands(context, {
        repositories, lock, commits, branches, remotes, stashes, history,
        notifier, storage, config
    });

    registerEvents(context, repositories, statusService, provider, statusBar);
    registerRemoteUpdates(context, repositories, remotes, lock, logger);
    registerLogAutoRefresh(context, repositories, remotes, lock, provider, logger);

    // Async initialization: repository detection must not block activation
    // (document §67 — activation < 300ms).
    void repositories.initialize().catch(e => {
        logger.error('Failed to initialize repositories', e instanceof Error ? e.message : String(e));
    });

    logger.info('IDEA Git activated');
}

export function deactivate(): void {
    // Resources are disposed through context.subscriptions.
}
