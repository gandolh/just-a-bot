import bolt from '@slack/bolt';
import { logger } from '@bots/shared';
import { env } from './env.ts';
import { route } from './handler.ts';

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

app.event('app_mention', async ({ event, say }) => {
  const stripped = event.text.replace(/<@[^>]+>/g, '').trim();
  if (!stripped) return;
  const reply = route(stripped);
  await say({ text: reply.text, thread_ts: event.thread_ts ?? event.ts });
});

app.error(async (err) => {
  log.error('Bolt error', err);
});

await app.start();
log.info('Slack bot connected (Socket Mode)');
