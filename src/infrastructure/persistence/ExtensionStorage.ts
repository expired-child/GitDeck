import * as vscode from 'vscode';
import type { ChangelistDto } from '../../shared/protocol';

/**
 * Persistence on top of VS Code state storage:
 * - globalState: commit message history (document §11.4)
 * - workspaceState: active repository selection, webview state (document §89)
 * - secrets: AI API key (never written to settings.json)
 */
export class ExtensionStorage {
    private static readonly MESSAGE_HISTORY_KEY = 'ideaGit.commitMessageHistory';
    private static readonly ACTIVE_REPO_KEY = 'ideaGit.activeRepository';
    private static readonly CHANGELISTS_KEY = 'ideaGit.changelists';
    private static readonly AI_API_KEY_SECRET = 'ideaGit.ai.apiKey';

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

    getChangelists(rootPath: string): ChangelistDto[] {
        const all = this.context.workspaceState.get<Record<string, ChangelistDto[]>>(ExtensionStorage.CHANGELISTS_KEY) ?? {};
        return all[rootPath] ?? [];
    }

    async setChangelists(rootPath: string, changelists: ChangelistDto[]): Promise<void> {
        const all = this.context.workspaceState.get<Record<string, ChangelistDto[]>>(ExtensionStorage.CHANGELISTS_KEY) ?? {};
        if (changelists.length === 0) {
            delete all[rootPath];
        } else {
            all[rootPath] = changelists;
        }
        await this.context.workspaceState.update(ExtensionStorage.CHANGELISTS_KEY, all);
    }

    /** AI API Key 存在系统凭据库，避免随 settings.json 同步或被提交进版本库。 */
    async getAiApiKey(): Promise<string> {
        return (await this.context.secrets.get(ExtensionStorage.AI_API_KEY_SECRET)) ?? '';
    }

    /** 传入空字符串表示清除已保存的 key。 */
    async setAiApiKey(key: string): Promise<void> {
        const trimmed = key.trim();
        if (trimmed) {
            await this.context.secrets.store(ExtensionStorage.AI_API_KEY_SECRET, trimmed);
        } else {
            await this.context.secrets.delete(ExtensionStorage.AI_API_KEY_SECRET);
        }
    }
}
