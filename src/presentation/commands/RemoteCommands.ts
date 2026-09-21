import * as vscode from 'vscode';
import type { RemoteService } from '../../application/remote/RemoteService';
import type { StashService } from '../../application/stash/StashService';
import type { RepositoryManager } from '../../application/repository/RepositoryService';
import { runCommand } from './errors';

/**
 * Remote (push/pull/fetch) and stash commands (document §31-§35).
 */
export function registerRemoteCommands(
    commands: Record<string, (...args: unknown[]) => unknown>,
    repositories: RepositoryManager,
    remotes: RemoteService,
    stashes: StashService,
    config: () => { forcePushConfirm: boolean; pullMode: 'merge' | 'rebase' }
): void {
    commands['ideaGit.updateLog'] = runCommand(async () => {
        const repo = repositories.getRequired();
        const result = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: '更新远端提交日志（不修改代码）' },
            () => remotes.updateLog(repo.id)
        );
        vscode.window.showInformationMessage(`${result.upstream} 有 ${result.behind} 条尚未合入本地的提交。日志已更新，本地代码未改变。`);
    });
    commands['ideaGit.push'] = runCommand(async () => {
        const repo = repositories.getActiveRepository();
        if (!repo) { return; }
        const preview = await remotes.pushPreview(repo.id);
        if (preview.commits.length === 0) {
            vscode.window.showInformationMessage('Everything is up to date. Nothing to push.');
            return;
        }
        const detail = preview.commits
            .slice(0, 5)
            .map(c => `${c.hash.slice(0, 7)} ${c.subject}`)
            .join('\n')
            + (preview.commits.length > 5 ? `\n... and ${preview.commits.length - 5} more` : '');
        const buttons = ['Push', 'Force Push'];
        const chosen = await vscode.window.showInformationMessage(
            `Push ${preview.commits.length} commit(s) to ${preview.upstream ?? '(new upstream)'}?`,
            { detail },
            ...buttons
        );
        if (chosen === 'Push') {
            await withProgress('Pushing', () => remotes.push(repo.id, false));
        } else if (chosen === 'Force Push') {
            if (config().forcePushConfirm) {
                const confirm = await vscode.window.showWarningMessage(
                    'Force push to remote?',
                    { modal: true, detail: 'This rewrites the remote branch. --force-with-lease will be used.' },
                    'Force Push'
                );
                if (confirm !== 'Force Push') { return; }
            }
            await withProgress('Force pushing', () => remotes.push(repo.id, true));
        }
    });

    commands['ideaGit.pull'] = runCommand(async () => {
        const repo = repositories.getActiveRepository();
        if (!repo) { return; }
        await withProgress('Pulling', () => remotes.pull(repo.id, config().pullMode === 'rebase'));
        vscode.window.showInformationMessage('Pull completed.');
    });

    commands['ideaGit.fetch'] = runCommand(async () => {
        const repo = repositories.getActiveRepository();
        if (!repo) { return; }
        const prune = await vscode.window.showQuickPick(['Fetch', 'Fetch All & Prune'], { title: 'Fetch' });
        if (!prune) { return; }
        await withProgress('Fetching', () => remotes.fetch(repo.id, prune === 'Fetch All & Prune'));
        vscode.window.showInformationMessage('Fetch completed.');
    });

    commands['ideaGit.stashChanges'] = runCommand(async () => {
        const repo = repositories.getActiveRepository();
        if (!repo) { return; }
        const message = await vscode.window.showInputBox({ prompt: 'Stash message (optional)' });
        await stashes.push(repo.id, message);
        vscode.window.showInformationMessage('Changes stashed.');
    });

    commands['ideaGit.unstash'] = runCommand(async () => {
        const repo = repositories.getActiveRepository();
        if (!repo) { return; }
        const list = await stashes.list(repo.id);
        if (list.length === 0) {
            vscode.window.showInformationMessage('No stashes found.');
            return;
        }
        const picked = await vscode.window.showQuickPick(
            list.map(s => ({ label: `#${s.index} ${s.message}`, description: s.date, index: s.index })),
            { title: 'Apply Stash' }
        );
        if (!picked) { return; }
        const action = await vscode.window.showQuickPick(['Apply', 'Pop', 'Drop'], { title: `Stash #${picked.index}` });
        if (action === 'Apply') {
            await stashes.apply(repo.id, picked.index, false);
        } else if (action === 'Pop') {
            await stashes.apply(repo.id, picked.index, true);
        } else if (action === 'Drop') {
            const confirm = await vscode.window.showWarningMessage(
                `Drop stash #${picked.index}?`,
                { modal: true },
                'Drop'
            );
            if (confirm === 'Drop') {
                await stashes.drop(repo.id, picked.index);
            } else {
                return;
            }
        } else {
            return;
        }
        vscode.window.showInformationMessage(`Stash ${action?.toLowerCase()}ed.`);
    });
}

function withProgress(title: string, fn: () => Promise<unknown>): Thenable<unknown> {
    return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, fn);
}
