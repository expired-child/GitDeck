import * as vscode from 'vscode';
import { GitError, GitErrorCode } from '../../shared/GitError';
import type { API, GitExtension } from './git';

/**
 * Lazily acquires and caches the vscode.git API (document §5.1).
 */
export class VscodeGitAdapter {
    private api?: API;
    private acquiring?: Promise<API>;

    async getApi(): Promise<API> {
        if (this.api) {
            return this.api;
        }
        if (!this.acquiring) {
            this.acquiring = this.doAcquire().finally(() => { this.acquiring = undefined; });
        }
        return this.acquiring;
    }

    private async doAcquire(): Promise<API> {
        const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
        if (!extension) {
            const related = vscode.extensions.all
                .map(e => e.id)
                .filter(id => id.toLowerCase().includes('git'))
                .join(', ');
            throw new GitError(
                GitErrorCode.UNKNOWN,
                `The built-in Git extension (vscode.git) is not available. Git-related extensions installed: ${related || 'none'}`
            );
        }
        const gitExtension = extension.isActive ? extension.exports : await extension.activate();
        if (!gitExtension.enabled) {
            throw new GitError(GitErrorCode.GIT_NOT_INSTALLED, 'Git is not installed or disabled in VS Code.');
        }
        this.api = gitExtension.getAPI(1);
        return this.api;
    }
}
