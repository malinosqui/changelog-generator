import { NextRequest, NextResponse } from 'next/server';
import { GitHubClient } from '@/lib/github-client';

export async function POST(request: NextRequest) {
  try {
    const { owner, repo, token } = await request.json();

    if (!owner || !repo) {
      return NextResponse.json(
        { error: 'Owner and repo are required' },
        { status: 400 }
      );
    }

    const client = new GitHubClient(token);
    const isValid = await client.validateRepo(owner, repo);

    return NextResponse.json({ valid: isValid });
  } catch (error) {
    console.error('Validation error:', error);
    return NextResponse.json(
      { error: 'Failed to validate repository' },
      { status: 500 }
    );
  }
}

