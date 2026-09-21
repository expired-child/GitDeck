import type { ChangeStatusCode } from './ChangeStatus';

export interface FileChange {
    path: string;
    originalPath?: string;
    status: ChangeStatusCode;
    staged: boolean;
}
