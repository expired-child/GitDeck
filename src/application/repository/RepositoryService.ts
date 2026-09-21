import * as vscode from 'vscode';
import type { API, Repository } from '../../infrastructure/vscode-git/git';
import { DisposableStore } from '../../shared/DisposableStore';
import { GitError, GitErrorCode } from '../../shared/GitError';
import type { RepositoryDto } from '../../shared/protocol';
import type { VscodeGitAdapter } from '../../infrastructure/vscode-git/VscodeGitAdapter';
import { VscodeRepositoryAdapter } from '../../infrastructure/vscode-git/VscodeRepositoryAdapter';
import type { ExtensionStorage } from '../../infrastructure/persistence/ExtensionStorage';
import type { RepositoryId } from '../../domain/repository/RepositoryId';
import type { Logger } from '../../shared/logger';

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * RepositoryManager (document §39, §40): multi-root aware registry of git
 * repositories with an active-repository concept persisted in workspaceState.
 */
export class RepositoryManager implements vscode.Disposable {
    private readonly repositories = new Map<RepositoryId, VscodeRepositoryAdapter>();
    private active?: VscodeRepositoryAdapter;
    private readonly store = new DisposableStore();
    private api?: API;
    private connecting?: Promise<void>;
    private disposed = false;

    private readonly onDidChangeRepositoriesEmitter = new vscode.EventEmitter<void>();
    private readonly onDidChangeActiveRepositoryEmitter = new vscode.EventEmitter<VscodeRepositoryAdapter | undefined>();

    readonly onDidChangeRepositories = this.onDidChangeRepositoriesEmitter.event;
    readonly onDidChangeActiveRepository = this.onDidChangeActiveRepositoryEmitter.event;

    constructor(
        private readonly gitAdapter: VscodeGitAdapter,
        private readonly storage: ExtensionStorage,
        private readonly logger?: Logger
    ) {}

    async initialize(): Promise<void> {
        await this.connect();
    }

    private async connect(): Promise<void> {
        if (this.api || this.disposed) { return; }
        if (!this.connecting) {
            this.connecting = (async () => {
                const api = await this.acquireApiWithRetry();
                if (this.disposed) { return; }
                this.api = api;
                // Subscribe before reading the snapshot: discovery continues asynchronously.
                this.store.add(api.onDidOpenRepository(repo => this.add(repo)));
                this.store.add(api.onDidCloseRepository(repo => this.remove(repo)));
                this.scan(api);
                this.logger?.info(`Repository detection: ${this.repositories.size} repository(ies)`);
            })().finally(() => { this.connecting = undefined; });
        }
        await this.connecting;
    }

    /** Reconcile discovery and ask VS Code to refresh the actual Git model. */
    async refresh(): Promise<void> {
        await this.connect();
        if (!this.api || this.disposed) { return; }
        this.scan(this.api);
        await Promise.all(this.getRepositories().map(repo => repo.vscodeRepository.status()));
    }

    toGitUri(uri: vscode.Uri, ref: string): vscode.Uri {
        if (!this.api) { throw new Error('Git API is not initialized.'); }
        return this.api.toGitUri(uri, ref);
    }

    getRepositories(): VscodeRepositoryAdapter[] {
        return [...this.repositories.values()];
    }

    getActiveRepository(): VscodeRepositoryAdapter | undefined {
        return this.active;
    }

    /** Resolves a repository; `id` falls back to the active repository. */
    getRequired(id?: string): VscodeRepositoryAdapter {
        const repo = id ? this.repositories.get(id) : this.active;
        if (!repo) {
            throw new GitError(GitErrorCode.NOT_GIT_REPOSITORY, 'No Git repository found in this workspace.');
        }
        return repo;
    }

    setActiveRepository(id: string): void {
        const repo = this.repositories.get(id);
        if (!repo) {
            throw new GitError(GitErrorCode.INVALID_INPUT, `Unknown repository: ${id}`);
        }
        this.active = repo;
        void this.storage.setActiveRepositoryId(id);
        this.onDidChangeActiveRepositoryEmitter.fire(repo);
    }

    toDto(): { repositories: RepositoryDto[]; activeRepositoryId?: string } {
        const repositories = this.getRepositories().map(r => ({
            id: r.id,
            name: r.name,
            rootPath: r.rootPath,
            branch: r.getHead().branch
        }));
        return { repositories, activeRepositoryId: this.active?.id };
    }

    private add(repo: Repository): void {
        if (this.disposed) { return; }
        if (this.repositories.has(repo.rootUri.fsPath)) {
            return;
        }
        const adapter = new VscodeRepositoryAdapter(repo);
        this.repositories.set(adapter.id, adapter);
        this.logger?.info(`Repository detected: ${adapter.rootPath}`);
        const activate = !this.active || adapter.id === this.storage.getActiveRepositoryId();
        if (activate) { this.active = adapter; }
        this.onDidChangeRepositoriesEmitter.fire();
        if (activate) { this.onDidChangeActiveRepositoryEmitter.fire(adapter); }
    }

    private remove(repo: Repository): void {
        const id = repo.rootUri.fsPath;
        if (!this.repositories.delete(id)) {
            return;
        }
        this.logger?.info(`Repository closed: ${id}`);
        if (this.active?.id === id) {
            this.active = this.getRepositories()[0];
            this.onDidChangeActiveRepositoryEmitter.fire(this.active);
        }
        this.onDidChangeRepositoriesEmitter.fire();
    }

    /** Syncs the manager with the git extension model (adds new, drops closed). */
    private scan(api: API): void {
        const stale = new Set(this.repositories.keys());
        for (const repo of api.repositories) {
            stale.delete(repo.rootUri.fsPath);
            this.add(repo);
        }
        for (const id of stale) {
            const wasActive = this.active?.id === id;
            if (!this.repositories.delete(id)) {
                continue;
            }
            this.logger?.info(`Repository no longer open: ${id}`);
            if (wasActive) {
                this.active = this.getRepositories()[0];
                this.onDidChangeActiveRepositoryEmitter.fire(this.active);
            }
            this.onDidChangeRepositoriesEmitter.fire();
        }
    }

    private async acquireApiWithRetry(): Promise<API> {
        let lastError: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                return await this.gitAdapter.getApi();
            } catch (e) {
                lastError = e;
                this.logger?.error('Failed to acquire vscode.git API (will retry)', e instanceof Error ? e.message : String(e));
                await delay(1500);
            }
        }
        throw lastError;
    }

    dispose(): void {
        this.disposed = true;
        this.onDidChangeRepositoriesEmitter.dispose();
        this.onDidChangeActiveRepositoryEmitter.dispose();
        this.store.dispose();
    }
}

/**
 * Serializes dangerous git operations per repository (document §57).
 * Read operations (log/show/diff/status) may run concurrently.
 */
export class GitOperationLock {
    private readonly busy = new Map<RepositoryId, number>();

    acquire(repositoryId: RepositoryId): vscode.Disposable {
        if (this.isBusy(repositoryId)) {
            throw new GitError(
                GitErrorCode.UNKNOWN,
                'Another git operation is already in progress for this repository. Please wait for it to finish.'
            );
        }
        this.busy.set(repositoryId, (this.busy.get(repositoryId) ?? 0) + 1);
        return { dispose: () => this.release(repositoryId) };
    }

    isBusy(repositoryId: RepositoryId): boolean {
        return (this.busy.get(repositoryId) ?? 0) > 0;
    }

    private release(repositoryId: RepositoryId): void {
        const count = (this.busy.get(repositoryId) ?? 1) - 1;
        if (count <= 0) {
            this.busy.delete(repositoryId);
        } else {
            this.busy.set(repositoryId, count);
        }
    }

    async run<T>(repositoryId: RepositoryId, fn: () => Promise<T>): Promise<T> {
        const lock = this.acquire(repositoryId);
        try {
            return await fn();
        } finally {
            lock.dispose();
        }
    }
}
