import * as vscode from 'vscode';
import type { BranchDto } from '../../shared/protocol';
import type { BranchService } from '../../application/branch/BranchService';
import type { RepositoryManager } from '../../application/repository/RepositoryService';
import { runCommand } from './errors';

/**
 * Branch operations from the Command Palette (document §22, §53, §55).
 */
export function registerBranchCommands(
    commands: Record<string, (...args: unknown[]) => unknown>,
    repositories: RepositoryManager,
    branches: BranchService
): void {
    commands['ideaGit.newBranch'] = runCommand(async () => {
        const repo = repositories.getActiveRepository();
        if (!repo) {
            void vscode.window.showWarningMessage('IDEA Git: no active Git repository. Open a workspace with a Git repository first.');
            return;
        }
        const name = await vscode.window.showInputBox({
            prompt: 'New branch name',
            placeHolder: 'feature/login',
            validateInput: v => v.trim() ? null : 'Branch name must not be empty'
        });
        if (!name) { return; }
        const base = repo.getHead().branch;
        await branches.create(repo.id, name, base, true);
        vscode.window.showInformationMessage(`Created and switched to branch "${name}".`);
    });

    commands['ideaGit.checkoutBranch'] = runCommand(async () => {
        const repo = repositories.getActiveRepository();
        if (!repo) { return; }
        const branch = await pickBranch(repositories, branches, { includeRemote: true, includeTags: false });
        if (!branch) { return; }
        await branches.checkout(repo.id, branch.name);
        vscode.window.showInformationMessage(`Switched to branch "${branch.name}".`);
    });

    commands['ideaGit.branchPicker'] = runCommand(async () => {
        const repo = repositories.getActiveRepository();
        if (!repo) {
            void vscode.window.showWarningMessage('IDEA Git: no active Git repository. Open a workspace with a Git repository first.');
            return;
        }
        const list = await branches.list(repo.id);
        const items: (vscode.QuickPickItem & { branch?: BranchDto; action?: 'new' })[] = [];
        items.push({ label: 'Local', kind: vscode.QuickPickItemKind.Separator });
        for (const b of list.filter(x => x.type === 'local')) {
            items.push({
                label: b.current ? `✓ ${b.name}` : b.name,
                description: b.upstream ?? undefined,
                branch: b
            });
        }
        items.push({ label: 'Remote', kind: vscode.QuickPickItemKind.Separator });
        for (const b of list.filter(x => x.type === 'remote')) {
            items.push({ label: b.name, branch: b });
        }
        items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
        items.push({ label: '$(add) New Branch...', action: 'new' });

        const picked = await vscode.window.showQuickPick(items, { title: 'Branches' });
        if (!picked) { return; }
        if (picked.action === 'new') {
            await vscode.commands.executeCommand('ideaGit.newBranch');
            return;
        }
        if (picked.branch) {
            await branches.checkout(repo.id, picked.branch.name);
            vscode.window.showInformationMessage(`Switched to branch "${picked.branch.name}".`);
        }
    });

    commands['ideaGit.mergeBranch'] = runCommand(async () => {
        const repo = repositories.getActiveRepository();
        if (!repo) { return; }
        const branch = await pickBranch(repositories, branches, { includeRemote: true, includeTags: false, excludeCurrent: true });
        if (!branch) { return; }
        await branches.merge(repo.id, branch.name);
        vscode.window.showInformationMessage(`Merged "${branch.name}" into current branch.`);
    });

    commands['ideaGit.rebaseBranch'] = runCommand(async () => {
        const repo = repositories.getActiveRepository();
        if (!repo) { return; }
        const branch = await pickBranch(repositories, branches, { includeRemote: true, includeTags: false, excludeCurrent: true });
        if (!branch) { return; }
        await branches.rebase(repo.id, branch.name);
        vscode.window.showInformationMessage(`Rebased current branch onto "${branch.name}".`);
    });
}

async function pickBranch(
    repositories: RepositoryManager,
    branches: BranchService,
    opts: { includeRemote: boolean; includeTags: boolean; excludeCurrent?: boolean }
): Promise<BranchDto | undefined> {
    const repo = repositories.getActiveRepository();
    if (!repo) { return undefined; }
    const list = await branches.list(repo.id);
    const filtered = list.filter(b => {
        if (b.type === 'local') {
            return !(opts.excludeCurrent && b.current);
        }
        if (b.type === 'remote') { return opts.includeRemote; }
        return opts.includeTags;
    });
    const picked = await vscode.window.showQuickPick(
        filtered.map(b => ({ label: b.name, description: b.type, branch: b })),
        { title: 'Select a branch', matchOnDetail: true }
    );
    return picked?.branch;
}
