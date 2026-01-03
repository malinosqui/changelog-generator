'use client';

import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Package, Clock, LayoutList } from 'lucide-react';

interface ReleaseFilterProps {
  value: 'all' | 'released' | 'unreleased';
  onChange: (value: 'all' | 'released' | 'unreleased') => void;
}

export default function ReleaseFilter({ value, onChange }: ReleaseFilterProps) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <LayoutList className="h-4 w-4" />
        Release Status Filter
      </Label>
      <div className="flex gap-2">
        <Button
          onClick={() => onChange('all')}
          variant={value === 'all' ? 'default' : 'outline'}
          size="default"
          className="flex-1"
        >
          <LayoutList className="mr-2 h-4 w-4" />
          All Changes
        </Button>
        <Button
          onClick={() => onChange('released')}
          variant={value === 'released' ? 'default' : 'outline'}
          size="default"
          className="flex-1"
        >
          <Package className="mr-2 h-4 w-4" />
          Released Only
        </Button>
        <Button
          onClick={() => onChange('unreleased')}
          variant={value === 'unreleased' ? 'default' : 'outline'}
          size="default"
          className="flex-1"
        >
          <Clock className="mr-2 h-4 w-4" />
          Unreleased Only
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Filter changes by their release status
      </p>
    </div>
  );
}

