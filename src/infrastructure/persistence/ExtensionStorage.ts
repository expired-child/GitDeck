import * as vscode from 'vscode';

/**
 * Persistence on top of VS Code state storage:
 * - globalState: commit message history (document §11.4)
 * - workspaceState: active repository selection, webview state (document §89)
 */
export class ExtensionStorage {
    private static readonly MESSAGE_HISTORY_KEY = 'ideaGit.commitMessageHistory';
    private static readonly ACTIVE_REPO_KEY = 'ideaGit.activeRepository';

    constructor(private readonly context: vscode.ExtensionContext) {}

    getCommitMessageHistory(): string[] {
        return this.context.globalState.get<string[]>(ExtensionStorage.MESSAGE_HISTORY_KEY) ?? [];
    }

    async addCommitMessage(message: string): Promise<void> {
        const max = vscode.workspace.getConfiguration('ideaGit').get<number>('commitMessageHistorySize', 20);
        const trimmed = message.trim();
        if (!trimmed) {
            return;
        }
        const history = this.getCommitMessageHistory().filter(m => m !== trimmed);
        history.unshift(trimmed);
        await this.context.globalState.update(ExtensionStorage.MESSAGE_HISTORY_KEY, history.slice(0, max));
    }

    getActiveRepositoryId(): string | undefined {
        return this.context.workspaceState.get<string>(ExtensionStorage.ACTIVE_REPO_KEY);
    }

    async setActiveRepositoryId(id: string | undefined): Promise<void> {
        await this.context.workspaceState.update(ExtensionStorage.ACTIVE_REPO_KEY, id);
    }

    getWebviewState<T>(): T | undefined {
        return this.context.workspaceState.get<T>('ideaGit.webviewState');
    }

    async setWebviewState(state: unknown): Promise<void> {
        await this.context.workspaceState.update('ideaGit.webviewState', state);
    }
}
