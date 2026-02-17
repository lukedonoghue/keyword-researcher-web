'use client';

import { useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export function OpenRouterKeyInput() {
  const { openrouterApiKey, setOpenrouterApiKey } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [draftKey, setDraftKey] = useState('');
  const hasSavedKey = Boolean(openrouterApiKey);
  const editing = isEditing || !hasSavedKey;

  const save = () => {
    const nextKey = draftKey.trim();
    if (!nextKey) return;
    setOpenrouterApiKey(nextKey);
    setDraftKey('');
    setIsEditing(false);
  };

  const startEditing = () => {
    setDraftKey(openrouterApiKey);
    setIsEditing(true);
  };

  if (!editing && hasSavedKey) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded border border-border px-2 py-1">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
          <span className="text-xs text-muted-foreground font-mono">
            sk-...{openrouterApiKey.slice(-4)}
          </span>
        </div>
        <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={startEditing}>
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">OpenRouter API Key</Label>
      <div className="flex gap-2">
        <Input
          type="password"
          placeholder="sk-or-..."
          value={draftKey}
          onChange={(e) => {
            setDraftKey(e.target.value);
            if (!isEditing) setIsEditing(true);
          }}
          className="h-8 text-xs font-mono"
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <Button size="sm" className="h-8" onClick={save} disabled={!draftKey.trim()}>
          Save
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Get your key from{' '}
        <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline">
          openrouter.ai/keys
        </a>
      </p>
    </div>
  );
}
