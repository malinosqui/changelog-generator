import { Octokit } from '@octokit/rest';
import { PullRequest, Issue, Contributor } from './types';

export class GitHubClient {
  private octokit: Octokit;

  constructor(token?: string) {
    this.octokit = new Octokit({
      auth: token,
    });
  }

  async validateRepo(owner: string, repo: string): Promise<boolean> {
    try {
      await this.octokit.repos.get({ owner, repo });
      return true;
    } catch (error) {
      return false;
    }
  }

  async checkRepoVisibility(owner: string, repo: string): Promise<'public' | 'private' | 'not-found'> {
    try {
      const { data } = await this.octokit.repos.get({ owner, repo });
      return data.private ? 'private' : 'public';
    } catch (error: any) {
      if (error.status === 404) {
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
        const { data } = await this.octokit.pulls.list({
          owner,
          repo,
          state: 'closed',
          sort: 'updated',
          direction: 'desc',
          per_page: perPage,
          page,
        });

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
            
            if (!body || body.trim().length === 0) {
              try {
                const commits = await this.octokit.pulls.listCommits({
                  owner,
                  repo,
                  pull_number: pr.number,
                  per_page: 10,
                });
                
                const commitMessages = commits.data
                  .map(c => c.commit.message)
                  .filter(msg => msg && !msg.startsWith('Merge'))
                  .slice(0, 5);
                
                if (commitMessages.length > 0) {
                  body = commitMessages.join('\n');
                }
              } catch (err) {
                console.warn(`Could not fetch commits for PR #${pr.number}`);
              }
            }
            
            const release = this.findReleaseForPR(pr, releases);
            const contributors = await this.getContributorsForPR(owner, repo, pr);

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
      throw new Error('Failed to fetch pull requests from GitHub');
    }
  }

  private async getReleases(owner: string, repo: string, since: Date, until: Date) {
    try {
      const { data } = await this.octokit.repos.listReleases({
        owner,
        repo,
        per_page: 100,
      });

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

  private findReleaseForPR(pr: any, releases: any[]): string | undefined {
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
    pr: any
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

    // Reviewers
    try {
      const { data: reviews } = await this.octokit.pulls.listReviews({
        owner,
        repo,
        pull_number: pr.number,
      });

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
    } catch (err) {
      console.warn(`Could not fetch reviews for PR #${pr.number}`);
    }

    // Committers (unique commit authors that differ from the PR author)
    try {
      const { data: commits } = await this.octokit.pulls.listCommits({
        owner,
        repo,
        pull_number: pr.number,
        per_page: 100,
      });

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
    } catch (err) {
      console.warn(`Could not fetch commits for PR #${pr.number}`);
    }

    return Array.from(seen.values());
  }

  private async getIssuesForPR(
    owner: string,
    repo: string,
    prNumber: number,
    prBody: string
  ): Promise<Issue[]> {
    const issues: Issue[] = [];
    const issueReferences = this.extractIssueReferences(prBody);

    for (const issueNumber of issueReferences) {
      try {
        const { data } = await this.octokit.issues.get({
          owner,
          repo,
          issue_number: issueNumber,
        });

        issues.push({
          number: data.number,
          title: data.title,
          html_url: data.html_url,
        });
      } catch (error) {
        console.warn(`Could not fetch issue #${issueNumber}`);
      }
    }

    return issues;
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
}

