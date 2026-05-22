export interface RouteResult {
  text: string;
}

export function route(input: string): RouteResult {
  const text = input.trim();
  const lower = text.toLowerCase();

  if (lower === 'ping' || lower === '/ping') {
    return { text: 'pong' };
  }

  if (lower === 'help' || lower === '/help') {
    return {
      text: [
        '*Available commands:*',
        '`/ping` — health check',
        '`/help` — this message',
        '_Mention me in any channel to echo your message._',
      ].join('\n'),
    };
  }

  return { text: `Echo: ${text}` };
}
