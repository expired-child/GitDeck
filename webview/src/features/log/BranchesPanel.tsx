import { useState } from 'react';
import { request } from '../../bridge/vscode';
import { ToolbarButton } from '../../components/Toolbar';
import { useGitStore } from '../../store/gitStore';
import type { MenuItem } from '../../store/gitStore';
import type { BranchDto } from '../../bridge/protocol';

function branchContextMenu(branch: BranchDto): MenuItem[] {
    const store = useGitStore.getState();
    const items: MenuItem[] = [];
    if (branch.type !== 'tag') {
        items.push({ label: 'Checkout', disabled: branch.current, action: () => void store.checkoutBranch(branch.name) });
        items.push({ label: 'New Branch from Selected...', action: () => {
            const name = window.prompt('New branch name based on ' + branch.name);
            if (name) { void store.createBranch(name, branch.name, true); }
        } });
        items.push({ separator: true });
        items.push({ label: 'Merge into Current', disabled: branch.current, action: () => void store.mergeBranch(branch.name) });
        items.push({ label: 'Rebase Current onto Selected', disabled: branch.current, action: () => void store.rebaseBranch(branch.name) });
        items.push({ label: 'Compare with Current', action: () => void store.compareBranch(branch.name) });
        items.push({ separator: true });
    }
    if (branch.type === 'local') {
        items.push({ label: 'Rename', action: () => {
            const name = window.prompt('Rename branch', branch.name);
            if (name && name !== branch.name) { void store.renameBranch(branch.name, name); }
        } });
        items.push({ label: 'Delete', danger: true, disabled: branch.current, action: () => {
            if (window.confirm(`Delete branch "${branch.name}"?`)) {
                void store.deleteBranch(branch.name, false);
            }
        } });
    } else if (branch.type === 'remote') {
        items.push({ label: 'Delete Remote Branch', danger: true, action: () => {
            if (window.confirm(`Delete remote branch "${branch.name}"?`)) {
                void store.deleteBranch(branch.name, true);
            }
        } });
    }
    items.push({ separator: true });
    items.push({ label: 'Copy Branch Name', action: () => void navigator.clipboard.writeText(branch.name) });
    return items;
}

function BranchRow({ branch, indent }: { branch: BranchDto; indent: number }): JSX.Element {
    const openMenu = useGitStore(s => s.openMenu);
    const checkoutBranch = useGitStore(s => s.checkoutBranch);
    const setFilter = useGitStore(s => s.setFilter);
    const selected = useGitStore(s => s.filter.branches?.includes(branch.name) ?? false);
    const icon = branch.type === 'tag' ? 'tag' : branch.type === 'remote' ? 'cloud' : 'git-branch';
    return (
        <button
            className={`git-branch-row${branch.current ? ' current' : ''}${selected ? ' selected' : ''}`}
            aria-pressed={selected}
            onClick={() => setFilter({ branches: [branch.name] })}
            style={{ paddingLeft: indent }}
            title={branch.name}
            onDoubleClick={() => {
                if (branch.type !== 'tag' && !branch.current) {
                    void checkoutBranch(branch.name);
                }
            }}
            onContextMenu={e => {
                e.preventDefault();
                openMenu(e.clientX, e.clientY, branchContextMenu(branch));
            }}
        >
            <i className={`codicon codicon-${icon}`} />
            <span className="git-branch-name">{branch.name}</span>
            {branch.current && <i className="codicon codicon-check" />}
        </button>
    );
}

function BranchGroup({ title, groupKey, branches, indent }: {
    title: string;
    groupKey: string;
    branches: BranchDto[];
    indent: number;
}): JSX.Element | null {
    const collapsed = useGitStore(s => s.collapsedGroups[groupKey] ?? false);
    const toggle = useGitStore(s => s.toggleGroup);
    if (branches.length === 0) {
        return null;
    }
    return (
        <div className="git-branch-group">
            <button className="git-group-header" aria-expanded={!collapsed} onClick={() => toggle(groupKey)}>
                <i className={`codicon codicon-chevron-${collapsed ? 'right' : 'down'}`} />
                <span>{title}</span>
            </button>
            {!collapsed && branches.map(b => (
                <BranchRow key={b.name} branch={b} indent={indent} />
            ))}
        </div>
    );
}

/**
 * Branches panel (document §21): Local / Remote / Tags with IDEA-style
 * context menus (document §38.3).
 */
export function BranchesPanel(): JSX.Element {
    const branches = useGitStore(s => s.branches);
    const [query, setQuery] = useState('');
    const setFilter = useGitStore(s => s.setFilter);
    const all = useGitStore(s => !s.filter.branches?.length);
    const visible = branches.filter(b => b.name.toLowerCase().includes(query.toLowerCase()));
    const locals = visible.filter(b => b.type === 'local');
    const remotes = visible.filter(b => b.type === 'remote');
    const tags = visible.filter(b => b.type === 'tag');

    return (
        <div className="git-branches">
            <div className="git-branches-heading"><span className="git-section-title">Branches</span>
                <ToolbarButton icon="add" title="New Branch" onClick={() => void request('git.branch.new').catch(e => useGitStore.getState().showToast('error', String(e)))} />
            </div>
            <input className="git-branch-search git-search-input" aria-label="Search branches" placeholder="Search branches" value={query} onChange={e => setQuery(e.target.value)} />
            <button className={`git-branch-row${all ? ' selected' : ''}`} aria-pressed={all} onClick={() => setFilter({ branches: undefined })}>
                <i className="codicon codicon-repo" /> All branches
            </button>
            <BranchGroup title="Local" groupKey="branches-local" branches={locals} indent={18} />
            <BranchGroup title="Remote" groupKey="branches-remote" branches={remotes} indent={18} />
            <BranchGroup title="Tags" groupKey="branches-tags" branches={tags} indent={18} />
            {query && !visible.length && <div className="git-empty">No matching branches.</div>}
        </div>
    );
}
