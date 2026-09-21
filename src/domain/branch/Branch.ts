export interface Branch {
    name: string;
    current: boolean;
    upstream?: string | null;
    commit?: string;
}
