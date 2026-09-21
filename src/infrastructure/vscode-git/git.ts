/**
 * Trimmed type declarations for the public API of the built-in vscode.git
 * extension (https://github.com/microsoft/vscode/blob/main/extensions/git/src/api/git.d.ts).
 */
import type { Uri, Event, SourceControlInputBox, CancellationToken } from 'vscode';

export const enum Status {
    INDEX_MODIFIED = 0,
    INDEX_ADDED = 1,
    INDEX_DELETED = 2,
    INDEX_RENAMED = 3,
    INDEX_COPIED = 4,
    MODIFIED = 5,
    DELETED = 6,
    UNTRACKED = 7,
    IGNORED = 8,
    INTENT_TO_ADD = 9,
    INTENT_TO_RENAME = 10,
    TYPE_CHANGED = 11
}

export interface Change {
    readonly uri: Uri;
    readonly originalUri: Uri | undefined;
    readonly renameUri: Uri | undefined;
    readonly status: Status;
}

export interface Ref {
    readonly type: number;
    readonly name?: string;
    readonly commit?: string;
    readonly remote?: string;
}

export interface UpstreamRef {
    readonly remote: string;
    readonly name: string;
}

export interface Branch {
    readonly type: number;
    readonly name?: string;
    readonly commit?: string;
    readonly upstream?: UpstreamRef;
    readonly ahead?: number;
    readonly behind?: number;
}

export interface Remote {
    readonly name: string;
    readonly fetchUrl: string | undefined;
    readonly pushUrl: string | undefined;
    readonly isReadOnly: boolean;
}

export interface RepositoryState {
    readonly HEAD: Branch | undefined;
    readonly refs: Ref[];
    readonly remotes: Remote[];
    readonly workingTreeChanges: Change[];
    readonly untrackedChanges?: Change[];
    readonly indexChanges: Change[];
    readonly mergeChanges: Change[];
    readonly onDidChange: Event<void>;
}

export interface CommitOptions {
    all?: boolean | 'tracked';
    amend?: boolean;
    signoff?: boolean;
    empty?: boolean;
}

export const enum ForcePushMode {
    Force = 0,
    ForceWithLease = 1,
    ForceWithLeaseIfIncludes = 2
}

export interface RefQuery {
    readonly pattern?: string | string[];
    readonly count?: number;
    readonly sort?: string;
    readonly cancellationToken?: CancellationToken;
}

export interface Repository {
    readonly rootUri: Uri;
    readonly inputBox: SourceControlInputBox;
    readonly state: RepositoryState;
    getConfigs(): Promise<{ key: string; value: string }[]>;
    getConfig(key: string): Promise<string>;
    status(): Promise<void>;
    add(paths: string | string[]): Promise<void>;
    revert(paths: string | string[]): Promise<void>;
    clean(paths: string | string[]): Promise<void>;
    commit(message?: string, options?: CommitOptions): Promise<void>;
    checkout(treeish: string): Promise<void>;
    createBranch(name: string, checkout: boolean, ref?: string): Promise<void>;
    deleteBranch(name: string, force?: boolean): Promise<void>;
    merge(ref: string): Promise<void>;
    rebase(ref: string): Promise<void>;
    pull(unshallow?: boolean): Promise<void>;
    push(remoteName?: string, branchName?: string, setUpstream?: boolean, force?: ForcePushMode): Promise<void>;
    fetch(options?: { remote?: string; ref?: string; all?: boolean; prune?: boolean }): Promise<void>;
    apply(patch: string, reverse?: boolean): Promise<void>;
    getRefs(query?: RefQuery): Promise<Ref[]>;
}

export interface API {
    readonly git: { readonly path: string; readonly version: string };
    toGitUri(uri: Uri, ref: string): Uri;
    readonly repositories: Repository[];
    onDidOpenRepository: Event<Repository>;
    onDidCloseRepository: Event<Repository>;
}

export interface GitExtension {
    readonly enabled: boolean;
    getAPI(version: 1): API;
}
