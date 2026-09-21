import * as path from 'node:path';
import type { RepositoryStatusDto, FileChangeDto, ChangeStatusCode, RepositoryGitState } from '../../shared/protocol';
import type { VscodeRepositoryAdapter } from '../../infrastructure/vscode-git/VscodeRepositoryAdapter';
import { Status, type Change } from '../../infrastructure/vscode-git/git';

/**
 * Builds the repository status DTO from vscode.git state (document §5.1, §10).
 */
export class GitStatusService {
    async getStatus(repo: VscodeRepositoryAdapter): Promise<RepositoryStatusDto> {
        const state = repo.vscodeRepository.state;
        const detected = await repo.detectState();

        const changes: FileChangeDto[] = [];
        const untracked: FileChangeDto[] = [];
        const conflicts: FileChangeDto[] = [];
        const staged: FileChangeDto[] = [];

        for (const change of state.indexChanges) {
            const dto = this.toDto(repo, change, true);
            staged.push(dto);
            changes.push(dto);
        }
        for (const change of [...state.workingTreeChanges, ...(state.untrackedChanges ?? [])]) {
            const dto = this.toDto(repo, change, false);
            if (change.status === Status.UNTRACKED) {
                if (!untracked.some(c => c.path === dto.path)) { untracked.push(dto); }
            } else if (!changes.some(c => c.path === dto.path)) {
                changes.push(dto);
            }
        }
        for (const change of state.mergeChanges) {
            const dto = this.toDto(repo, change, false);
            dto.status = 'U';
            conflicts.push(dto);
        }

        return {
            repositoryId: repo.id,
            head: repo.getHead(),
            state: detected.state as RepositoryGitState,
            rebaseProgress: detected.rebaseProgress,
            changes,
            untracked,
            conflicts,
            staged,
            remotes: repo.getRemotes()
        };
    }

    private toDto(repo: VscodeRepositoryAdapter, change: Change, staged: boolean): FileChangeDto {
        return {
            path: this.toRelative(repo, change.uri),
            originalPath: change.originalUri && change.originalUri.fsPath !== change.uri.fsPath
                ? this.toRelative(repo, change.originalUri) : undefined,
            status: mapStatus(change.status),
            staged
        };
    }

    private toRelative(repo: VscodeRepositoryAdapter, uri: { fsPath: string }): string {
        const rel = path.relative(repo.rootPath, uri.fsPath);
        return rel.split(path.sep).join('/');
    }
}

function mapStatus(status: Status): ChangeStatusCode {
    switch (status) {
        case Status.INDEX_MODIFIED: return 'M';
        case Status.INDEX_ADDED: return 'A';
        case Status.INDEX_DELETED: return 'D';
        case Status.INDEX_RENAMED: return 'R';
        case Status.INDEX_COPIED: return 'C';
        case Status.DELETED: return 'D';
        case Status.MODIFIED: return 'M';
        case Status.UNTRACKED: return '?';
        case Status.IGNORED: return '!';
        case Status.INTENT_TO_ADD: return 'A';
        case Status.INTENT_TO_RENAME: return 'R';
        case Status.TYPE_CHANGED: return 'M';
        default: return 'M';
    }
}
