# GitHub Changelog Generator

A beautiful web application to generate changelogs from GitHub repositories based on merged pull requests.

## Features

- 🎯 Select any GitHub repository (public or private)
- 📅 Choose date range for changelog generation
- 🔐 Support for private repositories with GitHub tokens
- 🎨 Automatic PR categorization (Features, Bug Fixes, Documentation, etc.)
- 🤖 **AI-powered custom changelog generation** using Google Gemini 2.0 Flash Lite
- 📝 Describe your preferred style and let AI format the changelog
- 💾 Download changelog as Markdown file
- 📋 Copy to clipboard functionality

## Getting Started

### Prerequisites

- Node.js 18+ installed
- A GitHub account

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd changelog-generator
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file:
```bash
cp .env.example .env.local
# Edit .env.local and add your keys
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. **Enter Repository**: Type the repository in `owner/repo` format (e.g., `facebook/react`)
2. **Add Token** (recommended): Add your GitHub Personal Access Token to avoid API rate limits (required for private repos)
3. **Select Dates**: Choose the start and end dates for your changelog
4. **AI Custom Style** (optional): Describe how you want the AI to format your changelog (e.g., "Use emojis, be enthusiastic, group by impact")
5. **Generate**: Click "Generate Changelog" and wait for the results
6. **Download/Copy**: Use the buttons to download as `.md` or copy to clipboard

## AI-Powered Customization

When you provide a custom style description, the app uses **Google Gemini 2.0 Flash Lite** to generate a personalized changelog that matches your preferences. Examples:

- "Use lots of emojis and be enthusiastic about each change"
- "Group by impact level (high/medium/low) instead of type"
- "Write in a casual, friendly tone with jokes"
- "Focus on user-facing changes only"
- "Include technical details and architectural decisions"

Without a custom style, it generates a clean, categorized changelog automatically.

## Gemini API Key

To use AI-powered custom changelog generation:

1. Get an API key from [Google AI Studio](https://aistudio.google.com/apikey)
2. Add it to your `.env.local` file:
```bash
GEMINI_API_KEY=your_api_key_here
```

**Note**: Without an API key, the app will still work but will use the standard automatic categorization instead of AI customization.

**Why Gemini 2.0 Flash Lite?**
- ⚡ Faster than GPT-4o-mini
- 💰 More affordable (free tier available)
- 🚀 High quality output
- 🌍 Free API with generous limits

## GitHub Token

To access private repositories or increase rate limits:

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate a new token with `repo` scope
3. Paste it in the Token field, or configure `GITHUB_TOKEN` on the server

**Note**: The app can store the token in browser local storage for convenience. In production, prefer setting `GITHUB_TOKEN` in server environment variables.

## Deployment on Railway

### Quick Deploy

1. Push your code to GitHub
2. Go to [Railway](https://railway.app)
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Railway will automatically detect Next.js and deploy

### Environment Variables

Add these in Railway dashboard:

- `GEMINI_API_KEY`: **Required** - Your Google Gemini API key for AI-powered changelog generation
- `GITHUB_TOKEN`: **Recommended** - GitHub token used as server fallback to avoid unauthenticated rate limits
- `NODE_ENV`: Set to `production` (optional)

### Build Settings

Railway automatically detects Next.js with these defaults:
- **Build Command**: `npm run build`
- **Start Command**: `npm start`
- **Port**: 3000 (automatically proxied)

## Tech Stack

- **Frontend**: Next.js 14+ with App Router
- **Styling**: Tailwind CSS
- **Language**: TypeScript
- **GitHub API**: Octokit
- **Date Handling**: date-fns
- **Deployment**: Railway

## Project Structure

```
changelog-generator/
├── app/
│   ├── api/
│   │   ├── github/
│   │   │   ├── validate/route.ts
│   │   │   └── pulls/route.ts
│   │   └── changelog/
│   │       └── generate/route.ts
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── RepoSelector.tsx
│   ├── DateRangePicker.tsx
│   ├── TokenInput.tsx
│   ├── StyleInput.tsx
│   └── ChangelogOutput.tsx
├── lib/
│   ├── github-client.ts
│   ├── changelog-generator.ts
│   └── types.ts
├── package.json
├── tsconfig.json
└── README.md
```

## API Routes

### `POST /api/github/validate`
Validates if a repository exists and is accessible.

**Request:**
```json
{
  "owner": "facebook",
  "repo": "react",
  "token": "ghp_..." // optional
}
```

### `POST /api/github/pulls`
Fetches merged pull requests within a date range.

**Request:**
```json
{
  "owner": "facebook",
  "repo": "react",
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "token": "ghp_..." // optional
}
```

### `POST /api/changelog/generate`
Generates a formatted changelog from pull requests.

**Request:**
```json
{
  "pullRequests": [...],
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "repoName": "facebook/react",
  "customStyle": "..." // optional
}
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Author

Built with ❤️ using Next.js and TypeScript
