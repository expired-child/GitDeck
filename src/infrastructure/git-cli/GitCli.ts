import { spawn } from 'node:child_process';
import { GitError, GitErrorCode } from '../../shared/GitError';
import { Logger } from '../../shared/logger';

export interface GitCliOptions {
    timeout?: number;
    cancellation?: { isCancellationRequested: boolean; onCancellationRequested(cb: () => void): unknown };
    maxBuffer?: number;
}

export interface GitCliResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * The single gateway to the Git CLI (document §44).
 *
 * Rules enforced here:
 * - Always spawns `git` with an args array — never shell string concatenation.
 * - cwd is always the repository root (document §92).
 * - All invocations are logged (with credential redaction).
 * - Exit errors are mapped to the unified GitError model (document §46).
 */
export class GitCli {
    constructor(private readonly logger: Logger, private readonly getExecutable: () => Promise<string> = async () => 'git') {}

    async exec(cwd: string, args: string[], options?: GitCliOptions): Promise<GitCliResult> {
        const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;
        const executable = await this.getExecutable();
        return new Promise<GitCliResult>((resolve, reject) => {
            const child = spawn(executable, args, {
                cwd,
                windowsHide: true,
                env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
            });

            let cancelled = false;
            let settled = false;
            const outBuffers: Buffer[] = [];
            const errBuffers: Buffer[] = [];
            let outSize = 0;
            let errSize = 0;
            const maxBuffer = options?.maxBuffer ?? 64 * 1024 * 1024;

            const timer = setTimeout(() => {
                cancelled = true;
                child.kill();
            }, timeout);

            const cancellation = options?.cancellation;
            const cancelHandler = () => {
                cancelled = true;
                child.kill();
            };
            if (cancellation) {
                if (cancellation.isCancellationRequested) {
                    cancelHandler();
                } else {
                    cancellation.onCancellationRequested(cancelHandler);
                }
            }

            const finish = (error?: Error) => {
                if (settled) { return; }
                settled = true;
                clearTimeout(timer);
                const stdout = Buffer.concat(outBuffers).toString('utf8');
                const stderr = Buffer.concat(errBuffers).toString('utf8');
                const exitCode = child.exitCode ?? (cancelled ? 143 : 1);
                this.logger.command(cwd, args, exitCode, Date.now() - startTime);
                if (error) {
                    reject(this.mapError(error, args, stderr));
                    return;
                }
                if (cancelled) {
                    reject(new GitError(GitErrorCode.OPERATION_CANCELLED, 'Git operation was cancelled.', undefined, `git ${args.join(' ')}`));
                    return;
                }
                if (exitCode !== 0) {
                    reject(this.mapError(new Error(stderr.trim() || `git exited with code ${exitCode}`), args, stderr));
                    return;
                }
                resolve({ stdout, stderr, exitCode });
            };

            const startTime = Date.now();

            child.stdout?.on('data', (chunk: Buffer) => {
                outSize += chunk.length;
                if (outSize <= maxBuffer) { outBuffers.push(chunk); }
            });
            child.stderr?.on('data', (chunk: Buffer) => {
                errSize += chunk.length;
                if (errSize <= maxBuffer) { errBuffers.push(chunk); }
            });
            child.on('error', (e: NodeJS.ErrnoException) => {
                if (e.code === 'ENOENT') {
                    reject(new GitError(
                        GitErrorCode.GIT_NOT_INSTALLED,
                        'Git executable was not found.',
                        'Make sure Git is installed and available on PATH.'
                    ));
                    settled = true;
                    clearTimeout(timer);
                } else {
                    finish(e);
                }
            });
            child.on('close', () => finish());
        });
    }

    /** Runs a git command and returns stdout; throws GitError on failure. */
    async out(cwd: string, args: string[], options?: GitCliOptions): Promise<string> {
        const result = await this.exec(cwd, args, options);
        return result.stdout;
    }

    private mapError(raw: Error, args: string[], stderr: string): GitError {
        const text = `${raw.message}\n${stderr}`.toLowerCase();
        const command = `git ${args.join(' ')}`;
        if (text.includes('not a git repository')) {
            return new GitError(GitErrorCode.NOT_GIT_REPOSITORY, 'Not a Git repository.', stderr.trim(), command);
        }
        if (text.includes('enoent') || text.includes('is not a git command') || text.includes('command not found')) {
            return new GitError(GitErrorCode.GIT_NOT_INSTALLED, 'Git executable was not found.', stderr.trim(), command);
        }
        if (text.includes('conflict') || text.includes('fix conflicts')) {
            return new GitError(GitErrorCode.CONFLICT, 'Merge conflict detected.', stderr.trim(), command);
        }
        if (text.includes('your local changes would be overwritten') || text.includes('cannot pull with rebase: you have unstaged changes')) {
            return new GitError(GitErrorCode.DIRTY_WORKTREE, 'Your local changes would be overwritten. Commit or stash them first.', stderr.trim(), command);
        }
        if (text.includes('authentication failed') || text.includes('could not read username') || text.includes('terminal prompts disabled')) {
            return new GitError(GitErrorCode.AUTHENTICATION_FAILED, 'Git authentication failed.', stderr.trim(), command);
        }
        if (text.includes('non-fast-forward') || text.includes('fetch first') || text.includes('rejected')) {
            return new GitError(GitErrorCode.NON_FAST_FORWARD, 'Remote rejected the update because the remote branch contains commits that are not present locally.', stderr.trim(), command);
        }
        if (text.includes('did not match any file(s) known to git') && args.includes('checkout') || text.includes('invalid reference')) {
            return new GitError(GitErrorCode.BRANCH_NOT_FOUND, 'Branch or revision not found.', stderr.trim(), command);
        }
        if (text.includes('no such remote') || text.includes("remote origin") && text.includes('does not')) {
            return new GitError(GitErrorCode.REMOTE_NOT_FOUND, 'Remote not found.', stderr.trim(), command);
        }
        return new GitError(GitErrorCode.UNKNOWN, raw.message || 'Git command failed.', stderr.trim(), command);
    }
}
