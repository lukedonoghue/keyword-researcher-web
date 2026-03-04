import axios from 'axios';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatCompletionResult = {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
};

export class OpenRouterService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private timeoutMs: number;

  constructor(apiKey: string, model: string = 'google/gemini-2.0-flash-001') {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = 'https://openrouter.ai/api/v1';
    this.timeoutMs = 60000;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  getModel(): string {
    return this.model;
  }

  setModel(model: string): void {
    this.model = model;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async chatCompletion(messages: ChatMessage[], jsonMode = false): Promise<ChatCompletionResult> {
    let lastError: unknown;
    const attempts = 3;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const body: Record<string, unknown> = { model: this.model, messages };
        const supportsJsonMode = !this.model.startsWith('perplexity/');
        if (jsonMode && supportsJsonMode) body.response_format = { type: 'json_object' };

        const response = await axios.post(
          `${this.baseUrl}/chat/completions`,
          body,
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://keyword-researcher.vercel.app',
              'X-Title': 'Keyword Researcher',
            },
            timeout: this.timeoutMs,
          },
        );

        const data = response.data;
        const choice = data?.choices?.[0];
        const content = choice?.message?.content || '';
        const usage = data?.usage || {};

        return {
          content,
          model: data?.model || this.model,
          usage: {
            promptTokens: usage.prompt_tokens || 0,
            completionTokens: usage.completion_tokens || 0,
            totalTokens: usage.total_tokens || 0,
          },
        };
      } catch (error: unknown) {
        lastError = error;
        const axiosErr = error as { response?: { status?: number; headers?: Record<string, string> } };
        const status = axiosErr?.response?.status;
        const retryAfter = Number(axiosErr?.response?.headers?.['retry-after'] || 0);
        const retriable = !status || status === 429 || status >= 500;

        if (!retriable || attempt === attempts) break;
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : attempt * 2000;
        await this.sleep(waitMs);
      }
    }
    throw lastError;
  }

  async jsonPrompt<T>(systemPrompt: string, userPrompt: string): Promise<{ data: T; usage: ChatCompletionResult['usage'] }> {
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const result = await this.chatCompletion(messages, true);
    let raw = result.content.trim();
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    // Extract JSON object using brace-matching (handles trailing citations/text from Perplexity)
    const start = raw.indexOf('{');
    if (start !== -1) {
      let depth = 0;
      for (let i = start; i < raw.length; i++) {
        if (raw[i] === '{') depth++;
        else if (raw[i] === '}') depth--;
        if (depth === 0) { raw = raw.substring(start, i + 1); break; }
      }
    }

    const parsed = JSON.parse(raw) as T;
    return { data: parsed, usage: result.usage };
  }
}
