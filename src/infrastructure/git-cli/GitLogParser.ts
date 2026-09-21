import type { Commit, CommitDetails } from '../../domain/commit/Commit';

/**
 * Field/record separators (document §14): the commit message can never break
 * parsing because records are split on \x1e and fields on \x1f.
 */
export const FIELD_SEPARATOR = '\x1f';
export const RECORD_SEPARATOR = '\x1e';

export const LOG_FORMAT = `%H${FIELD_SEPARATOR}%P${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ae${FIELD_SEPARATOR}%ad${FIELD_SEPARATOR}%D${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}${RECORD_SEPARATOR}`;
export const LOG_WITH_BODY_FORMAT = `%H${FIELD_SEPARATOR}%P${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ae${FIELD_SEPARATOR}%ad${FIELD_SEPARATOR}%D${FIELD_SEPARATOR}%B${FIELD_SEPARATOR}${RECORD_SEPARATOR}`;

/**
 * Parses output of `git log --pretty=format:"%H%x1f...%x1e"`.
 * Robust against spaces, newlines, CJK, emoji, quotes inside commit messages.
 */
export class GitLogParser {
    parseCommits(output: string): Commit[] {
        const commits: Commit[] = [];
        const records = output.split(RECORD_SEPARATOR);
        for (const record of records) {
            if (record.trim() === '') {
                continue;
            }
            const fields = record.split(FIELD_SEPARATOR);
            if (fields.length < 7) {
                continue;
            }
            commits.push({
                hash: fields[0].trim(),
                parents: fields[1].trim() ? fields[1].trim().split(' ') : [],
                authorName: fields[2],
                authorEmail: fields[3],
                date: fields[4],
                refs: this.parseRefs(fields[5]),
                subject: fields[6]
            });
        }
        return commits;
    }

    /** Parses output using LOG_WITH_BODY_FORMAT (%B in the last field). */
    parseCommitWithBody(output: string): CommitDetails | undefined {
        for (const record of output.split(RECORD_SEPARATOR)) {
            if (record.trim() === '') {
                continue;
            }
            const fields = record.split(FIELD_SEPARATOR);
            if (fields.length < 7) {
                continue;
            }
            const body = fields[6];
            const subject = body.split('\n')[0] ?? '';
            return {
                hash: fields[0].trim(),
                parents: fields[1].trim() ? fields[1].trim().split(' ') : [],
                authorName: fields[2],
                authorEmail: fields[3],
                date: fields[4],
                refs: this.parseRefs(fields[5]),
                subject,
                body
            };
        }
        return undefined;
    }

    /** Parses the %D decoration string: `HEAD -> main, origin/main, tag: v1.0`. */
    parseRefs(decorations: string): string[] {
        if (!decorations || !decorations.trim()) {
            return [];
        }
        return decorations
            .split(',')
            .map(r => r.trim())
            .filter(r => r.length > 0);
    }

    /** Parses `git stash list --pretty=format:%gd%x1f%H%x1f%gs%x1f%ad%x1e` output. */
    parseStashes(output: string): { index: number; hash: string; message: string; date: string }[] {
        const stashes: { index: number; hash: string; message: string; date: string }[] = [];
        for (const record of output.split(RECORD_SEPARATOR)) {
            if (record.trim() === '') { continue; }
            const f = record.split(FIELD_SEPARATOR);
            if (f.length < 4) { continue; }
            const match = /stash@\{(\d+)\}/.exec(f[0]);
            stashes.push({
                index: match ? Number(match[1]) : stashes.length,
                hash: f[1].trim(),
                message: f[2],
                date: f[3]
            });
        }
        return stashes;
    }
}
