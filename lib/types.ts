export interface Contributor {
  login: string;
  avatar_url: string;
  html_url: string;
  role: 'author' | 'reviewer' | 'committer';
}

export interface PullRequest {
  number: number;
  title: string;
  body: string;
  merged_at: string;
  author: string;
  labels: string[];
  html_url: string;
  issues: Issue[];
  release?: string;
  contributors: Contributor[];
}

export interface Issue {
  number: number;
  title: string;
  html_url: string;
}

export interface ChangelogRequest {
  owner: string;
  repo: string;
  startDate: string;
  endDate: string;
  token?: string;
  customStyle?: string;
}

export interface ChangelogCategory {
  features: PullRequest[];
  bugFixes: PullRequest[];
  documentation: PullRequest[];
  chores: PullRequest[];
  other: PullRequest[];
}

