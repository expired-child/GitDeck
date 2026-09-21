import { describe, it, expect } from 'vitest';
import { GitLogParser, FIELD_SEPARATOR, RECORD_SEPARATOR } from '../../src/infrastructure/git-cli/GitLogParser';

const F = FIELD_SEPARATOR;
const R = RECORD_SEPARATOR;

function record(...fields: string[]): string {
    return fields.join(F) + F + R;
}

describe('GitLogParser', () => {
    const parser = new GitLogParser();

    it('parses a simple commit', () => {
        const output = record('abc123', 'def456', 'HY', 'hy@example.com', '2026-09-21T10:21:00+08:00', 'main', 'fix: login');
        const commits = parser.parseCommits(output);
        expect(commits).toHaveLength(1);
        expect(commits[0]).toEqual({
            hash: 'abc123',
            parents: ['def456'],
            authorName: 'HY',
            authorEmail: 'hy@example.com',
            date: '2026-09-21T10:21:00+08:00',
            refs: ['main'],
            subject: 'fix: login'
        });
    });

    it('parses multiple records', () => {
        const output = record('a1', '', 'A', 'a@x.com', '2026-01-01T00:00:00Z', '', 'first')
            + record('b2', 'a1', 'B', 'b@x.com', '2026-01-02T00:00:00Z', '', 'second');
        const commits = parser.parseCommits(output);
        expect(commits).toHaveLength(2);
        expect(commits[0].parents).toEqual([]);
        expect(commits[1].parents).toEqual(['a1']);
    });

    it('handles spaces, newlines, CJK, emoji and quotes in the subject', () => {
        // A multi-line record can only appear in body mode; in subject mode
        // git escapes newlines. Verify separator robustness with tricky text.
        const subject = 'fix: 修复用户查询 "quoted" 🎉 with  spaces';
        const output = record('h1', '', '作者', 'z@x.com', '2026-09-21T00:00:00Z', 'HEAD -> main, origin/main, tag: v1.0', subject);
        const commits = parser.parseCommits(output);
        expect(commits[0].subject).toBe(subject);
        expect(commits[0].authorName).toBe('作者');
        expect(commits[0].refs).toEqual(['HEAD -> main', 'origin/main', 'tag: v1.0']);
    });

    it('handles separator-adjacent characters', () => {
        const subject = `a${F}b${R}c`;
        // Values containing the separators would break any parser; the format
        // prevents this by being under our control. Just ensure no crash.
        const output = record('h', '', 'a', 'a@x', 'd', '', subject);
        const commits = parser.parseCommits(output);
        expect(commits.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty list for empty output', () => {
        expect(parser.parseCommits('')).toEqual([]);
        expect(parser.parseCommits('\n\n')).toEqual([]);
    });

    it('parses empty decorations', () => {
        expect(parser.parseRefs('')).toEqual([]);
        expect(parser.parseRefs('  ')).toEqual([]);
    });

    it('parses commit with body (details mode)', () => {
        const body = 'fix: subject line\n\nLonger description\nwith 🎉 emoji and 中文';
        const output = record('h1', '', 'HY', 'hy@x.com', '2026-09-21T00:00:00Z', 'main', body);
        const commit = parser.parseCommitWithBody(output);
        expect(commit).toBeDefined();
        expect(commit!.subject).toBe('fix: subject line');
        expect(commit!.body).toBe(body);
    });

    it('parses stash list output', () => {
        const output = record('stash@{0}', 'aaa', 'WIP on main: 1234 change', '2026-09-21T00:00:00Z')
            + record('stash@{1}', 'bbb', 'On feature: temp', '2026-09-20T00:00:00Z');
        const stashes = parser.parseStashes(output);
        expect(stashes).toHaveLength(2);
        expect(stashes[0].index).toBe(0);
        expect(stashes[1].message).toBe('On feature: temp');
    });
});
