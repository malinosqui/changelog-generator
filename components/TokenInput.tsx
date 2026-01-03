'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Lock } from 'lucide-react';

interface TokenInputProps {
  value: string;
  onChange: (value: string) => void;
}

export default function TokenInput({ value, onChange }: TokenInputProps) {
  const [showToken, setShowToken] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor="token" className="flex items-center gap-2">
        <Lock className="h-4 w-4" />
        GitHub Token
        <span className="text-xs text-muted-foreground font-normal">
          (Optional - Required for private repositories)
        </span>
      </Label>
      <div className="relative">
        <Input
          id="token"
          type={showToken ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          className="pr-10"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowToken(!showToken)}
          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
        >
          {showToken ? (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Eye className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        🔒 Your token is never stored and only used for API requests.
      </p>
    </div>
  );
}

