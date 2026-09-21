import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import type { GitRepository, RepositoryHead, RepositoryGitState } from '../../domain/repository/GitRepository';
import type { Repository } from './git';

/**
 * Adapts a vscode.git `Repository` to the domain `GitRepository` model and
 * detects the git state machine (document §58) via files inside `.git`.
 */
export class VscodeRepositoryAdapter implements GitRepository {
    readonly id: string;
    readonly name: string;
    readonly rootPath: string;

    constructor(readonly vscodeRepository: Repository) {
        this.rootPath = vscodeRepository.rootUri.fsPath;
        this.id = this.rootPath;
        this.name = path.basename(this.rootPath) || this.rootPath;
    }

    getHead(): RepositoryHead {
        const head = this.vscodeRepository.state.HEAD;
        if (!head) {
            return {};
        }
        return {
            branch: head.name,
            commit: head.commit,
            detached: head.name === undefined,
            ahead: head.ahead,
            behind: head.behind,
            upstream: head.upstream ? { remote: head.upstream.remote, name: head.upstream.name } : null
        };
    }

    getRemotes(): string[] {
        return this.vscodeRepository.state.remotes.map(r => r.name);
    }

    async detectState(): Promise<{ state: RepositoryGitState; rebaseProgress: { current: number; total: number } | null }> {
        const gitDir = await resolveGitDir(this.rootPath);
        if (!gitDir) {
            return { state: 'NORMAL', rebaseProgress: null };
        }
        const exists = async (p: string) => pathExists(path.join(gitDir, p));
        if (await exists('rebase-merge') || await exists('rebase-apply')) {
            return { state: 'REBASING', rebaseProgress: await readRebaseProgress(gitDir) };
        }
        if (await exists('MERGE_HEAD')) {
            return { state: 'MERGING', rebaseProgress: null };
        }
        if (await exists('CHERRY_PICK_HEAD')) {
            return { state: 'CHERRY_PICKING', rebaseProgress: null };
        }
        if (await exists('REVERT_HEAD')) {
            return { state: 'REVERTING', rebaseProgress: null };
        }
        if (await exists('BISECT_LOG')) {
            return { state: 'BISECTING', rebaseProgress: null };
        }
        return { state: 'NORMAL', rebaseProgress: null };
    }
}

async function pathExists(p: string): Promise<boolean> {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

async function resolveGitDir(root: string): Promise<string | null> {
    try {
        const dotGit = path.join(root, '.git');
        const stat = await fs.stat(dotGit);
        if (stat.isDirectory()) {
            return dotGit;
        }
        const content = (await fs.readFile(dotGit, 'utf8')).trim();
        if (content.startsWith('gitdir:')) {
            const dir = content.slice('gitdir:'.length).trim();
            return path.isAbsolute(dir) ? dir : path.resolve(root, dir);
        }
        return null;
    } catch {
        return null;
    }
}

async function readRebaseProgress(gitDir: string): Promise<{ current: number; total: number } | null> {
    try {
        const current = Number((await fs.readFile(path.join(gitDir, 'rebase-merge', 'msgnum'), 'utf8')).trim());
        const total = Number((await fs.readFile(path.join(gitDir, 'rebase-merge', 'end'), 'utf8')).trim());
        if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
            return { current, total };
        }
    } catch {
        // not rebasing
    }
    return null;
}
