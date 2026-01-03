import { NextRequest, NextResponse } from 'next/server';
import { GitHubClient } from '@/lib/github-client';

export async function POST(request: NextRequest) {
  try {
    const { owner, repo } = await request.json();

    if (!owner || !repo) {
      return NextResponse.json(
        { error: 'Owner and repo are required' },
        { status: 400 }
      );
    }

    const client = new GitHubClient();
    const visibility = await client.checkRepoVisibility(owner, repo);

    return NextResponse.json({ 
      valid: visibility !== 'not-found',
      visibility 
    });
  } catch (error) {
    console.error('Visibility check error:', error);
    return NextResponse.json(
      { error: 'Failed to check repository visibility' },
      { status: 500 }
    );
  }
}

