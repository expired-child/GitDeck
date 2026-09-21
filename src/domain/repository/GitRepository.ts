import type { RepositoryId } from './RepositoryId';

/**
 * Domain representation of a git repository (document §40, §84).
 * Implemented by infrastructure adapters; never imports `vscode`.
 */
export interface GitRepository {
    readonly id: RepositoryId;
    readonly name: string;
    readonly rootPath: string;
}

export interface RepositoryHead {
    branch?: string;
    commit?: string;
    detached?: boolean;
    ahead?: number;
    behind?: number;
    upstream?: { remote: string; name: string } | null;
}

export type RepositoryGitState =
    | 'NORMAL'
    | 'MERGING'
    | 'REBASING'
    | 'CHERRY_PICKING'
    | 'REVERTING'
    | 'BISECTING';

export interface RepositoryStatus {
    repositoryId: RepositoryId;
    head: RepositoryHead;
    state: RepositoryGitState;
    rebaseProgress: { current: number; total: number } | null;
    remotes: string[];
}
