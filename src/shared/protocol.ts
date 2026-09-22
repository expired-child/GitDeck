/**
 * Type-safe message protocol between the extension host and the webview
 * (document §41, §42, §86). Shared by both sides; the webview imports this
 * module through the `@shared` Vite alias.
 */
import type { GitErrorDto } from './GitError';

// ---------------------------------------------------------------------------
// DTOs (Domain -> DTO -> postMessage, document §86)
// ---------------------------------------------------------------------------

export interface RepositoryDto {
    id: string;
    name: string;
    rootPath: string;
    branch?: string;
}

export type RepositoryGitState =
    | 'NORMAL'
    | 'MERGING'
    | 'REBASING'
    | 'CHERRY_PICKING'
    | 'REVERTING'
    | 'BISECTING';

export interface HeadDto {
    branch?: string;
    commit?: string;
    detached?: boolean;
    ahead?: number;
    behind?: number;
    upstream?: { remote: string; name: string } | null;
}

export type ChangeStatusCode = 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?' | '!';

export interface FileChangeDto {
    path: string;
    originalPath?: string;
    status: ChangeStatusCode;
    staged: boolean;
}

export interface RepositoryStatusDto {
    repositoryId: string;
    head: HeadDto;
    state: RepositoryGitState;
    rebaseProgress: { current: number; total: number } | null;
    changes: FileChangeDto[];
    untracked: FileChangeDto[];
    conflicts: FileChangeDto[];
    staged: FileChangeDto[];
    remotes: string[];
}

export interface CommitDto {
    hash: string;
    parents: string[];
    authorName: string;
    authorEmail: string;
    date: string;
    refs: string[];
    subject: string;
}

export interface CommitFileDto {
    path: string;
    originalPath?: string;
    status: ChangeStatusCode;
}

export interface CommitDetailsDto extends CommitDto {
    body: string;
}

export interface BranchDto {
    name: string;
    type: 'local' | 'remote' | 'tag';
    current: boolean;
    remote?: string;
    upstream?: string | null;
    commit?: string;
}

export interface GitLogFilterDto {
    branches?: string[];
    authors?: string[];
    after?: string;
    before?: string;
    paths?: string[];
    text?: string;
}

export interface GitLogRequestDto {
    repositoryId: string;
    page: number;
    pageSize: number;
    filter?: GitLogFilterDto;
}

export interface GitLogPageDto {
    commits: CommitDto[];
    hasMore: boolean;
    page: number;
}

export interface CommitRequestDto {
    repositoryId: string;
    message: string;
    paths: string[];
    amend: boolean;
}

export interface PushPreviewDto {
    repositoryId: string;
    branch: string;
    upstream: string | null;
    commits: CommitDto[];
}

export interface RemoteLogDto {
    repositoryId: string;
    branch: string;
    headCommit: string;
    upstream: string;
    checkedAt: string;
    ahead: number;
    behind: number;
    commits: CommitDto[];
}

export interface StashDto {
    index: number;
    hash: string;
    message: string;
    date: string;
}

/** User-defined changelist (IDEA-style custom file group), persisted per repository. */
export interface ChangelistDto {
    name: string;
    paths: string[];
}

export interface FileHistoryRequestDto {
    repositoryId: string;
    path: string;
    page: number;
    pageSize: number;
}

export interface HistoryEntryDto {
    hash: string;
    author: string;
    date: string;
    subject: string;
}

export type DiffTargetKind = 'worktree' | 'index' | 'untracked' | 'deleted' | 'commit-file';

export interface DiffTargetDto {
    kind: DiffTargetKind;
    path: string;
    originalPath?: string;
    hash?: string;
    repositoryId: string;
}

// ---------------------------------------------------------------------------
// Requests (Webview -> Extension)
// ---------------------------------------------------------------------------

export type WebviewRequest =
    | { type: 'webview.ready'; requestId: string }
    | { type: 'git.view.open'; requestId: string; payload: { tab: 'changes' | 'log' | 'history'; path?: string } }
    | { type: 'git.branch.pick'; requestId: string }
    | { type: 'git.branch.new'; requestId: string }
    | { type: 'git.repositories.get'; requestId: string }
    | { type: 'git.repository.setActive'; requestId: string; payload: { repositoryId: string } }
    | { type: 'git.repo.init'; requestId: string }
    | { type: 'git.status.get'; requestId: string; payload?: { repositoryId: string } }
    | { type: 'git.log.load'; requestId: string; payload: GitLogRequestDto }
    | { type: 'git.commit.getDetails'; requestId: string; payload: { repositoryId: string; hash: string } }
    | { type: 'git.commit.getChangedFiles'; requestId: string; payload: { repositoryId: string; hash: string } }
    | { type: 'git.commit'; requestId: string; payload: CommitRequestDto }
    | { type: 'git.commit.getLastMessage'; requestId: string; payload: { repositoryId: string } }
    | { type: 'git.commit.getMessageHistory'; requestId: string }
    | { type: 'git.commit.cherryPick'; requestId: string; payload: { repositoryId: string; hash: string } }
    | { type: 'git.commit.revert'; requestId: string; payload: { repositoryId: string; hash: string } }
    | { type: 'git.commit.reset'; requestId: string; payload: { repositoryId: string; hash: string; mode: 'soft' | 'mixed' | 'hard' } }
    | { type: 'git.commit.checkoutRevision'; requestId: string; payload: { repositoryId: string; hash: string } }
    | { type: 'git.tag.create'; requestId: string; payload: { repositoryId: string; name: string; hash?: string } }
    | { type: 'git.branch.list'; requestId: string; payload: { repositoryId: string } }
    | { type: 'git.branch.checkout'; requestId: string; payload: { repositoryId: string; branch: string } }
    | { type: 'git.branch.create'; requestId: string; payload: { repositoryId: string; name: string; base?: string; checkout: boolean } }
    | { type: 'git.branch.rename'; requestId: string; payload: { repositoryId: string; oldName: string; newName: string } }
    | { type: 'git.branch.delete'; requestId: string; payload: { repositoryId: string; name: string; force?: boolean; remote?: boolean } }
    | { type: 'git.branch.merge'; requestId: string; payload: { repositoryId: string; branch: string } }
    | { type: 'git.branch.rebase'; requestId: string; payload: { repositoryId: string; branch: string } }
    | { type: 'git.branch.compare'; requestId: string; payload: { repositoryId: string; branch: string } }
    | { type: 'git.branch.update'; requestId: string; payload: { repositoryId: string; branch: string } }
    | { type: 'git.branch.push'; requestId: string; payload: { repositoryId: string; branch: string } }
    | { type: 'git.branch.diffWorktree'; requestId: string; payload: { repositoryId: string; branch: string } }
    | { type: 'git.branch.worktree.add'; requestId: string; payload: { repositoryId: string; branch: string; path: string } }
    | { type: 'git.branch.setUpstream'; requestId: string; payload: { repositoryId: string; branch: string; upstream?: string } }
    | { type: 'git.diff.show'; requestId: string; payload: DiffTargetDto }
    | { type: 'git.file.add'; requestId: string; payload: { repositoryId: string; paths: string[] } }
    | { type: 'git.file.unstage'; requestId: string; payload: { repositoryId: string; paths: string[] } }
    | { type: 'git.file.discard'; requestId: string; payload: { repositoryId: string; paths: string[] } }
    | { type: 'git.file.ignore'; requestId: string; payload: { repositoryId: string; path: string } }
    | { type: 'git.file.open'; requestId: string; payload: { repositoryId: string; path: string } }
    | { type: 'git.remote.fetch'; requestId: string; payload: { repositoryId: string; prune?: boolean } }
    | { type: 'git.remote.updateLog'; requestId: string; payload: { repositoryId: string } }
    | { type: 'git.remote.pull'; requestId: string; payload: { repositoryId: string } }
    | { type: 'git.remote.push'; requestId: string; payload: { repositoryId: string; force?: boolean } }
    | { type: 'git.remote.pushPreview'; requestId: string; payload: { repositoryId: string } }
    | { type: 'git.stash.list'; requestId: string; payload: { repositoryId: string } }
    | { type: 'git.stash.push'; requestId: string; payload: { repositoryId: string; message?: string } }
    | { type: 'git.stash.apply'; requestId: string; payload: { repositoryId: string; index: number; pop: boolean } }
    | { type: 'git.stash.drop'; requestId: string; payload: { repositoryId: string; index: number } }
    | { type: 'git.changelist.list'; requestId: string; payload: { repositoryId: string } }
    | { type: 'git.changelist.unassign'; requestId: string; payload: { repositoryId: string; paths: string[] } }
    | { type: 'git.patch.get'; requestId: string; payload: { repositoryId: string; paths?: string[] } }
    | { type: 'git.patch.save'; requestId: string; payload: { repositoryId: string; paths?: string[] } }
    | { type: 'git.changes.shelve'; requestId: string; payload: { repositoryId: string; paths?: string[]; message?: string } }
    | { type: 'git.changelist.create'; requestId: string; payload: { repositoryId: string; name: string } }
    | { type: 'git.changelist.delete'; requestId: string; payload: { repositoryId: string; name: string } }
    | { type: 'git.changelist.rename'; requestId: string; payload: { repositoryId: string; oldName: string; newName: string } }
    | { type: 'git.changelist.moveFiles'; requestId: string; payload: { repositoryId: string; name: string; paths: string[] } }
    | { type: 'git.operation.continue'; requestId: string; payload: { repositoryId: string } }
    | { type: 'git.operation.skip'; requestId: string; payload: { repositoryId: string } }
    | { type: 'git.operation.abort'; requestId: string; payload: { repositoryId: string } }
    | { type: 'git.history.load'; requestId: string; payload: FileHistoryRequestDto }
    | { type: 'git.history.diff'; requestId: string; payload: { repositoryId: string; path: string; hash: string } }
    | { type: 'webview.state.save'; requestId: string; payload: WebviewPersistedState };

export interface WebviewPersistedState {
    activeTab?: string;
    splitPaneSizes?: number[];
}

export type WebviewResponse<T = unknown> = {
    requestId: string;
    success: boolean;
    data?: T;
    error?: GitErrorDto;
};

// ---------------------------------------------------------------------------
// Events (Extension -> Webview, document §42)
// ---------------------------------------------------------------------------

export type GitEvent =
    | { type: 'repository.changed'; repositories: RepositoryDto[]; activeRepositoryId?: string }
    | { type: 'status.changed'; repositoryId: string; status: RepositoryStatusDto }
    | { type: 'branch.changed'; repositoryId: string }
    | { type: 'log.changed'; repositoryId: string }
    | { type: 'remoteLog.updated'; result: RemoteLogDto }
    | { type: 'repository.refresh'; repositoryId: string }
    | { type: 'history.open'; repositoryId: string; path: string }
    | { type: 'view.showTab'; tab: 'changes' | 'log' | 'history'; path?: string; repositoryId?: string };
