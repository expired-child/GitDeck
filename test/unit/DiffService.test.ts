import { describe, it, expect, vi } from 'vitest';
const platform = vi.hoisted(() => ({ executeCommand: vi.fn(), file: (fsPath: string) => ({ fsPath }) }));
vi.mock('vscode', () => ({ commands: { executeCommand: platform.executeCommand }, Uri: { file: platform.file } }));
import { DiffService } from '../../src/application/diff/DiffService';

describe('native Git diff revision selection', () => {
    it('compares staged files against HEAD using API.toGitUri and compares worktree against the index', async () => {
        const toGitUri = vi.fn((uri, ref) => ({ uri, ref }));
        const manager = { getRequired: () => ({ rootPath: 'D:/repo' }), toGitUri };
        const service = new DiffService(manager as any, {} as any, {} as any);
        await service.show({ kind: 'index', path: 'new.txt', originalPath: 'old.txt', repositoryId: 'repo' });
        expect(toGitUri.mock.calls[0][1]).toBe('HEAD');
        expect(toGitUri.mock.calls[0][0].fsPath).toMatch(/old.txt$/);
        expect(toGitUri.mock.calls[1][1]).toBe('');
        expect(toGitUri.mock.calls[1][0].fsPath).toMatch(/new.txt$/);
        toGitUri.mockClear();
        await service.show({ kind: 'worktree', path: 'new.txt', repositoryId: 'repo' });
        expect(toGitUri.mock.calls[0][1]).toBe('');
        expect(platform.executeCommand).toHaveBeenLastCalledWith('vscode.diff', expect.anything(), expect.objectContaining({ fsPath: expect.stringMatching(/new.txt$/) }), 'new.txt (Working Tree)');
    });
});
