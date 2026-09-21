import type { Branch } from './Branch';

export interface RemoteBranch extends Branch {
    remote: string;
}
