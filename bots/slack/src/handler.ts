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
        '`/wordle` — start a Wordle game in a thread (@mention me with a 5-letter guess)',
        '`/ttt [@user]` — tic-tac-toe vs a user or the bot',
        '`/remindme set <when> <text>` — schedule a reminder (e.g. `30m`, `2h`, `tomorrow 9am`)',
        '`/remindme list` — list your pending reminders',
        '`/remindme cancel <id>` — cancel a reminder',
        '`/clock set <Continent/City>` — register your timezone',
        '`/clock unset` — remove your timezone',
        '`/clock show` — world clock for everyone in this workspace',
        '`/poll <question>` — yes/no emoji poll (react :white_check_mark: / :x:)',
        '`/poll <question> | opt1 | opt2 | ...` — button poll, one vote each',
        '_Mention me in any channel to echo your message._',
      ].join('\n'),
    };
  }

  return { text: `Echo: ${text}` };
}
