import { NextRequest, NextResponse } from 'next/server';
import { ChangelogGenerator } from '@/lib/changelog-generator';
import { PullRequest } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { pullRequests, startDate, endDate, repoName, customStyle } = await request.json();

    if (!pullRequests || !startDate || !endDate || !repoName) {
      return NextResponse.json(
        { error: 'pullRequests, startDate, endDate, and repoName are required' },
        { status: 400 }
      );
    }

    const generator = new ChangelogGenerator();
    const since = new Date(startDate);
    const until = new Date(endDate);

    let changelog: string;
    const hasApiKey = !!process.env.GEMINI_API_KEY;

    if (hasApiKey) {
      const style = customStyle?.trim() || undefined;
      console.log(style ? `🤖 Using AI with custom style: ${style}` : '🤖 Using AI with default professional style');
      
      changelog = await generator.generateWithAI(
        pullRequests as PullRequest[],
        since,
        until,
        repoName,
        style
      );
    } else {
      console.log('📝 Using automatic categorization (no Gemini API key configured)');
      changelog = generator.generateMarkdown(
        pullRequests as PullRequest[],
        since,
        until,
        repoName
      );
    }

    return NextResponse.json({ changelog });
  } catch (error) {
    console.error('Error generating changelog:', error);
    return NextResponse.json(
      { error: 'Failed to generate changelog' },
      { status: 500 }
    );
  }
}

