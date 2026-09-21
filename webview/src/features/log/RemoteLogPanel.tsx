import { useGitStore } from '../../store/gitStore';

export function RemoteLogPanel(): JSX.Element {
    const status = useGitStore(s => s.status);
    const result = useGitStore(s => s.remoteLog);
    const loading = useGitStore(s => s.remoteLogLoading);
    const update = useGitStore(s => s.updateRemoteLog);
    const selectCommit = useGitStore(s => s.selectCommit);
    const setActiveTab = useGitStore(s => s.setActiveTab);
    return (
        <section className="git-remote-log" aria-label="远端提交日志" aria-busy={loading}>
            <div className="git-remote-log-header">
                <button className="git-toolbar-text-button" disabled={loading}
                    title="获取当前分支的远端提交日志，不合并或修改本地代码"
                    onClick={() => void update()}>
                    {loading ? '正在更新日志…' : '更新提交日志'}
                </button>
                <span className="git-remote-log-hint">仅更新日志，不修改代码</span>
            </div>
            <div role="status" className="git-remote-log-hint">
                {result
                    ? `${result.upstream} · ${result.behind} 条未合入本地 · 本地领先 ${result.ahead} 条 · 检查于 ${new Date(result.checkedAt).toLocaleTimeString()}`
                    : status?.head.upstream ? '点击检查远端新提交；也会按设置定时检查。' : '当前分支未设置上游分支，设置后可检查远端提交。'}
            </div>
            {result && result.commits.length > 0 && (
                <details>
                    <summary>查看远端新增提交{result.behind > result.commits.length ? `（最近 ${result.commits.length} 条）` : ''}</summary>
                    <ul className="git-incoming-list">
                        {result.commits.map(commit => (
                            <li key={commit.hash}>
                                <button className="git-toolbar-text-button" title={`${commit.hash}\n${commit.date}`}
                                    onClick={() => { setActiveTab('log'); void selectCommit(commit.hash); }}>
                                    <span className="mono">{commit.hash.slice(0, 7)}</span> {commit.subject}
                                    <span className="git-remote-log-hint"> — {commit.authorName}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </section>
    );
}
