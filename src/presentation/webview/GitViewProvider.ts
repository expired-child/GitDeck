import * as vscode from 'vscode';
import type { GitEvent, WebviewPersistedState, WebviewRequest } from '../../shared/protocol';
import type { WebviewMessageRouter } from './WebviewMessageRouter';

/**
 * Hosts the React webview inside a sidebar view (document §9) and is the only
 * bridge for messages in both directions (document §41).
 */
export class GitViewProvider implements vscode.WebviewViewProvider {
    static readonly viewId = 'ideaGit.gitView';

    private view?: vscode.WebviewView;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly router: WebviewMessageRouter,
        private readonly loadPersistedState: () => WebviewPersistedState | undefined
    ) {}

    resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media', 'webview')]
        };
        view.webview.html = this.buildHtml(view.webview);

        view.webview.onDidReceiveMessage((message: WebviewRequest) => {
            void this.router.handle(message, response => {
                void view.webview.postMessage(response);
            });
        });
    }

    postEvent(event: GitEvent): void {
        void this.view?.webview.postMessage(event);
    }

    isVisible(): boolean {
        return this.view?.visible ?? false;
    }

    async reveal(): Promise<void> {
        if (this.view) {
            await vscode.commands.executeCommand('ideaGit.gitView.focus');
        } else {
            await vscode.commands.executeCommand(GitViewProvider.viewId + '.focus');
        }
    }

    private buildHtml(webview: vscode.Webview): string {
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
<body>
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
