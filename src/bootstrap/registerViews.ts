import * as vscode from 'vscode';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { DiffTargetDto } from '../shared/protocol';
import { WebviewMessageRouter } from '../presentation/webview/WebviewMessageRouter';
import { GitViewProvider } from '../presentation/webview/GitViewProvider';
import { WebviewStateBridge } from '../presentation/webview/WebviewStateBridge';
import { NativeDiffController } from '../presentation/diff/NativeDiffController';
import { discardChanges } from '../presentation/commands/CommitCommands';
import { promptForAiApiKey } from '../presentation/commands/AiCommands';
import { GitError, GitErrorCode } from '../shared/GitError';
import type { GitWebviewNotifier } from '../presentation/commands/GitWebviewNotifier';
import type { RepositoryManager } from '../application/repository/RepositoryService';
import type { GitStatusService } from '../application/status/GitStatusService';
import type { CommitService } from '../application/commit/CommitService';
import type { BranchService } from '../application/branch/BranchService';
import type { GitLogService } from '../application/log/GitLogService';
import type { FileHistoryService } from '../application/history/FileHistoryService';
import type { DiffService } from '../application/diff/DiffService';
import type { RemoteService } from '../application/remote/RemoteService';
import type { ConflictService } from '../application/conflict/ConflictService';
import type { StashService } from '../application/stash/StashService';
import type { ChangelistService } from '../application/changelist/ChangelistService';
import type { CommitMessageService } from '../application/ai/CommitMessageService';
import type { GitOperationLock } from '../application/repository/RepositoryService';
import type { ExtensionStorage } from '../infrastructure/persistence/ExtensionStorage';

export interface ViewServices {
    repositories: RepositoryManager;
    lock: GitOperationLock;
    status: GitStatusService;
    commits: CommitService;
    branches: BranchService;
    log: GitLogService;
    history: FileHistoryService;
    diff: DiffService;
    remotes: RemoteService;
    conflicts: ConflictService;
    stashes: StashService;
    changelists: ChangelistService;
    ai: CommitMessageService;
    storage: ExtensionStorage;
    config(): { discardConfirm: boolean };
}

/**
 * Creates the typed message router (document §41), the webview provider and
 * the webview notifier facade.
 */
export function registerViews(
    context: vscode.ExtensionContext,
    services: ViewServices
): { provider: GitViewProvider; notifier: GitWebviewNotifier } {
    const stateBridge = new WebviewStateBridge(services.storage);
    const diffController = new NativeDiffController(services.diff);
    const router = new WebviewMessageRouter();
    const cliOps = new CliOps(services);

    router.onStateSave(state => stateBridge.save(state));
    router.register('git.branch.pick', async () => vscode.commands.executeCommand('ideaGit.branchPicker'));
    router.register('git.branch.new', async () => vscode.commands.executeCommand('ideaGit.newBranch'));

    router.register('git.repositories.get', async () => {
        await services.repositories.initialize();
        return services.repositories.toDto();
    });
    router.register('git.repository.setActive', async p => {
        services.repositories.setActiveRepository((p as { repositoryId: string }).repositoryId);
    });
    router.register('git.repo.init', async () => {
        await vscode.commands.executeCommand('ideaGit.initRepository');
    });
    router.register('git.status.get', async p => {
        const repo = services.repositories.getRequired((p as { repositoryId?: string } | undefined)?.repositoryId);
        await repo.vscodeRepository.status();
        return services.status.getStatus(repo);
    });
    router.register('git.log.load', async p => services.log.load(p as never));
    router.register('git.commit.getDetails', async p => {
        const { repositoryId, hash } = p as { repositoryId: string; hash: string };
        return services.log.getCommit(repositoryId, hash);
    });
    router.register('git.commit.getChangedFiles', async p => {
        const { repositoryId, hash } = p as { repositoryId: string; hash: string };
        return services.log.getChangedFiles(repositoryId, hash);
    });
    router.register('git.commit', async p => {
        await services.commits.commit(p as never);
    });
    router.register('git.commit.getLastMessage', async p => {
        const { repositoryId } = p as { repositoryId: string };
        return services.commits.getLastMessage(repositoryId);
    });
    router.register('git.commit.getMessageHistory', async () => services.commits.getMessageHistory());
    router.register('git.ai.generateCommitMessage', async p => {
        const { repositoryId, paths } = p as { repositoryId: string; paths: string[] };
        if (!(await services.ai.hasApiKey()) && !(await promptForAiApiKey(services.storage))) {
            throw new GitError(GitErrorCode.INVALID_INPUT, '尚未配置 AI API Key，已取消生成提交信息。');
        }
        return services.ai.generate(repositoryId, paths ?? []);
    });
    router.register('git.settings.open', async () => {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'ideaGit');
    });
    router.register('git.commit.cherryPick', async p => {
        const { repositoryId, hash } = p as { repositoryId: string; hash: string };
        await services.commits.cherryPick(repositoryId, hash);
    });
    router.register('git.commit.revert', async p => {
        const { repositoryId, hash } = p as { repositoryId: string; hash: string };
        await services.commits.revert(repositoryId, hash);
    });
    router.register('git.commit.reset', async p => {
        const { repositoryId, hash, mode } = p as { repositoryId: string; hash: string; mode: 'soft' | 'mixed' | 'hard' };
        if (mode === 'hard' && services.config().discardConfirm) {
            const confirm = await vscode.window.showWarningMessage(
                `Reset current branch to ${hash.slice(0, 7)} using HARD reset?`,
                { modal: true, detail: 'All uncommitted changes will be lost.' },
                'Hard Reset'
            );
            if (confirm !== 'Hard Reset') { return; }
        }
        await services.commits.reset(repositoryId, hash, mode);
    });
    router.register('git.commit.checkoutRevision', async p => {
        const { repositoryId, hash } = p as { repositoryId: string; hash: string };
        await services.commits.checkoutRevision(repositoryId, hash);
    });
    router.register('git.tag.create', async p => {
        const { repositoryId, name, hash } = p as { repositoryId: string; name: string; hash?: string };
        if (!name.trim()) {
            throw new Error('Tag name must not be empty.');
        }
        await services.commits.createTag(repositoryId, name.trim(), hash);
    });
    router.register('git.branch.list', async p => {
        const { repositoryId } = p as { repositoryId: string };
        return services.branches.list(repositoryId);
    });
    router.register('git.branch.checkout', async p => {
        const { repositoryId, branch } = p as { repositoryId: string; branch: string };
        await services.branches.checkout(repositoryId, branch);
    });
    router.register('git.branch.create', async p => {
        const { repositoryId, name, base, checkout } = p as { repositoryId: string; name: string; base?: string; checkout: boolean };
        await services.branches.create(repositoryId, name, base, checkout);
    });
    router.register('git.branch.rename', async p => {
        const { repositoryId, oldName, newName } = p as { repositoryId: string; oldName: string; newName: string };
        await services.branches.rename(repositoryId, oldName, newName);
    });
    router.register('git.branch.delete', async p => {
        const { repositoryId, name, force, remote } = p as { repositoryId: string; name: string; force?: boolean; remote?: boolean };
        if (remote) {
            const slash = name.indexOf('/');
            const remoteName = slash > 0 ? name.slice(0, slash) : 'origin';
            const branchName = slash > 0 ? name.slice(slash + 1) : name;
            await services.branches.deleteRemote(repositoryId, remoteName, branchName);
        } else {
            await services.branches.deleteLocal(repositoryId, name, force === true);
        }
    });
    router.register('git.branch.merge', async p => {
        const { repositoryId, branch } = p as { repositoryId: string; branch: string };
        await services.branches.merge(repositoryId, branch);
    });
    router.register('git.branch.rebase', async p => {
        const { repositoryId, branch } = p as { repositoryId: string; branch: string };
        await services.branches.rebase(repositoryId, branch);
    });
    router.register('git.branch.compare', async p => {
        const { repositoryId, branch } = p as { repositoryId: string; branch: string };
        const text = await services.branches.compare(repositoryId, branch);
        const doc = await vscode.workspace.openTextDocument({ content: `Commits in "${branch}" not in current branch:\n\n${text}`, language: 'markdown' });
        await vscode.window.showTextDocument(doc, { preview: true });
    });
    router.register('git.branch.update', async p => {
        const { repositoryId, branch } = p as { repositoryId: string; branch: string };
        await services.branches.update(repositoryId, branch);
    });
    router.register('git.branch.push', async p => {
        const { repositoryId, branch } = p as { repositoryId: string; branch: string };
        await services.branches.pushBranch(repositoryId, branch);
    });
    router.register('git.branch.diffWorktree', async p => {
        const { repositoryId, branch } = p as { repositoryId: string; branch: string };
        const text = await services.branches.diffWithWorkingTree(repositoryId, branch);
        const doc = await vscode.workspace.openTextDocument({
            content: `Working tree changes relative to "${branch}":\n\n${text || 'No differences.'}`,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc, { preview: true });
    });
    router.register('git.branch.worktree.add', async p => {
        const { repositoryId, branch, path: dir } = p as { repositoryId: string; branch: string; path: string };
        const worktreePath = await services.branches.addWorktree(repositoryId, branch, dir);
        const choice = await vscode.window.showInformationMessage(
            `Worktree created at "${worktreePath}".`,
            'Open in New Window', 'Add to Workspace'
        );
        const uri = vscode.Uri.file(worktreePath);
        if (choice === 'Open in New Window') {
            await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
        } else if (choice === 'Add to Workspace') {
            await vscode.workspace.updateWorkspaceFolders(
                vscode.workspace.workspaceFolders?.length ?? 0, 0, { uri }
            );
        }
    });
    router.register('git.branch.setUpstream', async p => {
        const { repositoryId, branch, upstream } = p as { repositoryId: string; branch: string; upstream?: string };
        await services.branches.setTracking(repositoryId, branch, upstream ?? `origin/${branch}`);
    });
    router.register('git.diff.show', async p => diffController.show(p as DiffTargetDto));
    router.register('git.file.add', async p => {
        const { repositoryId, paths } = p as { repositoryId: string; paths: string[] };
        const repo = services.repositories.getRequired(repositoryId);
        await repo.vscodeRepository.add(paths.map(rel => path.join(repo.rootPath, ...rel.split('/'))));
    });
    router.register('git.file.unstage', async p => {
        const { repositoryId, paths } = p as { repositoryId: string; paths: string[] };
        await services.commits.unstage(repositoryId, paths);
    });
    router.register('git.file.discard', async p => {
        const { repositoryId, paths } = p as { repositoryId: string; paths: string[] };
        await discardChanges(services.repositories, repositoryId, paths, services.config().discardConfirm);
    });
    router.register('git.file.ignore', async p => {
        const { repositoryId, path: relPath } = p as { repositoryId: string; path: string };
        await cliOps.addToGitignore(repositoryId, relPath);
    });
    router.register('git.file.open', async p => {
        const { repositoryId, path: relPath } = p as { repositoryId: string; path: string };
        const repo = services.repositories.getRequired(repositoryId);
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(path.join(repo.rootPath, ...relPath.split('/'))));
    });
    router.register('git.remote.fetch', async p => {
        const { repositoryId, prune } = p as { repositoryId: string; prune?: boolean };
        await services.remotes.fetch(repositoryId, prune === true);
    });
    router.register('git.remote.updateLog', async p => {
        return services.remotes.updateLog((p as { repositoryId: string }).repositoryId);
    });
    router.register('git.remote.pull', async p => {
        const { repositoryId } = p as { repositoryId: string };
        await services.remotes.pull(repositoryId, vscode.workspace.getConfiguration('ideaGit').get<'merge' | 'rebase'>('pullMode', 'merge') === 'rebase');
    });
    router.register('git.remote.push', async p => {
        const { repositoryId, force } = p as { repositoryId: string; force?: boolean };
        await services.remotes.push(repositoryId, force === true);
    });
    router.register('git.remote.pushPreview', async p => {
        const { repositoryId } = p as { repositoryId: string };
        return services.remotes.pushPreview(repositoryId);
    });
    router.register('git.stash.list', async p => {
        const { repositoryId } = p as { repositoryId: string };
        return services.stashes.list(repositoryId);
    });
    router.register('git.stash.push', async p => {
        const { repositoryId, message } = p as { repositoryId: string; message?: string };
        await services.stashes.push(repositoryId, message);
    });
    router.register('git.stash.apply', async p => {
        const { repositoryId, index, pop } = p as { repositoryId: string; index: number; pop: boolean };
        await services.stashes.apply(repositoryId, index, pop);
    });
    router.register('git.stash.drop', async p => {
        const { repositoryId, index } = p as { repositoryId: string; index: number };
        await services.stashes.drop(repositoryId, index);
    });
    router.register('git.changelist.list', async p => {
        const { repositoryId } = p as { repositoryId: string };
        return services.changelists.list(repositoryId);
    });
    router.register('git.patch.get', async p => {
        const { repositoryId, paths } = p as { repositoryId: string; paths?: string[] };
        return services.commits.getPatch(repositoryId, paths ?? []);
    });
    router.register('git.patch.save', async p => {
        const { repositoryId, paths } = p as { repositoryId: string; paths?: string[] };
        const patch = await services.commits.getPatch(repositoryId, paths ?? []);
        if (!patch.trim()) {
            throw new Error('No local changes to create a patch from.');
        }
        const repo = services.repositories.getRequired(repositoryId);
        const target = await vscode.window.showSaveDialog({
            title: 'Create Patch from Local Changes',
            defaultUri: vscode.Uri.file(path.join(repo.rootPath, 'changes.patch')),
            filters: { 'Patch Files': ['patch', 'diff'], 'All Files': ['*'] }
        });
        if (!target) { return; }
        await vscode.workspace.fs.writeFile(target, Buffer.from(patch, 'utf8'));
        void vscode.window.showInformationMessage(`Patch saved to ${target.fsPath}`);
    });
    router.register('git.changes.shelve', async p => {
        const { repositoryId, paths, message } = p as { repositoryId: string; paths?: string[]; message?: string };
        await services.commits.shelve(repositoryId, paths ?? [], message);
    });
    router.register('git.changelist.create', async p => {
        const { repositoryId, name } = p as { repositoryId: string; name: string };
        return services.changelists.create(repositoryId, name);
    });
    router.register('git.changelist.delete', async p => {
        const { repositoryId, name } = p as { repositoryId: string; name: string };
        return services.changelists.remove(repositoryId, name);
    });
    router.register('git.changelist.rename', async p => {
        const { repositoryId, oldName, newName } = p as { repositoryId: string; oldName: string; newName: string };
        return services.changelists.rename(repositoryId, oldName, newName);
    });
    router.register('git.changelist.moveFiles', async p => {
        const { repositoryId, name, paths } = p as { repositoryId: string; name: string; paths: string[] };
        return services.changelists.moveFiles(repositoryId, name, paths);
    });
    router.register('git.changelist.unassign', async p => {
        const { repositoryId, paths } = p as { repositoryId: string; paths: string[] };
        return services.changelists.removePaths(repositoryId, paths);
    });
    router.register('git.operation.continue', async p => {
        const { repositoryId } = p as { repositoryId: string };
        await services.conflicts.continue(repositoryId);
    });
    router.register('git.operation.skip', async p => {
        const { repositoryId } = p as { repositoryId: string };
        await services.conflicts.skip(repositoryId);
    });
    router.register('git.operation.abort', async p => {
        const { repositoryId } = p as { repositoryId: string };
        const confirm = await vscode.window.showWarningMessage(
            'Abort the current git operation?',
            { modal: true, detail: 'All operation-specific changes will be discarded.' },
            'Abort'
        );
        if (confirm === 'Abort') {
            await services.conflicts.abort(repositoryId);
        }
    });
    router.register('git.history.load', async p => services.history.load(p as never));
    router.register('git.history.diff', async p => {
        const { repositoryId, path: relPath, hash } = p as { repositoryId: string; path: string; hash: string };
        await diffController.show({ kind: 'commit-file', path: relPath, hash, repositoryId });
    });

    const provider = new GitViewProvider(context.extensionUri, router, () => {
        const persisted = stateBridge.load();
        if (!persisted.activeTab) {
            persisted.activeTab = vscode.workspace
                .getConfiguration('ideaGit')
                .get<string>('defaultView', 'changes');
        }
        return persisted;
    });

    services.remotes.onLogUpdated = result => provider.postEvent({ type: 'remoteLog.updated', result });
    context.subscriptions.push(
        { dispose: () => { services.remotes.onLogUpdated = undefined; } },
        vscode.window.registerWebviewViewProvider(GitViewProvider.viewId, provider, {
            webviewOptions: { retainContextWhenHidden: true }
        }),
        vscode.window.registerWebviewViewProvider(GitViewProvider.logViewId, {
            resolveWebviewView: view => provider.resolveSurface(view, 'log')
        }, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    const notifier: GitWebviewNotifier = {
        async openChanges(): Promise<void> {
            await provider.reveal();
            provider.postEvent({ type: 'view.showTab', tab: 'changes' });
        },
        async openLog(): Promise<void> {
            await provider.reveal('log');
            provider.postEvent({ type: 'view.showTab', tab: 'log' });
        },
        async openHistory(relPath: string, repositoryId?: string): Promise<void> {
            await provider.reveal('history');
            provider.postEvent({
                type: 'view.showTab',
                tab: 'history',
                path: relPath,
                repositoryId: repositoryId ?? services.repositories.getActiveRepository()?.id
            });
        },
        refresh(): void {
            provider.postEvent({ type: 'repository.changed', ...services.repositories.toDto() });
            provider.postEvent({ type: 'repository.refresh', repositoryId: services.repositories.getActiveRepository()?.id ?? '' });
        }
    };

    router.register('git.view.open', async p => {
        const { tab, path: filePath } = p as { tab: 'changes' | 'log' | 'history'; path?: string };
        if (tab === 'changes') { await notifier.openChanges(); }
        else if (tab === 'history' && filePath) { await notifier.openHistory(filePath); }
        else { await notifier.openLog(); }
    });

    return { provider, notifier };
}

/** Small helper grouping file-level operations for router handlers. */
class CliOps {
    constructor(private readonly services: ViewServices) {}

    async addToGitignore(repositoryId: string, relPath: string): Promise<void> {
        const repo = this.services.repositories.getRequired(repositoryId);
        const ignorePath = path.join(repo.rootPath, '.gitignore');
        let content = '';
        try {
            content = await fs.readFile(ignorePath, 'utf8');
        } catch {
            // no .gitignore yet
        }
        const entry = relPath.replace(/\\/g, '/');
        if (content.split('\n').some(line => line.trim() === entry)) {
            return;
        }
        const next = content.endsWith('\n') || content === '' ? `${content}${entry}\n` : `${content}\n${entry}\n`;
        await fs.writeFile(ignorePath, next, 'utf8');
    }
}
