'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Copy, FileText, Loader2 } from 'lucide-react';

interface ChangelogOutputProps {
  changelog: string;
  loading: boolean;
}

export default function ChangelogOutput({ changelog, loading }: ChangelogOutputProps) {
  const handleDownload = () => {
    const blob = new Blob([changelog], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `changelog-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(changelog);
      alert('Changelog copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-muted-foreground">Generating your changelog...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!changelog) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center space-y-3">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">Your changelog will appear here</p>
            <Badge variant="outline">Ready to generate</Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 justify-end">
        <Button onClick={handleCopy} variant="outline" size="default">
          <Copy className="mr-2 h-4 w-4" />
          Copy
        </Button>
        <Button onClick={handleDownload} size="default">
          <Download className="mr-2 h-4 w-4" />
          Download .md
        </Button>
      </div>
      <Card>
        <CardContent className="p-6">
          <pre className="whitespace-pre-wrap font-mono text-sm">
            {changelog}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

