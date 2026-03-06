'use client';

import { useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const MODEL_OPTIONS = [
  {
    value: 'google/gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    description: 'Fastest default',
  },
  {
    value: 'google/gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    description: 'Slower, stronger reasoning',
  },
] as const;

export function OpenRouterKeyInput() {
  const { openrouterApiKey, setOpenrouterApiKey, openrouterModel, setOpenrouterModel } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [draftKey, setDraftKey] = useState('');
  const hasSavedKey = Boolean(openrouterApiKey);
  const editing = isEditing || !hasSavedKey;
  const selectedModel = MODEL_OPTIONS.find((option) => option.value === openrouterModel) ?? MODEL_OPTIONS[0];

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
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded border border-border px-2 py-1">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
          <span className="text-xs text-muted-foreground font-mono">
            sk-...{openrouterApiKey.slice(-4)}
          </span>
        </div>
        <div className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground">
          {selectedModel.label}
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
      <div className="space-y-1">
        <Label className="text-xs">Gemini Model</Label>
        <Select value={openrouterModel} onValueChange={setOpenrouterModel}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODEL_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label} - {option.description}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Gemini 3 Flash is the default for speed. You can switch to Gemini 3.1 Pro when you want deeper reasoning. Get your key from{' '}
        <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline">
          openrouter.ai/keys
        </a>
      </p>
    </div>
  );
}
