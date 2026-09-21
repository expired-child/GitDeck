/**
 * Facade the command layer uses to drive the webview without depending on it.
 */
export interface GitWebviewNotifier {
    openChanges(): Promise<void>;
    openLog(): Promise<void>;
    openHistory(path: string, repositoryId?: string): Promise<void>;
    refresh(): void;
}
