  export interface Commit {
    shortHash: string;
    hash: string;
    subject: string;
    sanitizedSubject: string;
    body: string;
    authoredOn: string;
    committedOn: string;
    author: {
      name: string;
      email: string;
    },
    committer: {
      name: string;
      email: string;
    },
    notes?: string;
    branch: string;
    tags: string[];
  }

  type GetLastCommitCallback = (err: Error, commit: Commit) => void;
  
  export const getLastCommit: (callback: GetLastCommitCallback) => void;
  
