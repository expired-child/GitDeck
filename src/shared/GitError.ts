/**
 * Unified Git error model (document §46).
 */
export enum GitErrorCode {
    NOT_GIT_REPOSITORY = 'NOT_GIT_REPOSITORY',
    GIT_NOT_INSTALLED = 'GIT_NOT_INSTALLED',
    AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
    CONFLICT = 'CONFLICT',
    DIRTY_WORKTREE = 'DIRTY_WORKTREE',
    BRANCH_NOT_FOUND = 'BRANCH_NOT_FOUND',
    REMOTE_NOT_FOUND = 'REMOTE_NOT_FOUND',
    NON_FAST_FORWARD = 'NON_FAST_FORWARD',
    OPERATION_CANCELLED = 'OPERATION_CANCELLED',
    INVALID_INPUT = 'INVALID_INPUT',
    UNKNOWN = 'UNKNOWN'
}

export interface GitErrorDto {
    code: GitErrorCode;
    message: string;
    detail?: string;
    command?: string;
}

export class GitError extends Error {
    readonly code: GitErrorCode;
    readonly detail?: string;
    readonly command?: string;

    constructor(code: GitErrorCode, message: string, detail?: string, command?: string) {
        super(message);
        this.name = 'GitError';
        this.code = code;
        this.detail = detail;
        this.command = command;
    }

    toDto(): GitErrorDto {
        return { code: this.code, message: this.message, detail: this.detail, command: this.command };
    }

    static fromDto(dto: GitErrorDto): GitError {
        return new GitError(dto.code, dto.message, dto.detail, dto.command);
    }

    static from(e: unknown): GitError {
        if (e instanceof GitError) {
            return e;
        }
        const message = e instanceof Error ? e.message : String(e);
        return new GitError(GitErrorCode.UNKNOWN, message);
    }
}
