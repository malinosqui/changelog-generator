'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface RepoSelectorProps {
  value: string;
  onChange: (value: string) => void;
  onValidate: () => Promise<{ valid: boolean; visibility: 'public' | 'private' | 'not-found' }>;
}

function parseGitHubUrl(input: string): string {
  const trimmed = input.trim();
  
  const urlPattern = /(?:https?:\/\/)?(?:www\.)?github\.com\/([^\/]+)\/([^\/\s]+)/i;
  const match = trimmed.match(urlPattern);
  
  if (match) {
    const owner = match[1];
    const repo = match[2].replace(/\.git$/, '');
    return `${owner}/${repo}`;
  }
  
  return trimmed;
}

export default function RepoSelector({ value, onChange, onValidate }: RepoSelectorProps) {
  const [validating, setValidating] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [visibility, setVisibility] = useState<'public' | 'private' | 'not-found' | null>(null);

  const handleValidate = async () => {
    setValidating(true);
    try {
      const result = await onValidate();
      setIsValid(result.valid);
      setVisibility(result.visibility);
    } catch (error) {
      setIsValid(false);
      setVisibility('not-found');
    } finally {
      setValidating(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    const parsed = parseGitHubUrl(input);
    onChange(parsed);
    setIsValid(null);
    setVisibility(null);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="repo">Repository</Label>
      <div className="flex gap-2">
        <Input
          id="repo"
          value={value}
          onChange={handleInputChange}
          placeholder="owner/repo or https://github.com/owner/repo"
          className="flex-1"
        />
        <Button
          onClick={handleValidate}
          disabled={validating || !value}
          variant="outline"
          size="default"
        >
          {validating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {validating ? 'Validating...' : 'Validate'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        💡 You can paste the full GitHub URL or just owner/repo
      </p>
      {isValid === true && visibility === 'public' && (
        <Badge variant="default" className="bg-green-500">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Public repository - No token needed
        </Badge>
      )}
      {isValid === true && visibility === 'private' && (
        <Badge variant="default" className="bg-blue-500">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Private repository - Token required
        </Badge>
      )}
      {isValid === false && (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" />
          Repository not found or invalid
        </Badge>
      )}
    </div>
  );
}

