export interface Commit {
    hash: string;
    parents: string[];
    authorName: string;
    authorEmail: string;
    date: string;
    refs: string[];
    subject: string;
}

export interface CommitDetails extends Commit {
    body: string;
}
