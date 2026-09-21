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
import { EmptyState } from './components/EmptyState';
import type { TabId } from './store/gitStore';

const TABS: { id: TabId; label: string }[] = [
    { id: 'changes', label: 'Local Changes' },
    { id: 'log', label: 'Log' },
    { id: 'history', label: 'History' }
];

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
                <Toast />
            </div>
        );
    }

    return (
        <div className="git-root">
            <div className="git-header">
                <RepositorySelector />
                {status?.head.branch && (
                    <span className="git-header-branch" title="Current branch">
                        <i className="codicon codicon-git-branch" /> {status.head.branch}
                        {status.head.ahead ? ` ↑${status.head.ahead}` : ''}
                        {status.head.behind ? ` ↓${status.head.behind}` : ''}
                    </span>
                )}
                <span className="git-toolbar-spacer" />
                <button className="git-toolbar-text-button" title="Fetch" onClick={() => void useGitStore.getState().fetch(false)}>
                    Fetch
                </button>
                <button className="git-toolbar-text-button" title="Pull" onClick={() => void useGitStore.getState().pull()}>
                    Pull
                </button>
                <button className="git-toolbar-text-button" title="Push" onClick={() => void openPushPreview()}>
                    Push
                </button>
            </div>
            <RemoteLogPanel />
            <div className="git-tabs">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        className={`git-tab${activeTab === tab.id ? ' active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <div className="git-content">
                {activeTab === 'changes' && (
                    <div className="git-changes-layout">
                        <div className="git-changes-scroll">
                            <ChangesView />
                        </div>
                        <CommitPanel />
                    </div>
                )}
                {activeTab === 'log' && <LogView />}
                {activeTab === 'history' && <HistoryView />}
            </div>
            <PushModal />
            <ContextMenu />
            <Toast />
        </div>
    );
}
