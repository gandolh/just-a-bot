# `/poll` — polls

Two flavors picked by syntax:

| Form | What you get |
| --- | --- |
| `/poll <question>` | Yes/no emoji poll — the bot posts the question and adds `:white_check_mark:` and `:x:` reactions. Slack itself tallies. |
| `/poll <question> \| opt1 \| opt2 \| ... \| optN` | Button poll — one vote per voter, click again to retract or change. Up to 10 options. |

## Yes/no (emoji)

Smallest poll possible: post the question, bot seeds two reactions, done.
Voting and tally are entirely Slack-native, so:

- No state on our side — these polls survive bot restarts for free.
- Counts are visible to anyone in the channel without re-opening any modal.

Requires the `reactions:write` bot scope.

## Button poll

Block Kit message with one button per option. Vote state is in-memory only,
keyed by the message `ts`:

```ts
interface Poll {
  question: string;
  options: string[];
  votes: Map<userId, optionIndex>;
  creatorId: string;
}
```

On each vote the bot re-renders the message via `chat.update`, showing a
20-cell progress bar and percentage per option, plus a total-votes context
line. Clicking your current option retracts your vote.

### Input parsing

The pipe-split is bracket-aware so a question containing a Slack entity ref
(e.g. `<@U123|alice>`) doesn't get torn apart by the `|` inside it. See
`splitOnPipe` in `polls/slack.ts`.

If the question has no `|`, the bot treats it as the yes/no form — `/poll
should we ship friday?` → emoji poll.

## Source

| What | Where |
| --- | --- |
| Parser + poll state + render | [`bots/slack/src/polls/slack.ts`](../../../bots/slack/src/polls/slack.ts) |
| Slash + button-action wiring | [`bots/slack/src/index.ts`](../../../bots/slack/src/index.ts) |
