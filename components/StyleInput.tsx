'use client';

import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, Info, Users, Code, Briefcase, Zap, Heart } from 'lucide-react';

interface StyleInputProps {
  value: string;
  onChange: (value: string) => void;
}

const STYLE_PRESETS = [
  {
    id: 'end-user',
    label: 'End User',
    icon: Users,
    description: 'Non-technical, user-facing changes',
    prompt: 'Write for end users. Focus on features they can see and use. Avoid technical jargon. Explain what changed and why users should care. Use simple language. Group by user impact (high/medium/low).',
  },
  {
    id: 'developer',
    label: 'Developer',
    icon: Code,
    description: 'Technical details for developers',
    prompt: 'Write for developers. Include technical details, API changes, breaking changes, dependencies updates. Mention architecture decisions. Use proper technical terminology. Group by type (API, Infrastructure, Dependencies).',
  },
  {
    id: 'executive',
    label: 'Executive',
    icon: Briefcase,
    description: 'High-level business summary',
    prompt: 'Write executive summary. Focus on business value and impact. Be concise. Highlight major features, improvements, and their benefits. Avoid technical details. Group by business impact.',
  },
  {
    id: 'detailed',
    label: 'Detailed',
    icon: Zap,
    description: 'Comprehensive technical changelog',
    prompt: 'Be extremely detailed. Include everything: what changed, why, how it works, migration steps, breaking changes, performance improvements, test coverage. Add code examples if relevant. List all dependencies and versions.',
  },
  {
    id: 'casual',
    label: 'Casual',
    icon: Heart,
    description: 'Friendly and enthusiastic tone',
    prompt: 'Write in a casual, friendly tone. Use emojis. Be enthusiastic about changes. Make it fun to read. Explain things like talking to a friend. Group creatively. Add personality.',
  },
];

export default function StyleInput({ value, onChange }: StyleInputProps) {
  const handlePresetClick = (prompt: string) => {
    onChange(prompt);
  };

  return (
    <div className="space-y-3">
      <Label htmlFor="style" className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-yellow-500" />
        AI Custom Style
        <Badge variant="secondary" className="ml-2">
          Gemini 2.5 Flash Lite
        </Badge>
        <Badge variant="outline" className="ml-auto">
          Optional
        </Badge>
      </Label>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Quick Presets:</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {STYLE_PRESETS.map((preset) => {
            const Icon = preset.icon;
            const isActive = value === preset.prompt;
            return (
              <Button
                key={preset.id}
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                onClick={() => handlePresetClick(preset.prompt)}
                className="flex flex-col h-auto py-3 px-2"
                title={preset.description}
              >
                <Icon className="h-4 w-4 mb-1" />
                <span className="text-xs">{preset.label}</span>
              </Button>
            );
          })}
        </div>
      </div>

      <Textarea
        id="style"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Choose a preset above or write your own custom style..."
        rows={3}
        className="resize-none"
      />
      
      <div className="flex items-start gap-2 text-xs">
        <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          <p className="text-blue-600 font-medium">
            ✨ AI is always used when available
          </p>
          <p className="text-muted-foreground">
            Leave empty for professional default style, or customize to your preference
          </p>
        </div>
      </div>
    </div>
  );
}

