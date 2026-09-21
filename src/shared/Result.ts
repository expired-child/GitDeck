import { GitError } from './GitError';

export type Result<T> = { ok: true; value: T } | { ok: false; error: GitError };

export function ok<T>(value: T): Result<T> {
    return { ok: true, value };
}

export function err<T = never>(error: GitError): Result<T> {
    return { ok: false, error };
}

export async function wrapAsync<T>(fn: () => Promise<T>): Promise<Result<T>> {
    try {
        return ok(await fn());
    } catch (e) {
        return err(GitError.from(e));
    }
}
