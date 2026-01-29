import { NextRequest, NextResponse } from 'next/server';
import { GitHubClient } from '@/lib/github-client';
import { ChangelogGenerator } from '@/lib/changelog-generator';
import { PullRequest } from '@/lib/types';
import { checkRateLimit } from '@/lib/rate-limit';

const VALID_STYLES = ['end-user', 'developer', 'executive', 'detailed', 'casual'];
const VALID_FILTERS = ['all', 'released', 'unreleased'];
const VALID_FORMATS = ['markdown', 'json'];

const STYLE_PROMPTS: Record<string, string> = {
  'end-user': 'Write for end users. Focus on user-facing changes, new features they can use, and bugs that were fixed. Avoid technical jargon. Use simple, clear language.',
  'developer': 'Write for developers. Include technical details, API changes, architecture decisions, breaking changes, and migration notes. Be precise and technical.',
  'executive': 'Write a high-level executive summary. Focus on business impact, key metrics, strategic features, and overall progress. Keep it concise and impactful.',
  'detailed': 'Write a comprehensive, detailed changelog. Include code examples, migration guides, configuration changes, and technical deep-dives for each change.',
  'casual': 'Write in a casual, friendly tone. Be enthusiastic about changes, use conversational language and emojis. Make it fun to read while still being informative.',
};

function rateLimitHeaders(rl: { limit: number; remaining: number; resetAt: number }) {
  return {
    'X-RateLimit-Limit': String(rl.limit),
    'X-RateLimit-Remaining': String(rl.remaining),
    'X-RateLimit-Reset': String(Math.ceil(rl.resetAt / 1000)),
  };
}

function parseDate(value: string): Date | null {
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

export async function POST(request: NextRequest) {
  // --- Rate Limit (10 requests per minute per IP) ---
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';

  const rateLimit = checkRateLimit(ip, { limit: 10, windowMs: 60 * 1000 });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again later.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(rateLimit.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetAt / 1000)),
          'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  try {
    const body = await request.json();
    const { owner, repo, startDate, endDate, token, style, filter, format } = body;

    // --- Validation ---
    if (!owner || typeof owner !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid "owner" parameter (string)' },
        { status: 400 }
      );
    }
    if (!repo || typeof repo !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid "repo" parameter (string)' },
        { status: 400 }
      );
    }
    if (!startDate || typeof startDate !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid "startDate" parameter (ISO date string, e.g. "2025-01-01")' },
        { status: 400 }
      );
    }
    if (!endDate || typeof endDate !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid "endDate" parameter (ISO date string, e.g. "2025-01-31")' },
        { status: 400 }
      );
    }

    const since = parseDate(startDate);
    const until = parseDate(endDate);

    if (!since) {
      return NextResponse.json(
        { error: `Invalid "startDate": "${startDate}" is not a valid date` },
        { status: 400 }
      );
    }
    if (!until) {
      return NextResponse.json(
        { error: `Invalid "endDate": "${endDate}" is not a valid date` },
        { status: 400 }
      );
    }
    if (since > until) {
      return NextResponse.json(
        { error: '"startDate" must be before "endDate"' },
        { status: 400 }
      );
    }

    const releaseFilter = filter || 'all';
    if (!VALID_FILTERS.includes(releaseFilter)) {
      return NextResponse.json(
        { error: `Invalid "filter": must be one of ${VALID_FILTERS.join(', ')}` },
        { status: 400 }
      );
    }

    const outputFormat = format || 'markdown';
    if (!VALID_FORMATS.includes(outputFormat)) {
      return NextResponse.json(
        { error: `Invalid "format": must be one of ${VALID_FORMATS.join(', ')}` },
        { status: 400 }
      );
    }

    // Resolve style: preset name -> prompt, or use raw string as custom prompt
    let customStyle: string | undefined;
    if (style) {
      customStyle = STYLE_PROMPTS[style] || style;
    }

    // --- Fetch PRs ---
    const client = new GitHubClient(token);
    let pullRequests: PullRequest[];

    try {
      pullRequests = await client.getPullRequests({ owner, repo, since, until });
    } catch {
      return NextResponse.json(
        { error: `Failed to fetch pull requests from "${owner}/${repo}". Check that the repository exists and the token (if needed) is valid.` },
        { status: 502 }
      );
    }

    // --- Apply release filter ---
    if (releaseFilter === 'released') {
      pullRequests = pullRequests.filter(pr => pr.release);
    } else if (releaseFilter === 'unreleased') {
      pullRequests = pullRequests.filter(pr => !pr.release);
    }

    // --- Generate changelog ---
    const generator = new ChangelogGenerator();
    const repoName = `${owner}/${repo}`;

    let changelog: string;
    if (process.env.GEMINI_API_KEY) {
      changelog = await generator.generateWithAI(pullRequests, since, until, repoName, customStyle);
    } else {
      changelog = generator.generateMarkdown(pullRequests, since, until, repoName);
    }

    // --- Build response ---
    const metadata = {
      repository: repoName,
      period: { start: startDate, end: endDate },
      pullRequestsCount: pullRequests.length,
      filter: releaseFilter,
      style: style || 'default',
      generatedAt: new Date().toISOString(),
    };

    if (outputFormat === 'json') {
      const categories = {
        features: [] as PullRequest[],
        bugFixes: [] as PullRequest[],
        documentation: [] as PullRequest[],
        chores: [] as PullRequest[],
        other: [] as PullRequest[],
      };

      for (const pr of pullRequests) {
        const title = pr.title.toLowerCase();
        const labels = pr.labels.map(l => l.toLowerCase());

        if (labels.includes('feature') || labels.includes('enhancement') || title.startsWith('feat:') || title.startsWith('feature:')) {
          categories.features.push(pr);
        } else if (labels.includes('bug') || labels.includes('fix') || title.startsWith('fix:') || title.startsWith('bugfix:')) {
          categories.bugFixes.push(pr);
        } else if (labels.includes('documentation') || labels.includes('docs') || title.startsWith('docs:')) {
          categories.documentation.push(pr);
        } else if (labels.includes('chore') || labels.includes('maintenance') || title.startsWith('chore:')) {
          categories.chores.push(pr);
        } else {
          categories.other.push(pr);
        }
      }

      return NextResponse.json(
        { changelog: categories, metadata },
        { headers: rateLimitHeaders(rateLimit) }
      );
    }

    return NextResponse.json(
      { changelog, metadata },
      { headers: rateLimitHeaders(rateLimit) }
    );
  } catch (error) {
    console.error('API v1 changelog error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
