# `/clock` — timezone world clock

## Surface

| Command | What it does |
| --- | --- |
| `/clock set <Continent/City>` | Register your timezone (IANA name, e.g. `America/New_York`). |
| `/clock unset` | Remove your timezone. |
| `/clock show` | Post the world clock to the channel (default subcommand). |

`show` lists every registered member in this workspace, sorted by UTC offset,
with their current local time and offset.

## Validation

IANA names are checked against `Intl.supportedValuesOf('timeZone')` — invalid
names get an ephemeral error. No autocomplete (Slack slash commands don't
support it like Discord does); typing the full IANA name is the cost of
admission.

## Storage

JSON at `bots/slack/data/timezones.json`, shape:

```json
{
  "T01ABCD": { "U01ALICE": "America/New_York", "U02BOB": "Europe/Bucharest" },
  "T02EFGH": { "U03CARL": "Asia/Tokyo" }
}
```

Workspace-scoped — `/clock show` only lists members of the workspace it was
invoked in.

## Source

| What | Where |
| --- | --- |
| team→user→tz store | [`bots/slack/src/clock/store.ts`](../../../bots/slack/src/clock/store.ts) |
| IANA validation + formatting | [`bots/slack/src/clock/format.ts`](../../../bots/slack/src/clock/format.ts) |
| Slash command wiring | [`bots/slack/src/index.ts`](../../../bots/slack/src/index.ts) |

## Future

- Swap text input for a Block Kit `external_select` typeahead so users don't
  have to know the IANA name.
- Show times via `<!date^…>` so each viewer sees their own format.
