export interface DiffMeta {
  owner: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  url: string;
  baseRef: string;
  headRef: string;
  headSha: string;
  body: string;
  isDraft: boolean;
  labels: string[];
}

export interface DiffFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface DiffSource {
  getMeta(): Promise<DiffMeta>;
  getFiles(): Promise<DiffFile[]>;
}
