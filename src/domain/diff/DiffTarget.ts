import type { RepositoryId } from '../repository/RepositoryId';

export type DiffTargetKind = 'worktree' | 'index' | 'untracked' | 'deleted' | 'commit-file';

export interface DiffTarget {
    kind: DiffTargetKind;
    path: string;
    originalPath?: string;
    hash?: string;
    repositoryId: RepositoryId;
}
