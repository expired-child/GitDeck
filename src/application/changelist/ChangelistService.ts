import type { ChangelistDto } from '../../shared/protocol';
import type { RepositoryManager } from '../repository/RepositoryService';
import type { ExtensionStorage } from '../../infrastructure/persistence/ExtensionStorage';

/**
 * IDEA-style custom changelists: user-defined file groups persisted per
 * repository root path in workspaceState (document §89).
 *
 * A changelist only stores path assignments; the actual file state still comes
 * from git status, so a changelist may reference paths that no longer have
 * local changes (those are simply not rendered).
 */
export class ChangelistService {
    constructor(
        private readonly repositories: RepositoryManager,
        private readonly storage: ExtensionStorage
    ) {}

    async list(repositoryId: string): Promise<ChangelistDto[]> {
        const repo = this.repositories.getRequired(repositoryId);
        return this.storage.getChangelists(repo.rootPath);
    }

    async create(repositoryId: string, name: string): Promise<ChangelistDto[]> {
        const trimmed = name.trim();
        if (!trimmed) {
            throw new Error('Changelist name must not be empty.');
        }
        const repo = this.repositories.getRequired(repositoryId);
        const changelists = this.storage.getChangelists(repo.rootPath);
        if (changelists.some(c => c.name === trimmed)) {
            throw new Error(`Changelist "${trimmed}" already exists.`);
        }
        changelists.push({ name: trimmed, paths: [] });
        await this.storage.setChangelists(repo.rootPath, changelists);
        return changelists;
    }

    async remove(repositoryId: string, name: string): Promise<ChangelistDto[]> {
        const repo = this.repositories.getRequired(repositoryId);
        const changelists = this.storage.getChangelists(repo.rootPath).filter(c => c.name !== name);
        await this.storage.setChangelists(repo.rootPath, changelists);
        return changelists;
    }

    async rename(repositoryId: string, oldName: string, newName: string): Promise<ChangelistDto[]> {
        const trimmed = newName.trim();
        if (!trimmed) {
            throw new Error('Changelist name must not be empty.');
        }
        const repo = this.repositories.getRequired(repositoryId);
        const changelists = this.storage.getChangelists(repo.rootPath);
        const target = changelists.find(c => c.name === oldName);
        if (!target) {
            throw new Error(`Changelist "${oldName}" does not exist.`);
        }
        if (oldName !== trimmed && changelists.some(c => c.name === trimmed)) {
            throw new Error(`Changelist "${trimmed}" already exists.`);
        }
        target.name = trimmed;
        await this.storage.setChangelists(repo.rootPath, changelists);
        return changelists;
    }

    /** Assigns paths to a changelist; a path belongs to at most one changelist. */
    async moveFiles(repositoryId: string, name: string, paths: string[]): Promise<ChangelistDto[]> {
        const repo = this.repositories.getRequired(repositoryId);
        const changelists = this.storage.getChangelists(repo.rootPath);
        if (!changelists.some(c => c.name === name)) {
            throw new Error(`Changelist "${name}" does not exist.`);
        }
        const moving = new Set(paths);
        for (const changelist of changelists) {
            changelist.paths = changelist.name === name
                ? Array.from(new Set([...changelist.paths, ...paths]))
                : changelist.paths.filter(p => !moving.has(p));
        }
        await this.storage.setChangelists(repo.rootPath, changelists);
        return changelists;
    }

    /** Removes paths from every changelist (drop onto a default group). */
    async removePaths(repositoryId: string, paths: string[]): Promise<ChangelistDto[]> {
        const repo = this.repositories.getRequired(repositoryId);
        const moving = new Set(paths);
        const changelists = this.storage.getChangelists(repo.rootPath);
        let changed = false;
        for (const changelist of changelists) {
            const next = changelist.paths.filter(p => !moving.has(p));
            if (next.length !== changelist.paths.length) {
                changelist.paths = next;
                changed = true;
            }
        }
        if (changed) {
            await this.storage.setChangelists(repo.rootPath, changelists);
        }
        return changelists;
    }
}
