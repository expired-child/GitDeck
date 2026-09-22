import { useEffect } from 'react';
import { useGitStore } from './store/gitStore';
import { RepositorySelector } from './features/repository/RepositorySelector';
import { ChangesView } from './features/changes/ChangesView';
import { CommitPanel } from './features/commit/CommitPanel';
import { LogView } from './features/log/LogView';
import { RemoteLogPanel } from './features/log/RemoteLogPanel';
import { HistoryView } from './features/history/HistoryView';
import { PushModal } from './features/commit/PushModal';
import { ContextMenu } from './components/ContextMenu';
import { InputDialog } from './components/InputDialog';
import { EmptyState } from './components/EmptyState';
import { ToolbarButton } from './components/Toolbar';
import { request } from './bridge/vscode';

function Toast(): JSX.Element | null {
    const toast = useGitStore(s => s.toast);
    const showToast = useGitStore(s => s.showToast);
    useEffect(() => {
        if (!toast) { return; }
        const timer = setTimeout(() => showToast('info', ''), 4000);
        return () => clearTimeout(timer);
    }, [toast, showToast]);
    // Empty message means "dismissed".
    if (!toast || toast.message === '') {
        return null;
    }
    return <div className={`git-toast ${toast.kind}`}>{toast.message}</div>;
}

export default function App(): JSX.Element {
    const activeTab = useGitStore(s => s.activeTab);
    const setActiveTab = useGitStore(s => s.setActiveTab);
    const repositories = useGitStore(s => s.repositories);
    const status = useGitStore(s => s.status);
    const openPushPreview = useGitStore(s => s.openPushPreview);
    const initRepository = useGitStore(s => s.initRepository);
    const historyPath = useGitStore(s => s.historyPath);
    const isCommit = document.body.dataset.surface !== 'log';

    useEffect(() => {
        void useGitStore.getState().boot();
    }, []);

    if (repositories.length === 0) {
        return (
            <div className="git-root">
                <EmptyState
                    message="No Git repository found."
                    hint="Initialize a repository in the current workspace folder."
                >
                    <button className="git-primary-button" onClick={() => void initRepository()}>
                        Initialize Repository
                    </button>
                </EmptyState>
                <ContextMenu />
                <InputDialog />
                <Toast />
            </div>
        );
    }

    return (
        <div className={`git-root git-surface-${isCommit ? 'commit' : 'log'}`}>
            <div className="git-header">
                <RepositorySelector />
                {status?.head.branch && (
                    <button className="git-header-branch git-toolbar-text-button" title="Branches — checkout or create branch"
                        onClick={() => void request('git.branch.pick').catch(e => useGitStore.getState().showToast('error', String(e)))}>
                        <i className="codicon codicon-git-branch" /> {status.head.branch}
                        {status.head.ahead ? ` ↑${status.head.ahead}` : ''}
                        {status.head.behind ? ` ↓${status.head.behind}` : ''}
                        <i className="codicon codicon-chevron-down" />
                    </button>
                )}
                <span className="git-toolbar-spacer" />
                <ToolbarButton icon="cloud-download" title="Fetch — download remote refs" onClick={() => void useGitStore.getState().fetch(false)} />
                <ToolbarButton icon="arrow-down" title="Pull — update local code" onClick={() => void useGitStore.getState().pull()} />
                <ToolbarButton icon="arrow-up" title="Push commits" onClick={() => void openPushPreview()} />
                <ToolbarButton icon={isCommit ? 'history' : 'git-commit'} title={isCommit ? 'Open Git Log (Alt+9)' : 'Open Commit (Alt+0)'}
                    onClick={() => setActiveTab(isCommit ? 'log' : 'changes')} />
            </div>
            {!isCommit && <div className="git-tabs" role="tablist" aria-label="Git views">
                <button role="tab" aria-selected={activeTab !== 'history'} className={`git-tab${activeTab !== 'history' ? ' active' : ''}`} onClick={() => setActiveTab('log')}>Log</button>
                {historyPath && <button role="tab" aria-selected={activeTab === 'history'} className={`git-tab${activeTab === 'history' ? ' active' : ''}`} onClick={() => setActiveTab('history')}>History: {historyPath.split('/').pop()}</button>}
            </div>}
            <div className="git-content">
                {isCommit && (
                    <div className="git-changes-layout">
                        <div className="git-changes-scroll">
                            <ChangesView />
                        </div>
                        <CommitPanel />
                    </div>
                )}
                {!isCommit && activeTab !== 'history' && <LogView />}
                {!isCommit && activeTab === 'history' && <HistoryView />}
            </div>
            {!isCommit && <RemoteLogPanel />}
            <PushModal />
            <ContextMenu />
            <InputDialog />
            <Toast />
        </div>
    );
}
