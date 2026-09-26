import { useRef, useState } from 'react';
import { useGitStore } from '../../store/gitStore';
import { request } from '../../bridge/vscode';

/** 提交信息框可调整到的最小高度，与 .git-commit-message 的 min-height 保持一致。 */
const MIN_MESSAGE_HEIGHT = 52;
/** 调整提交信息框时至少为上方文件列表保留的高度，避免列表被挤没。 */
const MIN_LIST_HEIGHT = 120;
/** 键盘调整高度时每次的步长。 */
const RESIZE_STEP = 8;

/**
 * Commit message area + action buttons (document §10.1, §11).
 *
 * 提交面板钉在侧栏底部，textarea 底边被下方的 Amend 和按钮固定，
 * 原生 resize（右下角手柄）只能让顶边上移，手柄不跟随指针，方向感也是反的。
 * 因此改用面板顶部的拖拽条：向上拖即扩大输入框，拖拽条与指针 1:1 跟随。
 */
export function CommitPanel(): JSX.Element | null {
    const status = useGitStore(s => s.status);
    const commitMessage = useGitStore(s => s.commitMessage);
    const setCommitMessage = useGitStore(s => s.setCommitMessage);
    const amend = useGitStore(s => s.amend);
    const setAmend = useGitStore(s => s.setAmend);
    const messageHistory = useGitStore(s => s.messageHistory);
    const commit = useGitStore(s => s.commit);
    const commitBusy = useGitStore(s => s.commitBusy);
    const aiBusy = useGitStore(s => s.aiBusy);
    const generateCommitMessage = useGitStore(s => s.generateCommitMessage);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [messageHeight, setMessageHeight] = useState<number | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

    const hasSelection = useGitStore(s => Object.values(s.checked).some(Boolean));
    if (!status) {
        return null;
    }
    const isBusy = status.state !== 'NORMAL' || commitBusy;
    const canCommit = !isBusy && (hasSelection || amend) && Boolean(commitMessage.trim());

    /** 输入框高度上限：扣除面板其他部分后，文件列表至少保留 MIN_LIST_HEIGHT。 */
    const messageHeightLimit = (): number => {
        const textarea = textareaRef.current;
        const panel = panelRef.current;
        if (!textarea || !panel) {
            return MIN_MESSAGE_HEIGHT;
        }
        const layoutHeight = panel.parentElement?.clientHeight ?? 0;
        const fixedHeight = panel.offsetHeight - textarea.offsetHeight;
        return Math.max(MIN_MESSAGE_HEIGHT, layoutHeight - fixedHeight - MIN_LIST_HEIGHT);
    };

    /** 把高度收敛到 [MIN_MESSAGE_HEIGHT, messageHeightLimit()]，避免越界。 */
    const clampMessageHeight = (height: number): number =>
        Math.max(MIN_MESSAGE_HEIGHT, Math.min(height, messageHeightLimit()));

    /** 拖拽中：deltaY 为指针向上位移，正值表示扩大输入框。 */
    const applyDragHeight = (deltaY: number): void => {
        const drag = dragRef.current;
        if (!drag) {
            return;
        }
        setMessageHeight(clampMessageHeight(drag.startHeight + deltaY));
    };

    /** 键盘调整：以当前实际高度为基准增减。 */
    const nudgeMessageHeight = (delta: number): void => {
        const current = messageHeight ?? textareaRef.current?.offsetHeight ?? MIN_MESSAGE_HEIGHT;
        setMessageHeight(clampMessageHeight(current + delta));
    };

    return (
        <div className="git-commit-panel" ref={panelRef}>
            <div
                className="git-commit-resizer"
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize commit message"
                aria-valuemin={MIN_MESSAGE_HEIGHT}
                aria-valuenow={messageHeight ?? undefined}
                title="向上拖动以扩大输入框"
                tabIndex={0}
                onPointerDown={e => {
                    const textarea = textareaRef.current;
                    if (!textarea) {
                        return;
                    }
                    dragRef.current = { startY: e.clientY, startHeight: textarea.offsetHeight };
                    e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={e => {
                    if (!dragRef.current) {
                        return;
                    }
                    applyDragHeight(dragRef.current.startY - e.clientY);
                }}
                onPointerUp={e => {
                    dragRef.current = null;
                    e.currentTarget.releasePointerCapture(e.pointerId);
                }}
                onLostPointerCapture={() => { dragRef.current = null; }}
                onKeyDown={e => {
                    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') {
                        return;
                    }
                    e.preventDefault();
                    nudgeMessageHeight(e.key === 'ArrowUp' ? RESIZE_STEP : -RESIZE_STEP);
                }}
            />
            <div className="git-commit-bar">
                <label className="git-amend-row">
                    <input
                        type="checkbox"
                        checked={amend}
                        onChange={e => void setAmend(e.target.checked)}
                    />
                    Amend last commit
                </label>
                <span className="git-toolbar-spacer" />
                {messageHistory.length > 0 && (
                    <button
                        className="git-commit-icon-button"
                        title="Commit message history"
                        aria-label="Commit message history"
                        onClick={() => setHistoryOpen(o => !o)}
                    >
                        <i className="codicon codicon-history" />
                    </button>
                )}
                <button
                    className="git-commit-icon-button"
                    title="Generate commit message with AI"
                    aria-label="Generate commit message with AI"
                    disabled={aiBusy}
                    onClick={() => void generateCommitMessage()}
                >
                    <i className={`codicon ${aiBusy ? 'codicon-loading codicon-modifier-spin' : 'codicon-sparkle'}`} />
                </button>
            </div>
            <div className="git-commit-message-wrap">
                <textarea
                    ref={textareaRef}
                    className="git-commit-message"
                    style={messageHeight === null ? undefined : { height: messageHeight }}
                    placeholder="Commit message"
                    aria-label="Commit message"
                    value={commitMessage}
                    onChange={e => setCommitMessage(e.target.value)}
                    onKeyDown={e => {
                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canCommit) {
                            void commit(false);
                        }
                    }}
                />
                {historyOpen && (
                    <div className="git-message-history">
                        {messageHistory.map((message, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    setCommitMessage(message);
                                    setHistoryOpen(false);
                                }}
                            >
                                {message.length > 60 ? `${message.slice(0, 60)}…` : message}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <div className="git-commit-buttons">
                <button
                    className="git-primary-button"
                    disabled={!canCommit}
                    onClick={() => void commit(false)}
                >
                    {commitBusy ? 'Committing…' : 'Commit'}
                </button>
                <button
                    className="git-secondary-button"
                    disabled={!canCommit}
                    onClick={() => void commit(true)}
                    title="Commit, then review and push"
                >
                    Commit &amp; Push…
                </button>
                <span className="git-toolbar-spacer" />
                <button
                    className="git-commit-icon-button"
                    title="IDEA Git settings"
                    aria-label="IDEA Git settings"
                    onClick={() => void request('git.settings.open').catch(() => undefined)}
                >
                    <i className="codicon codicon-gear" />
                </button>
            </div>
        </div>
    );
}
