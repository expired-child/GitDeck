import { GitError, GitErrorCode } from '../../shared/GitError';

// eslint-disable-next-line no-control-regex -- control chars break the log record format by design
const FORBIDDEN_IN_VALUE = /[\x1e\x1f]/;

/**
 * Small fluent builder for git argument lists (document §44).
 * Flags pass through as-is; user supplied values are validated so they can
 * never be interpreted as flags or break record parsing.
 */
export class GitCommandBuilder {
    private readonly args: string[] = [];

    constructor(private readonly subcommand: string) {
        this.args.push(subcommand);
    }

    flag(...flags: string[]): this {
        this.args.push(...flags);
        return this;
    }

    flagIf(condition: boolean, ...flags: string[]): this {
        if (condition) {
            this.flag(...flags);
        }
        return this;
    }

    /** Adds a validated user value (branch name, path, hash, ...). */
    value(...values: string[]): this {
        for (const v of values) {
            if (!v || v.startsWith('-')) {
                throw new GitError(GitErrorCode.INVALID_INPUT, `Invalid git argument value: "${v}"`);
            }
            if (FORBIDDEN_IN_VALUE.test(v)) {
                throw new GitError(GitErrorCode.INVALID_INPUT, `Invalid characters in git argument value: "${v}"`);
            }
            this.args.push(v);
        }
        return this;
    }

    /** Adds `--pretty=format:...` style literals that are controlled by us. */
    raw(...args: string[]): this {
        this.args.push(...args);
        return this;
    }

    build(): string[] {
        return [...this.args];
    }
}
