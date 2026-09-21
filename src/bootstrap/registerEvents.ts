import * as vscode from 'vscode';
import { DisposableStore } from '../shared/DisposableStore';
import type { RepositoryManager } from '../application/repository/RepositoryService';
import type { GitStatusService } from '../application/status/GitStatusService';
import type { GitViewProvider } from '../presentation/webview/GitViewProvider';
import type { GitStatusBar } from '../presentation/statusbar/GitStatusBar';
import type { VscodeRepositoryAdapter } from '../infrastructure/vscode-git/VscodeRepositoryAdapter';

const REFRESH_DEBOUNCE_MS = 300;

/** Observe the same repository model as VS Code, without polling the worktree. */
export function registerEvents(
    context: vscode.ExtensionContext,
    repositories: RepositoryManager,
    statusService: GitStatusService,
    provider: GitViewProvider,
    statusBar: GitStatusBar
): void {
    const store = new DisposableStore();
    context.subscriptions.push(store);
    const attached = new Map<string, { repo: VscodeRepositoryAdapter; dispose(): void }>();
    let disposed = false;

    const emitRepositories = () => {
        provider.postEvent({ type: 'repository.changed', ...repositories.toDto() });
        statusBar.update();
    };

    function attachToRepositories(): void {
        const current = repositories.getRepositories();
        for (const [id, binding] of attached) {
            if (!current.includes(binding.repo)) {
                binding.dispose();
                attached.delete(id);
            }
        }
        for (const repo of current) {
            if (attached.has(repo.id)) { continue; }
            let timer: NodeJS.Timeout | undefined;
            let closed = false;
            let revision = 0;
            const signature = () => JSON.stringify([repo.getHead().branch, repo.getHead().commit, repo.vscodeRepository.state.refs]);
            let lastRefs = signature();
            const push = async () => {
                const version = ++revision;
                try {
                    const status = await statusService.getStatus(repo);
                    if (closed || disposed || version !== revision) { return; }
                    provider.postEvent({ type: 'status.changed', repositoryId: repo.id, status });
                    const refs = signature();
                    if (refs !== lastRefs) {
                        lastRefs = refs;
                        provider.postEvent({ type: 'branch.changed', repositoryId: repo.id });
                        provider.postEvent({ type: 'log.changed', repositoryId: repo.id });
                    }
                    statusBar.update();
                } catch (error) {
                    if (!closed && !disposed) { console.error('IDEA Git status refresh failed', error); }
                }
            };
            const subscription = repo.vscodeRepository.state.onDidChange(() => {
                ++revision;
                clearTimeout(timer);
                timer = setTimeout(() => { void push(); }, REFRESH_DEBOUNCE_MS);
            });
            attached.set(repo.id, {
                repo,
                dispose() { closed = true; clearTimeout(timer); subscription.dispose(); }
            });
            void push();
        }
    }

    store.add(repositories.onDidChangeRepositories(() => {
        attachToRepositories();
        emitRepositories();
    }));
    store.add(repositories.onDidChangeActiveRepository(emitRepositories));
    store.add(vscode.window.onDidChangeWindowState(state => {
        if (state.focused) {
            void repositories.refresh().catch(error => console.error('IDEA Git refresh failed', error));
        }
    }));
    store.add({ dispose() {
        disposed = true;
        for (const binding of attached.values()) { binding.dispose(); }
        attached.clear();
    } });
    attachToRepositories();
    emitRepositories();
    statusBar.show();
}
