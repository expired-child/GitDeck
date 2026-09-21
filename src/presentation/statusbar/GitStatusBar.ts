import * as vscode from 'vscode';
import type { RepositoryManager } from '../../application/repository/RepositoryService';

/**
 * Status bar item (document §54): `⑂ main ↑2 ↓1`, clicking opens the branch picker.
 */
export class GitStatusBar implements vscode.Disposable {
    private readonly item: vscode.StatusBarItem;

    constructor(private readonly repositories: RepositoryManager) {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
        this.item.name = 'IDEA Git';
        this.item.command = 'ideaGit.branchPicker';
    }

    show(): void {
        this.update();
        this.item.show();
    }

    update(): void {
        const repo = this.repositories.getActiveRepository();
        if (!repo) {
            this.item.text = '$(git-branch) No Repo';
            this.item.tooltip = 'No Git repository found';
            return;
        }
        const head = repo.getHead();
        const branch = head.branch ?? (head.commit ? head.commit.slice(0, 7) : 'HEAD');
        let text = `$(git-branch) ${branch}`;
        if (head.ahead) { text += ` ↑${head.ahead}`; }
        if (head.behind) { text += ` ↓${head.behind}`; }
        this.item.text = text;
        this.item.tooltip = new vscode.MarkdownString(
            `**Repository:** ${repo.name}\n\n**Branch:** ${branch}\n\nClick to open the branch picker.`
        );
    }

    dispose(): void {
        this.item.dispose();
    }
}
