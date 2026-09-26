import * as vscode from 'vscode';
import type { RepositoryManager, GitOperationLock } from '../application/repository/RepositoryService';
import type { RemoteService } from '../application/remote/RemoteService';
import type { GitViewProvider } from '../presentation/webview/GitViewProvider';
import type { Logger } from '../shared/logger';

/** 自动刷新的最短间隔，避免配置成极小值后反复访问网络。 */
const MIN_INTERVAL_SECONDS = 30;
const DEFAULT_INTERVAL_SECONDS = 180;

/**
 * 定时刷新 Git Log：先 fetch 远端引用，再通知界面重新读取日志。
 *
 * 必须包含 fetch：`git log` 只能看到本地仓库已有的对象，别人新提交的提交在
 * fetch 之前根本不存在于本地，单纯重新执行 git log 不会出现这些提交。
 *
 * 只在窗口获得焦点、Git Log 界面可见、当前仓库确实配置了远端时执行，
 * 失败只写日志，不弹窗打断用户操作。
 */
export function registerLogAutoRefresh(
    context: vscode.ExtensionContext,
    repositories: RepositoryManager,
    remotes: RemoteService,
    lock: GitOperationLock,
    provider: GitViewProvider,
    logger: Logger
): void {
    let timer: NodeJS.Timeout | undefined;
    let running = false;

    const refresh = async (): Promise<void> => {
        const repo = repositories.getActiveRepository();
        if (running || !vscode.window.state.focused || !provider.isSurfaceVisible('log')
            || !repo || lock.isBusy(repo.id) || repo.getRemotes().length === 0) {
            return;
        }
        running = true;
        try {
            const head = repo.getHead();
            if (head.upstream && head.upstream.remote !== '.') {
                // 有上游时走“更新提交日志”同一条链路：显式拉取跟踪分支，并发调用会被去重。
                await remotes.updateLog(repo.id);
            } else {
                // 没有上游时退回默认远端，保证仍能看到远端新增的提交。
                await remotes.fetch(repo.id, false);
            }
            provider.postEvent({ type: 'log.changed', repositoryId: repo.id });
            provider.postEvent({ type: 'branch.changed', repositoryId: repo.id });
        } catch (error) {
            logger.error('Automatic Git Log refresh failed', error instanceof Error ? error.message : String(error));
        } finally {
            running = false;
        }
    };

    const configure = (): void => {
        clearInterval(timer);
        const seconds = vscode.workspace
            .getConfiguration('ideaGit')
            .get<number>('log.autoRefreshInterval', DEFAULT_INTERVAL_SECONDS);
        if (Number.isFinite(seconds) && seconds > 0) {
            timer = setInterval(() => { void refresh(); }, Math.max(MIN_INTERVAL_SECONDS, seconds) * 1000);
        }
    };

    configure();
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('ideaGit.log.autoRefreshInterval')) { configure(); }
        }),
        { dispose: () => clearInterval(timer) }
    );
}
