import { NextRequest, NextResponse } from 'next/server';
import { GitHubClient } from '@/lib/github-client';

export async function POST(request: NextRequest) {
  try {
    const { owner, repo, startDate, endDate, token } = await request.json();

    if (!owner || !repo || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Owner, repo, startDate, and endDate are required' },
        { status: 400 }
      );
    }

    const client = new GitHubClient(token);
    const since = new Date(startDate);
    const until = new Date(endDate);

    const pullRequests = await client.getPullRequests({
      owner,
      repo,
      since,
      until,
    });

    return NextResponse.json({ pullRequests });
  } catch (error) {
    console.error('Error fetching pull requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pull requests' },
      { status: 500 }
    );
  }
}

