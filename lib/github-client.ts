import { Octokit } from '@octokit/rest';
import { Endpoints } from '@octokit/types';
import { PullRequest, Issue, Contributor } from './types';

const MAX_RATE_LIMIT_RETRIES = 3;
const RETRY_BACKOFF_BASE_MS = 1500;
const MAX_ISSUES_PER_PR = 5;
const RATE_LIMIT_RESET_BUFFER_MS = 1000;

type GitHubHeaders = Record<string, string | number | undefined>;
type GitHubPull = Endpoints['GET /repos/{owner}/{repo}/pulls']['response']['data'][number];
type GitHubRelease = Endpoints['GET /repos/{owner}/{repo}/releases']['response']['data'][number];
type GitHubCommit = Endpoints['GET /repos/{owner}/{repo}/pulls/{pull_number}/commits']['response']['data'][number];

interface GitHubErrorShape {
  status?: number;
  message?: string;
  response?: {
    headers?: GitHubHeaders;
    data?: { message?: string };
  };
}

export class GitHubClientError extends Error {
  status?: number;
  retryAfterSeconds?: number;
  isRateLimit: boolean;

  constructor(
    message: string,
    options?: {
      status?: number;
      retryAfterSeconds?: number;
      isRateLimit?: boolean;
    }
  ) {
    super(message);
    this.name = 'GitHubClientError';
    this.status = options?.status;
    this.retryAfterSeconds = options?.retryAfterSeconds;
    this.isRateLimit = options?.isRateLimit ?? false;
  }
}

export class GitHubClient {
  private octokit: Octokit;
  private readonly hasAuthToken: boolean;
  private optionalFetchesDisabled = false;
  private issueCache = new Map<number, Issue | null>();
  private commitsCache = new Map<number, GitHubCommit[]>();

  constructor(token?: string) {
    const authToken = token?.trim() || process.env.GITHUB_TOKEN?.trim();
    this.hasAuthToken = Boolean(authToken);

    this.octokit = new Octokit({
      auth: authToken || undefined,
    });
  }

  async validateRepo(owner: string, repo: string): Promise<boolean> {
    try {
      await this.requestWithRetry(
        () => this.octokit.repos.get({ owner, repo }),
        `validating repository ${owner}/${repo}`
      );
      return true;
    } catch {
      return false;
    }
  }

  async checkRepoVisibility(owner: string, repo: string): Promise<'public' | 'private' | 'not-found'> {
    try {
      const { data } = await this.octokit.repos.get({ owner, repo });
      return data.private ? 'private' : 'public';
    } catch (error) {
      const githubError = this.asGitHubError(error);
      if (githubError.status === 404) {
        const octokitWithoutAuth = new Octokit();
        try {
          await octokitWithoutAuth.repos.get({ owner, repo });
          return 'public';
        } catch {
          return 'not-found';
        }
      }
      return 'not-found';
    }
  }

  async getPullRequests(options: {
    owner: string;
    repo: string;
    since: Date;
    until: Date;
  }): Promise<PullRequest[]> {
    const { owner, repo, since, until } = options;
    const pullRequests: PullRequest[] = [];

    try {
      const releases = await this.getReleases(owner, repo, since, until);

      let page = 1;
      const perPage = 100;
      let hasMore = true;

      while (hasMore) {
        const { data } = await this.requestWithRetry(
          () =>
            this.octokit.pulls.list({
              owner,
              repo,
              state: 'closed',
              sort: 'updated',
              direction: 'desc',
              per_page: perPage,
              page,
            }),
          `fetching pull requests page ${page} for ${owner}/${repo}`
        );

        if (data.length === 0) {
          hasMore = false;
          break;
        }

        for (const pr of data) {
          if (!pr.merged_at) continue;

          const mergedDate = new Date(pr.merged_at);

          if (mergedDate >= since && mergedDate <= until) {
            const issues = await this.getIssuesForPR(owner, repo, pr.number, pr.body || '');

            let body = pr.body || '';

            let commitsForPR: GitHubCommit[] | null = null;
            if (!body || body.trim().length === 0) {
              commitsForPR = await this.getCommitsForPR(owner, repo, pr.number);

              if (commitsForPR) {
                const commitMessages = commitsForPR
                  .map(c => c.commit.message)
                  .filter(msg => msg && !msg.startsWith('Merge'))
                  .slice(0, 5);

                if (commitMessages.length > 0) {
                  body = commitMessages.join('\n');
                }
              }
            }

            const release = this.findReleaseForPR(pr, releases);
            const contributors = await this.getContributorsForPR(
              owner,
              repo,
              pr,
              commitsForPR
            );

            pullRequests.push({
              number: pr.number,
              title: pr.title,
              body,
              merged_at: pr.merged_at,
              author: pr.user?.login || 'unknown',
              labels: pr.labels.map((label) =>
                typeof label === 'string' ? label : label.name || ''
              ),
              html_url: pr.html_url,
              issues,
              release,
              contributors,
            });
          } else if (mergedDate < since) {
            hasMore = false;
            break;
          }
        }

        if (data.length < perPage) {
          hasMore = false;
        }

        page++;
      }

      return pullRequests;
    } catch (error) {
      console.error('Error fetching pull requests:', error);
      if (error instanceof GitHubClientError) {
        throw error;
      }
      throw new GitHubClientError('Failed to fetch pull requests from GitHub');
    }
  }

  private async getReleases(owner: string, repo: string, since: Date, until: Date) {
    try {
      const response = await this.requestOptional(
        () =>
          this.octokit.repos.listReleases({
            owner,
            repo,
            per_page: 100,
          }),
        `fetching releases for ${owner}/${repo}`
      );

      if (!response) return [];

      const { data } = response;

      return data.filter(release => {
        if (!release.published_at) return false;
        const publishedDate = new Date(release.published_at);
        return publishedDate >= since && publishedDate <= until;
      });
    } catch (error) {
      console.warn('Could not fetch releases:', error);
      return [];
    }
  }

  private findReleaseForPR(pr: GitHubPull, releases: GitHubRelease[]): string | undefined {
    if (releases.length === 0) return undefined;

    const prMergedDate = new Date(pr.merged_at!);

    const sortedReleases = releases
      .filter(r => r.published_at)
      .sort((a, b) => new Date(a.published_at!).getTime() - new Date(b.published_at!).getTime());

    for (const release of sortedReleases) {
      const releaseDate = new Date(release.published_at!);
      if (releaseDate >= prMergedDate) {
        return release.tag_name;
      }
    }

    return undefined;
  }

  private async getContributorsForPR(
    owner: string,
    repo: string,
    pr: GitHubPull,
    commitsForPR: GitHubCommit[] | null
  ): Promise<Contributor[]> {
    const seen = new Map<string, Contributor>();

    // PR author
    if (pr.user?.login) {
      seen.set(pr.user.login, {
        login: pr.user.login,
        avatar_url: pr.user.avatar_url || '',
        html_url: pr.user.html_url || `https://github.com/${pr.user.login}`,
        role: 'author',
      });
    }

    if (this.optionalFetchesDisabled) {
      return Array.from(seen.values());
    }

    // Reviewers
    const reviewsResponse = await this.requestOptional(
      () =>
        this.octokit.pulls.listReviews({
          owner,
          repo,
          pull_number: pr.number,
        }),
      `fetching reviews for PR #${pr.number}`
    );

    if (reviewsResponse) {
      const { data: reviews } = reviewsResponse;
      for (const review of reviews) {
        if (review.user?.login && !seen.has(review.user.login)) {
          seen.set(review.user.login, {
            login: review.user.login,
            avatar_url: review.user.avatar_url || '',
            html_url: review.user.html_url || `https://github.com/${review.user.login}`,
            role: 'reviewer',
          });
        }
      }
    }

    // Committers (unique commit authors that differ from the PR author)
    const commits = commitsForPR || (await this.getCommitsForPR(owner, repo, pr.number));

    if (commits) {
      for (const commit of commits) {
        if (commit.author?.login && !seen.has(commit.author.login)) {
          seen.set(commit.author.login, {
            login: commit.author.login,
            avatar_url: commit.author.avatar_url || '',
            html_url: commit.author.html_url || `https://github.com/${commit.author.login}`,
            role: 'committer',
          });
        }

        // Co-authors from commit message
        const coAuthorMatches = commit.commit.message.matchAll(
          /Co-authored-by:\s*(.+?)\s*<[^>]+>/gi
        );
        for (const match of coAuthorMatches) {
          const name = match[1].trim();
          if (!seen.has(name)) {
            seen.set(name, {
              login: name,
              avatar_url: '',
              html_url: `https://github.com/${name}`,
              role: 'committer',
            });
          }
        }
      }
    }

    return Array.from(seen.values());
  }

  private async getIssuesForPR(
    owner: string,
    repo: string,
    prNumber: number,
    prBody: string
  ): Promise<Issue[]> {
    if (this.optionalFetchesDisabled) return [];

    const issues: Issue[] = [];
    const issueReferences = this.extractIssueReferences(prBody).slice(0, MAX_ISSUES_PER_PR);

    for (const issueNumber of issueReferences) {
      if (this.issueCache.has(issueNumber)) {
        const cachedIssue = this.issueCache.get(issueNumber);
        if (cachedIssue) {
          issues.push(cachedIssue);
        }
        continue;
      }

      const issueResponse = await this.requestOptional(
        () =>
          this.octokit.issues.get({
            owner,
            repo,
            issue_number: issueNumber,
          }),
        `fetching issue #${issueNumber} for PR #${prNumber}`
      );

      if (!issueResponse) {
        this.issueCache.set(issueNumber, null);
        continue;
      }

      const issue: Issue = {
        number: issueResponse.data.number,
        title: issueResponse.data.title,
        html_url: issueResponse.data.html_url,
      };
      this.issueCache.set(issueNumber, issue);
      issues.push(issue);
    }

    return issues;
  }

  private async getCommitsForPR(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<GitHubCommit[] | null> {
    if (this.optionalFetchesDisabled) return null;

    const cachedCommits = this.commitsCache.get(prNumber);
    if (cachedCommits) {
      return cachedCommits;
    }

    const commitsResponse = await this.requestOptional(
      () =>
        this.octokit.pulls.listCommits({
          owner,
          repo,
          pull_number: prNumber,
          per_page: 100,
        }),
      `fetching commits for PR #${prNumber}`
    );

    if (!commitsResponse) {
      return null;
    }

    this.commitsCache.set(prNumber, commitsResponse.data);
    return commitsResponse.data;
  }

  private extractIssueReferences(text: string): number[] {
    const issueNumbers: number[] = [];
    const patterns = [
      /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi,
      /#(\d+)/g,
    ];

    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const num = parseInt(match[1], 10);
        if (!issueNumbers.includes(num)) {
          issueNumbers.push(num);
        }
      }
    }

    return issueNumbers;
  }

  private async requestOptional<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T | null> {
    if (this.optionalFetchesDisabled) return null;

    try {
      return await this.requestWithRetry(operation, context);
    } catch (error) {
      if (error instanceof GitHubClientError && error.isRateLimit) {
        this.disableOptionalFetches(
          `[GitHub] Optional PR enrichment disabled after rate-limit responses (${context}). Returning core PR data only.`
        );
        return null;
      }

      console.warn(
        `[GitHub] Optional request failed while ${context}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }

  private async requestWithRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: GitHubErrorShape | undefined;

    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (rawError) {
        const error = this.asGitHubError(rawError);
        lastError = error;

        if (!this.isRateLimitError(error)) {
          const message =
            error.response?.data?.message ||
            error.message ||
            `GitHub API error while ${context}`;
          throw new GitHubClientError(message, {
            status: error.status,
            isRateLimit: false,
          });
        }

        const retryAfterSeconds = this.parseRetryAfterSeconds(error);
        if (attempt === MAX_RATE_LIMIT_RETRIES) {
          throw new GitHubClientError(this.buildRateLimitMessage(error), {
            status: error.status,
            retryAfterSeconds,
            isRateLimit: true,
          });
        }

        const fallbackDelayMs = RETRY_BACKOFF_BASE_MS * (attempt + 1);
        const retryDelayMs =
          (retryAfterSeconds ? retryAfterSeconds * 1000 : fallbackDelayMs) +
          Math.floor(Math.random() * 300);

        console.warn(
          `[GitHub] Rate limit while ${context} (attempt ${attempt + 1}/${
            MAX_RATE_LIMIT_RETRIES + 1
          }). Retrying in ${Math.ceil(retryDelayMs / 1000)}s.`
        );

        await this.sleep(retryDelayMs);
      }
    }

    throw new GitHubClientError(
      lastError?.message || `GitHub API error while ${context}`
    );
  }

  private asGitHubError(error: unknown): GitHubErrorShape {
    if (error && typeof error === 'object') {
      return error as GitHubErrorShape;
    }
    return {};
  }

  private getHeaderValue(headers: GitHubHeaders | undefined, key: string): string | undefined {
    if (!headers) return undefined;
    const value = headers[key] ?? headers[key.toLowerCase()];
    if (value === undefined) return undefined;
    return String(value);
  }

  private parseRetryAfterSeconds(error: GitHubErrorShape): number | undefined {
    const headers = error.response?.headers;
    const retryAfterHeader = this.getHeaderValue(headers, 'retry-after');
    if (retryAfterHeader) {
      const parsed = Number.parseInt(retryAfterHeader, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    const resetHeader = this.getHeaderValue(headers, 'x-ratelimit-reset');
    if (resetHeader) {
      const resetAtSeconds = Number.parseInt(resetHeader, 10);
      if (Number.isFinite(resetAtSeconds)) {
        const waitMs = (resetAtSeconds * 1000) - Date.now() + RATE_LIMIT_RESET_BUFFER_MS;
        if (waitMs > 0) {
          return Math.ceil(waitMs / 1000);
        }
      }
    }

    return undefined;
  }

  private isRateLimitError(error: GitHubErrorShape): boolean {
    const status = error.status;
    if (status === 429) return true;
    if (status !== 403) return false;

    const message = (
      error.response?.data?.message ||
      error.message ||
      ''
    ).toLowerCase();

    return message.includes('rate limit') || message.includes('abuse');
  }

  private buildRateLimitMessage(error: GitHubErrorShape): string {
    const baseMessage =
      error.response?.data?.message ||
      error.message ||
      'GitHub API rate limit exceeded.';

    if (this.hasAuthToken) {
      return baseMessage;
    }

    return `${baseMessage} Add a GitHub token in the UI or set GITHUB_TOKEN on the server.`;
  }

  private disableOptionalFetches(reason: string) {
    if (this.optionalFetchesDisabled) return;
    this.optionalFetchesDisabled = true;
    console.warn(reason);
  }

  private async sleep(ms: number) {
    await new Promise(resolve => setTimeout(resolve, ms));
  }
}
