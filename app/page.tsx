'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import RepoSelector from '@/components/RepoSelector';
import DateRangePicker from '@/components/DateRangePicker';
import TokenInput from '@/components/TokenInput';
import StyleInput from '@/components/StyleInput';
import ReleaseFilter from '@/components/ReleaseFilter';
import ChangelogOutput from '@/components/ChangelogOutput';
import { Github, Sparkles, AlertCircle, Save, Trash2 } from 'lucide-react';
import { useLocalStorage } from '@/lib/useLocalStorage';

export default function Home() {
  const [repo, setRepo, clearRepo] = useLocalStorage('changelog-repo', '');
  const [token, setToken, clearToken] = useLocalStorage('changelog-token', '');
  const [startDate, setStartDate, clearStartDate] = useLocalStorage('changelog-start-date', '');
  const [endDate, setEndDate, clearEndDate] = useLocalStorage('changelog-end-date', '');
  const [customStyle, setCustomStyle, clearCustomStyle] = useLocalStorage('changelog-custom-style', '');
  const [releaseFilter, setReleaseFilter, clearReleaseFilter] = useLocalStorage<'all' | 'released' | 'unreleased'>('changelog-release-filter', 'all');
  
  const [changelog, setChangelog] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [repoVisibility, setRepoVisibility] = useState<'public' | 'private' | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleClearAll = () => {
    clearRepo();
    clearToken();
    clearStartDate();
    clearEndDate();
    clearCustomStyle();
    clearReleaseFilter();
    setRepoVisibility(null);
    setChangelog('');
    setError('');
    setShowClearConfirm(false);
  };

  const validateRepo = async (): Promise<{ valid: boolean; visibility: 'public' | 'private' | 'not-found' }> => {
    const [owner, repoName] = repo.split('/');
    if (!owner || !repoName) {
      return { valid: false, visibility: 'not-found' };
    }

    try {
      const response = await fetch('/api/github/check-visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo: repoName }),
      });

      const data = await response.json();
      
      if (data.valid && data.visibility) {
        setRepoVisibility(data.visibility === 'private' ? 'private' : 'public');
      } else {
        setRepoVisibility(null);
      }
      
      return { valid: data.valid, visibility: data.visibility };
    } catch (error) {
      console.error('Validation error:', error);
      setRepoVisibility(null);
      return { valid: false, visibility: 'not-found' };
    }
  };

  const handleGenerate = async () => {
    setError('');
    setChangelog('');
    
    const [owner, repoName] = repo.split('/');
    if (!owner || !repoName) {
      setError('Please enter a valid repository (owner/repo)');
      return;
    }

    if (!startDate || !endDate) {
      setError('Please select both start and end dates');
      return;
    }

    setLoading(true);

    try {
      console.log('Fetching pull requests...');
      const pullsResponse = await fetch('/api/github/pulls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner,
          repo: repoName,
          startDate,
          endDate,
          token,
        }),
      });

      if (!pullsResponse.ok) {
        throw new Error('Failed to fetch pull requests');
      }

      const { pullRequests } = await pullsResponse.json();
      console.log(`Found ${pullRequests.length} PRs`);

      let filteredPRs = pullRequests;
      if (releaseFilter === 'released') {
        filteredPRs = pullRequests.filter((pr: any) => pr.release);
        console.log(`Filtered to ${filteredPRs.length} released PRs`);
      } else if (releaseFilter === 'unreleased') {
        filteredPRs = pullRequests.filter((pr: any) => !pr.release);
        console.log(`Filtered to ${filteredPRs.length} unreleased PRs`);
      }

      const mode = customStyle ? 'AI-powered with custom style' : 'AI-powered with default style';
      console.log(`Generating changelog (${mode})...`);

      const changelogResponse = await fetch('/api/changelog/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pullRequests: filteredPRs,
          startDate,
          endDate,
          repoName: repo,
          customStyle: customStyle || undefined,
        }),
      });

      if (!changelogResponse.ok) {
        throw new Error('Failed to generate changelog');
      }

      const { changelog: generatedChangelog } = await changelogResponse.json();
      setChangelog(generatedChangelog);
      
      console.log('✅ Changelog generated successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-3">
              <Github className="h-12 w-12" />
              <h1 className="text-5xl font-bold">
                Changelog Generator
              </h1>
            </div>
            <p className="text-lg text-muted-foreground">
              Generate beautiful, AI-powered changelogs from your GitHub repositories
            </p>
            <div className="flex gap-2 justify-center">
              <Badge variant="secondary">
                <Sparkles className="mr-1 h-3 w-3" />
                AI-Powered
              </Badge>
              <Badge variant="outline">Open Source</Badge>
              <Badge variant="outline">Free</Badge>
            </div>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Configure Your Changelog</CardTitle>
                  <CardDescription>
                    Select a repository, date range, and customization options
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Save className="h-3 w-3" />
                    Auto-saved
                  </Badge>
                  {!showClearConfirm ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowClearConfirm(true)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Clear All
                    </Button>
                  ) : (
                    <div className="flex gap-1">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleClearAll}
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowClearConfirm(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <RepoSelector
                value={repo}
                onChange={setRepo}
                onValidate={validateRepo}
              />

              {repoVisibility === 'private' && (
                <TokenInput value={token} onChange={setToken} />
              )}

              <DateRangePicker
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
              />

              <ReleaseFilter value={releaseFilter} onChange={setReleaseFilter} />

              <StyleInput value={customStyle} onChange={setCustomStyle} />

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive bg-destructive/10 p-4">
                  <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <Button
                onClick={handleGenerate}
                disabled={loading || !repo || !startDate || !endDate}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <Sparkles className="mr-2 h-5 w-5 animate-pulse" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-5 w-5" />
                    Generate Changelog
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Generated Changelog</CardTitle>
              <CardDescription>
                Your changelog will appear here once generated
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChangelogOutput changelog={changelog} loading={loading} />
            </CardContent>
          </Card>
        </div>
      </div>

      <footer className="text-center py-8 text-muted-foreground">
        <p className="text-sm">
          Built with Next.js, TypeScript, Tailwind CSS, and shadcn/ui
        </p>
      </footer>
    </div>
  );
}
