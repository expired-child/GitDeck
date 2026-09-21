import type { ChangeStatusCode } from '../change/ChangeStatus';

export interface CommitFile {
    path: string;
    originalPath?: string;
    status: ChangeStatusCode;
}
