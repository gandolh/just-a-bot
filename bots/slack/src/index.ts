import bolt from '@slack/bolt';
import { logger } from '@bots/shared';
import { env } from './env.ts';
import { route } from './handler.ts';
import {
  handleWordleGuess,
  hasWordleGame,
  startWordle,
} from './wordle/slack.ts';
import {
  applyMatchMove,
  createMatch,
  registerMatch,
} from './tictactoe/slack.ts';
import {
  addReminder,
  cancelReminder,
  listReminders,
} from './reminders/store.ts';
import { parseWhen } from './reminders/parse.ts';
import { tickReminders } from './reminders/tick.ts';
import {
  getTeamTimezones,
  removeTimezone,
  setTimezone,
} from './clock/store.ts';
import { formatLocalTime, getUtcOffsetMinutes, isValidTimezone } from './clock/format.ts';
import {
  createPoll,
  parsePollInput,
  registerPoll,
  vote,
  yesNoText,
  YESNO_REACTIONS,
} from './polls/slack.ts';

const { App } = bolt;
const log = logger.scoped('slack');

const app = new App({
  token: env.SLACK_BOT_TOKEN,
  appToken: env.SLACK_APP_TOKEN,
  signingSecret: env.SLACK_SIGNING_SECRET,
  socketMode: true,
});

app.command('/ping', async ({ ack, respond }) => {
  await ack();
  await respond({ text: route('ping').text, response_type: 'ephemeral' });
});

app.command('/help', async ({ ack, respond }) => {
  await ack();
  await respond({ text: route('help').text, response_type: 'ephemeral' });
});

app.command('/wordle', async ({ ack, command, client, respond }) => {
  await ack();
  try {
    await startWordle({ client, channelId: command.channel_id, userId: command.user_id });
  } catch (err) {
    log.error('wordle start failed', err);
    await respond({
      response_type: 'ephemeral',
      text: "Couldn't start Wordle here — make sure I'm a member of this channel.",
    });
  }
});

app.command('/ttt', async ({ ack, command, client, respond }) => {
  await ack();
  const opponentMatch = command.text.trim().match(/^<@([UW][A-Z0-9]+)(?:\|[^>]+)?>$/);
  let opponentId: string | null = null;
  if (opponentMatch) {
    opponentId = opponentMatch[1];
    if (opponentId === command.user_id) {
      await respond({ response_type: 'ephemeral', text: "You can't play against yourself." });
      return;
    }
  } else if (command.text.trim() && command.text.trim() !== 'bot') {
    await respond({
      response_type: 'ephemeral',
      text: 'Usage: `/ttt` (vs bot) or `/ttt @user`',
    });
    return;
  }

  const { match, view } = createMatch({ challengerId: command.user_id, opponentId });
  try {
    const posted = await client.chat.postMessage({
      channel: command.channel_id,
      text: view.text,
      blocks: view.blocks,
    });
    if (posted.ts) registerMatch(posted.ts, match);
  } catch (err) {
    log.error('ttt post failed', err);
    await respond({
      response_type: 'ephemeral',
      text: "Couldn't start the game here — make sure I'm a member of this channel.",
    });
  }
});

app.action(/^ttt:\d$/, async ({ ack, action, body, client }) => {
  await ack();
  if (body.type !== 'block_actions' || !body.message?.ts || !body.channel?.id) return;
  const cell = parseInt((action as { value: string }).value, 10);
  const outcome = applyMatchMove({
    messageTs: body.message.ts,
    cell,
    userId: body.user.id,
  });

  if (outcome.kind === 'ok') {
    await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      text: outcome.view.text,
      blocks: outcome.view.blocks,
    });
    return;
  }

  const messages: Record<Exclude<typeof outcome.kind, 'ok'>, string> = {
    expired: 'This game has expired.',
    finished: 'Game already finished.',
    'wrong-turn': 'Not your turn.',
    'bot-thinking': 'Waiting on the bot — try again.',
    invalid: 'Invalid move.',
  };
  await client.chat.postEphemeral({
    channel: body.channel.id,
    user: body.user.id,
    text: messages[outcome.kind],
  });
});

// Swallow disabled-button clicks so Slack doesn't show "didn't work" warnings.
app.action(/^ttt_disabled:/, async ({ ack }) => {
  await ack();
});

app.command('/remindme', async ({ ack, command, respond }) => {
  await ack();
  const parts = command.text.trim().split(/\s+/);
  const sub = parts[0] ?? '';

  if (sub === 'list') {
    const reminders = await listReminders(command.user_id, command.team_id);
    if (reminders.length === 0) {
      await respond({ response_type: 'ephemeral', text: 'You have no pending reminders.' });
      return;
    }
    const lines = reminders.map(
      (r) => `\`${r.id}\` — <!date^${Math.floor(new Date(r.dueAt).getTime() / 1000)}^{date_short_pretty} {time}|${r.dueAt}> — ${r.text}`,
    );
    await respond({ response_type: 'ephemeral', text: lines.join('\n') });
    return;
  }

  if (sub === 'cancel') {
    const id = parts[1];
    if (!id) {
      await respond({ response_type: 'ephemeral', text: 'Usage: `/remindme cancel <id>`' });
      return;
    }
    const ok = await cancelReminder(id, command.user_id);
    await respond({
      response_type: 'ephemeral',
      text: ok ? `Reminder \`${id}\` cancelled.` : `No reminder with ID \`${id}\` found.`,
    });
    return;
  }

  // Default: `set <when> <text>` — accept `set` prefix or none.
  const args = sub === 'set' ? parts.slice(1) : parts;
  if (args.length < 2) {
    await respond({
      response_type: 'ephemeral',
      text: 'Usage: `/remindme [set] <when> <text>` — e.g. `/remindme 30m grab coffee`',
    });
    return;
  }
  // First token (or first two if e.g. "tomorrow 9am") is the time spec.
  let whenRaw: string;
  let text: string;
  const twoToken = args.slice(0, 2).join(' ');
  if (parseWhen(twoToken)) {
    whenRaw = twoToken;
    text = args.slice(2).join(' ');
  } else {
    whenRaw = args[0];
    text = args.slice(1).join(' ');
  }
  if (!text) {
    await respond({ response_type: 'ephemeral', text: 'Reminder text is empty.' });
    return;
  }
  const dueAt = parseWhen(whenRaw);
  if (!dueAt) {
    await respond({
      response_type: 'ephemeral',
      text: 'Could not parse that time. Try `30m`, `2h`, `3d`, `tomorrow 9am`, or `2026-06-01 15:00`.',
    });
    return;
  }
  if (dueAt <= new Date()) {
    await respond({ response_type: 'ephemeral', text: 'That time is in the past.' });
    return;
  }
  const id = crypto.randomUUID().slice(0, 8);
  await addReminder({
    id,
    userId: command.user_id,
    teamId: command.team_id,
    channelId: command.channel_id,
    dueAt: dueAt.toISOString(),
    text,
    createdAt: new Date().toISOString(),
  });
  const unix = Math.floor(dueAt.getTime() / 1000);
  await respond({
    response_type: 'ephemeral',
    text: `Reminder set! ID: \`${id}\` — I'll ping you <!date^${unix}^{date_short_pretty} at {time}|${dueAt.toISOString()}>.`,
  });
});

app.command('/clock', async ({ ack, command, respond }) => {
  await ack();
  const parts = command.text.trim().split(/\s+/);
  const sub = parts[0] ?? 'show';

  if (sub === 'set') {
    const tz = parts.slice(1).join(' ');
    if (!tz) {
      await respond({ response_type: 'ephemeral', text: 'Usage: `/clock set <Continent/City>`' });
      return;
    }
    if (!isValidTimezone(tz)) {
      await respond({
        response_type: 'ephemeral',
        text: `Unknown timezone *${tz}*. Use a valid IANA name like \`America/New_York\` or \`Europe/Bucharest\`.`,
      });
      return;
    }
    await setTimezone(command.team_id, command.user_id, tz);
    await respond({
      response_type: 'ephemeral',
      text: `Your timezone has been set to *${tz}*. Current time: ${formatLocalTime(tz)}`,
    });
    return;
  }

  if (sub === 'unset') {
    await removeTimezone(command.team_id, command.user_id);
    await respond({ response_type: 'ephemeral', text: 'Your timezone has been removed.' });
    return;
  }

  // show (default)
  const all = await getTeamTimezones(command.team_id);
  const entries = Object.entries(all);
  if (entries.length === 0) {
    await respond({
      response_type: 'ephemeral',
      text: 'No one in this workspace has set a timezone. Try `/clock set <Continent/City>`.',
    });
    return;
  }
  entries.sort((a, b) => getUtcOffsetMinutes(a[1]) - getUtcOffsetMinutes(b[1]));
  const lines = entries.map(([userId, tz]) => `*<@${userId}>* (${tz}) — ${formatLocalTime(tz)}`);
  await respond({
    response_type: 'in_channel',
    text: [':clock1: *World Clock*', ...lines].join('\n'),
  });
});

app.command('/poll', async ({ ack, command, client, respond }) => {
  await ack();
  const parsed = parsePollInput(command.text);
  if ('error' in parsed) {
    await respond({ response_type: 'ephemeral', text: parsed.error });
    return;
  }

  try {
    if (parsed.kind === 'yesno') {
      const posted = await client.chat.postMessage({
        channel: command.channel_id,
        text: yesNoText(parsed.question, command.user_id),
      });
      if (posted.ts) {
        for (const name of YESNO_REACTIONS) {
          await client.reactions
            .add({ channel: command.channel_id, timestamp: posted.ts, name })
            .catch((err) => log.warn(`failed to add :${name}: reaction`, err));
        }
      }
      return;
    }

    const view = createPoll(parsed.question, parsed.options!, command.user_id);
    const posted = await client.chat.postMessage({
      channel: command.channel_id,
      text: view.text,
      blocks: view.blocks,
    });
    if (posted.ts) registerPoll(posted.ts, parsed.question, parsed.options!, command.user_id);
  } catch (err) {
    log.error('poll post failed', err);
    await respond({
      response_type: 'ephemeral',
      text: "Couldn't post the poll here — make sure I'm a member of this channel.",
    });
  }
});

app.action(/^poll_vote:\d+$/, async ({ ack, action, body, client }) => {
  await ack();
  if (body.type !== 'block_actions' || !body.message?.ts || !body.channel?.id) return;
  const idx = parseInt((action as { value: string }).value, 10);
  const view = vote(body.message.ts, body.user.id, idx);
  if (!view) {
    await client.chat.postEphemeral({
      channel: body.channel.id,
      user: body.user.id,
      text: 'This poll has expired.',
    });
    return;
  }
  await client.chat.update({
    channel: body.channel.id,
    ts: body.message.ts,
    text: view.text,
    blocks: view.blocks,
  });
});

app.event('app_mention', async ({ event, client, say }) => {
  const stripped = event.text.replace(/<@[^>]+>/g, '').trim();

  if (event.thread_ts && hasWordleGame(event.channel, event.thread_ts)) {
    await handleWordleGuess({
      client,
      channelId: event.channel,
      threadTs: event.thread_ts,
      userId: event.user ?? 'unknown',
      text: stripped,
    });
    return;
  }

  if (!stripped) return;
  const reply = route(stripped);
  await say({ text: reply.text, thread_ts: event.thread_ts ?? event.ts });
});

app.error(async (err) => {
  log.error('Bolt error', err);
});

const REMINDER_TICK_MS = 30_000;
setInterval(() => {
  tickReminders(app.client).catch((err) => log.error('reminder tick failed', err));
}, REMINDER_TICK_MS);

await app.start();
log.info('Slack bot connected (Socket Mode)');
