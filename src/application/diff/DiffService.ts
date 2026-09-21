import * as vscode from 'vscode';
import * as path from 'node:path';
import { GitCli } from '../../infrastructure/git-cli/GitCli';
import type { RepositoryManager } from '../repository/RepositoryService';
import type { DiffTargetDto } from '../../shared/protocol';

/**
 * Diff via VS Code native diff editor (document §12).
 * The vscode.git content provider covers HEAD refs; anything else (index
 * content, commit vs parent, empty) goes through temp files so it works for
 * every change kind, including deleted and untracked files.
 */
export class DiffService {
    private tempDir?: string;

    constructor(
        private readonly repositories: RepositoryManager,
        private readonly cli: GitCli,
        private readonly context: vscode.ExtensionContext
    ) {}

    async show(target: DiffTargetDto): Promise<void> {
        const repo = this.repositories.getRequired(target.repositoryId);
        const fileUri = vscode.Uri.file(path.join(repo.rootPath, ...target.path.split('/')));
        const displayPath = target.path.split('/').pop() ?? target.path;
        const shortHash = target.hash ? target.hash.slice(0, 7) : undefined;

        let left: vscode.Uri;
        let right: vscode.Uri;
        let title: string;

        switch (target.kind) {
            case 'worktree':
                left = this.repositories.toGitUri(fileUri, '');
                right = fileUri;
                title = `${displayPath} (Working Tree)`;
                break;
            case 'untracked':
                left = await this.emptyFile();
                right = fileUri;
                title = `${displayPath} (New File)`;
                break;
            case 'deleted':
                left = this.repositories.toGitUri(fileUri, 'HEAD');
                right = await this.emptyFile();
                title = `${displayPath} (Deleted)`;
                break;
            case 'index': {
                const originalUri = target.originalPath
                    ? vscode.Uri.file(path.join(repo.rootPath, ...target.originalPath.split('/'))) : fileUri;
                left = this.repositories.toGitUri(originalUri, 'HEAD');
                right = this.repositories.toGitUri(fileUri, '');
                title = `${displayPath} (Index)`;
                break;
            }
            case 'commit-file': {
                if (!target.hash) {
                    throw new Error('commit-file diff requires a hash');
                }
                const parent = await this.firstParent(repo.rootPath, target.hash);
                const leftPath = target.originalPath ?? target.path;
                left = parent
                    ? await this.tempFromGit(repo.rootPath, [`${parent}:`, leftPath], `p-${this.sanitize(leftPath)}-${shortHash}`)
                    : await this.emptyFile();
                right = await this.tempFromGit(repo.rootPath, [`${target.hash}:`, target.path], `c-${this.sanitize(target.path)}-${shortHash}`);
                title = `${displayPath} (${shortHash})`;
                break;
            }
        }

        await vscode.commands.executeCommand('vscode.diff', left, right, title);
    }

    private async firstParent(root: string, hash: string): Promise<string | null> {
        const out = await this.cli.out(root, ['rev-list', '--parents', '-n', '1', hash]);
        const parts = out.trim().split(' ');
        return parts.length > 1 ? parts[1] : null;
    }

    private async tempFromGit(root: string, refAndPath: [string, string], name: string): Promise<vscode.Uri> {
        const dir = await this.ensureTempDir();
        const file = vscode.Uri.file(path.join(dir, `${name}.tmp`));
        const args = ['show', `${refAndPath[0]}${refAndPath[1]}`];
        let content: string;
        try {
            content = await this.cli.out(root, args);
        } catch {
            content = '';
        }
        await vscode.workspace.fs.writeFile(file, Buffer.from(content, 'utf8'));
        return file;
    }

    private async emptyFile(): Promise<vscode.Uri> {
        const dir = await this.ensureTempDir();
        const file = vscode.Uri.file(path.join(dir, 'empty.tmp'));
        await vscode.workspace.fs.writeFile(file, Buffer.from('', 'utf8'));
        return file;
    }

    private async ensureTempDir(): Promise<string> {
        if (!this.tempDir) {
            const dir = path.join(this.context.globalStorageUri.fsPath, 'diff-cache');
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
            this.tempDir = dir;
        }
        return this.tempDir;
    }

    private sanitize(p: string): string {
        return p.replace(/[^a-zA-Z0-9._-]/g, '_');
    }
}
