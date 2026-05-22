import { env } from '../env.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}

interface OllamaChatResponse {
  message?: { role: string; content: string };
  error?: string;
}

export class OllamaError extends Error {}

export async function chat({ model, messages, signal }: ChatOptions): Promise<string> {
  if (!env.OLLAMA_API_KEY) {
    throw new OllamaError('OLLAMA_API_KEY is not configured.');
  }

  const url = `${env.OLLAMA_HOST.replace(/\/$/, '')}/api/chat`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.OLLAMA_API_KEY}`,
    },
    body: JSON.stringify({
      model: model ?? env.OLLAMA_MODEL,
      messages,
      stream: false,
    }),
    signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new OllamaError(`Ollama returned ${res.status}: ${detail.slice(0, 300) || res.statusText}`);
  }

  const data = (await res.json()) as OllamaChatResponse;
  if (data.error) throw new OllamaError(data.error);
  const content = data.message?.content?.trim();
  if (!content) throw new OllamaError('Ollama returned an empty response.');
  return content;
}
