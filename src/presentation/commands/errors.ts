import * as vscode from 'vscode';
import { GitError, GitErrorCode } from '../../shared/GitError';

/**
 * User-facing error presentation (document §47): actionable toasts instead of
 * raw "git exited with code 1" messages.
 */
export async function showGitError(e: unknown): Promise<void> {
    const error = GitError.from(e);
    const actions: string[] = [];
    if (error.code === GitErrorCode.NON_FAST_FORWARD) {
        actions.push('Pull');
    }
    if (error.code === GitErrorCode.CONFLICT) {
        actions.push('Resolve Conflicts');
    }
    const detail = error.detail && error.detail !== error.message ? error.detail : undefined;
    const chosen = await vscode.window.showErrorMessage(
        `IDEA Git: ${error.message}`,
        { modal: false, detail },
        ...actions
    );
    if (chosen === 'Pull') {
        await vscode.commands.executeCommand('ideaGit.pull');
    } else if (chosen === 'Resolve Conflicts') {
        await vscode.commands.executeCommand('ideaGit.open');
    }
}

export function runCommand(fn: () => Promise<void>): () => Promise<void> {
    return async () => {
        try {
            await fn();
        } catch (e) {
            await showGitError(e);
        }
    };
}
