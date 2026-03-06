'use client';

import { useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useWorkflow } from '@/providers/workflow-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { GoogleSignIn } from '@/components/auth/google-sign-in';
import { OpenRouterKeyInput } from '@/components/auth/openrouter-key';
import { AccountSelector } from '@/components/auth/account-selector';
import { Check, Globe, Key, HelpCircle } from 'lucide-react';

export function StepSetup() {
  const { authenticated, hasCustomerId, openrouterApiKey } = useAuth();
  const { dispatch } = useWorkflow();
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState('');

  const canProceed = authenticated && hasCustomerId && openrouterApiKey && url.trim();

  const googleAdsReady = authenticated && hasCustomerId;
  const aiKeyReady = !!openrouterApiKey;
  const urlReady = !!url.trim();
  const completedCount = [googleAdsReady, aiKeyReady, urlReady].filter(Boolean).length;

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
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-base font-semibold">Setup</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Complete the checklist below to get started.
        </p>
      </div>

      <Card>
        <CardContent className="divide-y">
          {/* Step 1 — Connect Google Ads */}
          <div className="py-4 first:pt-5">
            <div className="flex items-start gap-3">
              <StepNumber number={1} done={googleAdsReady} />
              <div className="flex-1 min-w-0 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">Connect Google Ads</span>
                </div>
                {!authenticated ? (
                  <GoogleSignIn />
                ) : !hasCustomerId ? (
                  <AccountSelector />
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-xs text-muted-foreground">Connected</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Step 2 — Add AI Research Key */}
          <div className="py-4">
            <div className="flex items-start gap-3">
              <StepNumber number={2} done={aiKeyReady} />
              <div className="flex-1 min-w-0 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Key className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">Add AI Research Key</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-56">
                      Powered by OpenRouter — used for AI-driven service discovery and keyword enhancement.
                    </TooltipContent>
                  </Tooltip>
                </div>
                {aiKeyReady ? (
                  <div className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-xs text-muted-foreground">Key saved</span>
                  </div>
                ) : (
                  <OpenRouterKeyInput />
                )}
              </div>
            </div>
          </div>

          {/* Step 3 — Enter Target Website */}
          <div className="py-4 last:pb-5">
            <div className="flex items-start gap-3">
              <StepNumber number={3} done={urlReady} />
              <div className="flex-1 min-w-0 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">Enter Target Website</span>
                </div>
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
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Completion summary */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-300"
              style={{ width: `${(completedCount / 3) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {completedCount} of 3 ready
          </span>
        </div>
        {completedCount === 3 && (
          <p className="text-xs font-medium text-green-600">
            All set — let&apos;s go!
          </p>
        )}
      </div>

      {/* Continue button */}
      <div className="space-y-1.5">
        <Button variant="brand" onClick={handleNext} disabled={!canProceed} size="sm" className="h-8">
          Continue
        </Button>
        {!canProceed && (
          <p className="text-xs text-muted-foreground">
            Complete all steps above to continue
          </p>
        )}
      </div>
    </div>
  );
}

/** Numbered circle that turns into a green checkmark when done. */
function StepNumber({ number, done }: { number: number; done: boolean }) {
  if (done) {
    return (
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-green-600 mt-0.5">
        <Check className="h-3.5 w-3.5" />
      </div>
    );
  }
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-medium text-muted-foreground mt-0.5">
      {number}
    </div>
  );
}
