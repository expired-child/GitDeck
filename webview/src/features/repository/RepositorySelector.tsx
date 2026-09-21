import { useGitStore } from '../../store/gitStore';

/**
 * Repository switcher (document §39): shown when the workspace contains
 * multiple repositories.
 */
export function RepositorySelector(): JSX.Element | null {
    const repositories = useGitStore(s => s.repositories);
    const activeRepoId = useGitStore(s => s.activeRepoId);
    const select = useGitStore(s => s.selectRepository);

    if (repositories.length <= 1) {
        return null;
    }
    return (
        <select
            className="git-repo-selector"
            value={activeRepoId ?? ''}
            onChange={e => void select(e.target.value)}
            title="Active repository"
        >
            {repositories.map(repo => (
                <option key={repo.id} value={repo.id}>{repo.name}</option>
            ))}
        </select>
    );
}
