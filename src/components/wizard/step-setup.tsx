'use client';

import { useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useWorkflow } from '@/providers/workflow-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { GoogleSignIn } from '@/components/auth/google-sign-in';
import { OpenRouterKeyInput } from '@/components/auth/openrouter-key';
import { AccountSelector } from '@/components/auth/account-selector';

export function StepSetup() {
  const { authenticated, hasCustomerId, openrouterApiKey } = useAuth();
  const { dispatch } = useWorkflow();
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState('');

  const canProceed = authenticated && hasCustomerId && openrouterApiKey && url.trim();

  const handleNext = () => {
    try {
      const trimmed = url.trim();
      const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      const parsed = new URL(normalized);
      if (!parsed.hostname) {
        throw new Error('Invalid URL');
      }
      setUrlError('');
      dispatch({ type: 'SET_TARGET', url: parsed.toString(), domain: parsed.hostname });
      dispatch({ type: 'SET_STEP', step: 'discover' });
    } catch {
      setUrlError('Enter a valid website URL (for example: example.com).');
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h2 className="text-base font-semibold">Setup</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Connect your accounts and enter the target website.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Google Ads</CardTitle>
          <CardDescription className="text-xs">Sign in to access keyword data and account management.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!authenticated ? (
            <GoogleSignIn />
          ) : !hasCustomerId ? (
            <AccountSelector />
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <span className="text-xs text-muted-foreground">Connected</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">OpenRouter</CardTitle>
          <CardDescription className="text-xs">Required for AI-powered service discovery and keyword enhancement.</CardDescription>
        </CardHeader>
        <CardContent>
          <OpenRouterKeyInput />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Target Website</CardTitle>
          <CardDescription className="text-xs">The website you want to build a Google Ads campaign for.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label className="text-xs">Website URL</Label>
          <Input
            placeholder="example.com"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (urlError) setUrlError('');
            }}
            className="h-8 text-xs"
            onKeyDown={(e) => e.key === 'Enter' && canProceed && handleNext()}
          />
          {urlError && (
            <p className="text-xs text-destructive">{urlError}</p>
          )}
        </CardContent>
      </Card>

      <Button onClick={handleNext} disabled={!canProceed} size="sm" className="h-8">
        Continue
      </Button>
    </div>
  );
}
