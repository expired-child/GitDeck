import * as vscode from 'vscode';
import type { GitEvent, WebviewPersistedState, WebviewRequest } from '../../shared/protocol';
import type { WebviewMessageRouter } from './WebviewMessageRouter';

/**
 * Hosts Commit in the sidebar and Git Log in the bottom panel. Repository
 * events reach both surfaces; navigation waits for the destination to boot.
 */
export class GitViewProvider implements vscode.WebviewViewProvider {
    static readonly viewId = 'ideaGit.gitView';

    static readonly logViewId = 'ideaGit.logView';
    private readonly views = new Map<string, vscode.WebviewView>();
    private readonly ready = new Set<string>();
    private readonly pending = new Map<string, Extract<GitEvent, { type: 'view.showTab' }>>();

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly router: WebviewMessageRouter,
        private readonly loadPersistedState: () => WebviewPersistedState | undefined
    ) {}

    resolveWebviewView(view: vscode.WebviewView): void {
        this.resolveSurface(view, 'commit');
    }

    resolveSurface(view: vscode.WebviewView, surface: 'commit' | 'log'): void {
        const id = surface === 'commit' ? GitViewProvider.viewId : GitViewProvider.logViewId;
        this.views.set(id, view);
        this.ready.delete(id);
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media', 'webview')]
        };
        view.webview.html = this.buildHtml(view.webview, surface);

        view.webview.onDidReceiveMessage((message: WebviewRequest) => {
            if (message.type === 'webview.ready') {
                this.ready.add(id);
                void view.webview.postMessage({ requestId: message.requestId, success: true, data: this.loadPersistedState() });
                const navigation = this.pending.get(id);
                if (navigation) {
                    this.pending.delete(id);
                    void view.webview.postMessage(navigation);
                }
                return;
            }
            void this.router.handle(message, response => {
                void view.webview.postMessage(response);
            });
        });
        view.onDidDispose(() => {
            if (this.views.get(id) === view) {
                this.views.delete(id);
                this.ready.delete(id);
            }
        });
    }

    postEvent(event: GitEvent): void {
        if (event.type === 'view.showTab') {
            const id = event.tab === 'changes' ? GitViewProvider.viewId : GitViewProvider.logViewId;
            if (this.ready.has(id)) { void this.views.get(id)?.webview.postMessage(event); }
            else { this.pending.set(id, event); }
            return;
        }
        for (const view of this.views.values()) { void view.webview.postMessage(event); }
    }

    isVisible(): boolean {
        return [...this.views.values()].some(view => view.visible);
    }

    async reveal(tab: 'changes' | 'log' | 'history' = 'changes'): Promise<void> {
        await vscode.commands.executeCommand((tab === 'changes' ? GitViewProvider.viewId : GitViewProvider.logViewId) + '.focus');
    }

    private buildHtml(webview: vscode.Webview, surface: 'commit' | 'log'): string {
        const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'webview', 'assets', 'git.js'));
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'webview', 'assets', 'git.css'));
        const nonce = getNonce();
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IDEA Git</title>
    <link rel="stylesheet" href="${cssUri}">
</head>
<body data-surface="${surface}">
    <div id="root"></div>
    <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
