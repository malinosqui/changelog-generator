import { PullRequest, ChangelogCategory } from './types';
import { format } from 'date-fns';
import { GoogleGenAI } from '@google/genai';

export class ChangelogGenerator {
  private categorize(pullRequests: PullRequest[]): ChangelogCategory {
    const categories: ChangelogCategory = {
      features: [],
      bugFixes: [],
      documentation: [],
      chores: [],
      other: [],
    };

    for (const pr of pullRequests) {
      const category = this.detectCategory(pr);
      categories[category].push(pr);
    }

    return categories;
  }

  private detectCategory(pr: PullRequest): keyof ChangelogCategory {
    const title = pr.title.toLowerCase();
    const labels = pr.labels.map((l) => l.toLowerCase());

    if (
      labels.includes('feature') ||
      labels.includes('enhancement') ||
      title.startsWith('feat:') ||
      title.startsWith('feature:')
    ) {
      return 'features';
    }

    if (
      labels.includes('bug') ||
      labels.includes('fix') ||
      title.startsWith('fix:') ||
      title.startsWith('bugfix:')
    ) {
      return 'bugFixes';
    }

    if (
      labels.includes('documentation') ||
      labels.includes('docs') ||
      title.startsWith('docs:')
    ) {
      return 'documentation';
    }

    if (
      labels.includes('chore') ||
      labels.includes('maintenance') ||
      title.startsWith('chore:')
    ) {
      return 'chores';
    }

    return 'other';
  }

  public generateMarkdown(
    pullRequests: PullRequest[],
    startDate: Date,
    endDate: Date,
    repoName: string
  ): string {
    const categories = this.categorize(pullRequests);
    
    const sortedPrs = pullRequests.sort((a, b) => 
      new Date(b.merged_at).getTime() - new Date(a.merged_at).getTime()
    );

    let markdown = `# Changelog - ${repoName}\n\n`;
    markdown += `## ${format(startDate, 'yyyy-MM-dd')} - ${format(endDate, 'yyyy-MM-dd')}\n\n`;

    if (categories.features.length > 0) {
      markdown += `### ✨ Features\n\n`;
      markdown += this.formatPRs(categories.features);
    }

    if (categories.bugFixes.length > 0) {
      markdown += `### 🐛 Bug Fixes\n\n`;
      markdown += this.formatPRs(categories.bugFixes);
    }

    if (categories.documentation.length > 0) {
      markdown += `### 📚 Documentation\n\n`;
      markdown += this.formatPRs(categories.documentation);
    }

    if (categories.chores.length > 0) {
      markdown += `### 🔧 Chores\n\n`;
      markdown += this.formatPRs(categories.chores);
    }

    if (categories.other.length > 0) {
      markdown += `### 📦 Other Changes\n\n`;
      markdown += this.formatPRs(categories.other);
    }

    if (sortedPrs.length === 0) {
      markdown += `_No merged pull requests found in this period._\n`;
    }

    return markdown;
  }

  private formatPRs(prs: PullRequest[]): string {
    let output = '';

    const sorted = prs.sort((a, b) => 
      new Date(b.merged_at).getTime() - new Date(a.merged_at).getTime()
    );

    for (const pr of sorted) {
      const releaseTag = pr.release ? ` 📦 *Released in ${pr.release}*` : ' ⏳ *Not yet released*';
      output += `- **[#${pr.number}](${pr.html_url})** ${pr.title} (@${pr.author})${releaseTag}\n`;
      
      if (pr.body && pr.body.trim().length > 0) {
        const bodyPreview = pr.body
          .split('\n')
          .filter(line => line.trim().length > 0)
          .slice(0, 3)
          .join(' ')
          .substring(0, 200);
        
        if (bodyPreview.length > 0) {
          output += `  ${bodyPreview}${bodyPreview.length === 200 ? '...' : ''}\n`;
        }
      }
      
      if (pr.issues.length > 0) {
        for (const issue of pr.issues) {
          output += `  - Closes [#${issue.number}](${issue.html_url}): ${issue.title}\n`;
        }
      }
      
      output += '\n';
    }

    output += '\n';
    return output;
  }

  public async generateWithAI(
    pullRequests: PullRequest[],
    startDate: Date,
    endDate: Date,
    repoName: string,
    customStyle?: string
  ): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.warn('GEMINI_API_KEY not found, falling back to basic generation');
      return this.generateMarkdown(pullRequests, startDate, endDate, repoName);
    }

    const ai = new GoogleGenAI({ apiKey });

    const prSummaries = pullRequests.map(pr => ({
      number: pr.number,
      title: pr.title,
      description: pr.body,
      author: pr.author,
      merged_at: pr.merged_at,
      labels: pr.labels,
      issues: pr.issues.map(issue => `#${issue.number}: ${issue.title}`),
      url: pr.html_url,
      released_in: pr.release || 'Not yet released',
    }));

    const defaultStyle = `Write a professional, detailed changelog like you'd see on GitHub releases or in a SaaS product. 
Be clear and informative. Extract real details from PR descriptions. 
Group by category (Features, Fixes, Improvements, etc.). 
Write descriptions that users can understand. Focus on WHAT changed and WHY it matters.`;

    const stylePreference = customStyle || defaultStyle;

    const prompt = `You are a professional technical writer creating a detailed, informative changelog for "${repoName}".

Here are the merged pull requests between ${format(startDate, 'yyyy-MM-dd')} and ${format(endDate, 'yyyy-MM-dd')}:

${JSON.stringify(prSummaries, null, 2)}

Style: "${stylePreference}"

Create a DETAILED, professional changelog that:
1. Has a clear title with repo name and date range
2. Groups changes by category (Features, Bug Fixes, Improvements, etc.)
3. For EACH change, write a clear description of WHAT was implemented/changed and WHY it matters
4. Use the PR description/body to extract details - don't just repeat the title
5. Include PR numbers as links: [#123](url)
6. Mention authors when relevant
7. If there are related issues, reference them
8. Follow the user's style preference while being informative
9. Make it read like a real product changelog - users should understand what changed

IMPORTANT: 
- Don't just list PR titles - explain what was actually done
- Extract key information from the PR descriptions
- Write clear, user-friendly descriptions
- If a PR title is vague (like "Fix CI/CD"), use the description to explain what was fixed
- Include release information: mention which version each change was released in (check the "released_in" field)
- Mark changes that haven't been released yet

Return ONLY the markdown changelog, no extra text.`;

    try {
      const model = 'gemini-flash-lite-latest';
      const contents = [
        {
          role: 'user',
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ];

      const config = {
        thinkingConfig: {
          thinkingBudget: 0,
        },
      };

      const response = await ai.models.generateContentStream({
        model,
        config,
        contents,
      });

      let changelog = '';
      for await (const chunk of response) {
        changelog += chunk.text;
      }
      
      if (!changelog || changelog.trim().length === 0) {
        console.warn('Gemini returned empty response, falling back to basic generation');
        return this.generateMarkdown(pullRequests, startDate, endDate, repoName);
      }

      return changelog.trim();
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      return this.generateMarkdown(pullRequests, startDate, endDate, repoName);
    }
  }
}

