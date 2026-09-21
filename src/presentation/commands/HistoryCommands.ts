import * as vscode from 'vscode';
import * as path from 'node:path';
import type { FileHistoryService } from '../../application/history/FileHistoryService';
import type { RepositoryManager } from '../../application/repository/RepositoryService';
import type { GitWebviewNotifier } from './GitWebviewNotifier';
import { runCommand } from './errors';

/**
 * File history (document §36) and blame (document §37).
 */
export function registerHistoryCommands(
    commands: Record<string, (...args: unknown[]) => unknown>,
    repositories: RepositoryManager,
    history: FileHistoryService,
    notifier: GitWebviewNotifier,
    store: { blameDecoration?: vscode.TextEditorDecorationType }
): void {
    commands['ideaGit.showFileHistory'] = runCommand(async (uriArg?: vscode.Uri) => {
        const uri = uriArg instanceof vscode.Uri ? uriArg : vscode.window.activeTextEditor?.document.uri;
        if (!uri || uri.scheme !== 'file') {
            vscode.window.showInformationMessage('Open a file first.');
            return;
        }
        const repo = repositories.getRequired();
        if (!uri.fsPath.toLowerCase().startsWith(repo.rootPath.toLowerCase())) {
            vscode.window.showInformationMessage('The file does not belong to the active repository.');
            return;
        }
        const rel = path.relative(repo.rootPath, uri.fsPath).split(path.sep).join('/');
        await notifier.openHistory(rel, repo.id);
    });

    commands['ideaGit.showBlame'] = runCommand(async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== 'file') {
            return;
        }
        const repo = repositories.getRequired();
        const rel = path.relative(repo.rootPath, editor.document.uri.fsPath).split(path.sep).join('/');

        if (store.blameDecoration) {
            editor.setDecorations(store.blameDecoration, []);
            store.blameDecoration.dispose();
            store.blameDecoration = undefined;
            return;
        }

        const blame = await history.blame(repo.id, rel);
        const decoration = vscode.window.createTextEditorDecorationType({
            after: {
                margin: '0 0 0 2em',
                color: new vscode.ThemeColor('gitBlame.foreground'),
                fontStyle: 'italic'
            }
        });
        const ranges: { range: vscode.Range; renderOptions: { after: { contentText: string } } }[] = [];
        const lineCount = editor.document.lineCount;
        for (let line = 1; line <= lineCount; line++) {
            const info = blame.get(line);
            const next = blame.get(line + 1);
            // Only annotate the last line of each commit block to keep density IDEA-like.
            if (info && (!next || next.hash !== info.hash)) {
                const author = info.author.length > 20 ? `${info.author.slice(0, 20)}…` : info.author;
                const date = new Date(info.date);
                const dateText = Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
                ranges.push({
                    range: new vscode.Range(line - 1, Number.MAX_SAFE_INTEGER, line - 1, Number.MAX_SAFE_INTEGER),
                    renderOptions: { after: { contentText: `  ${info.hash.slice(0, 7)} ${author} ${dateText}` } }
                });
            }
        }
        editor.setDecorations(decoration, ranges);
        store.blameDecoration = decoration;
    });
}
