# Gambling

Hypothetical coins, hypothetical losses. No real currency.

Per-user coin balances live in `bots/discord/data/wallets.json` (single
file, all guilds and users). Coins are added via `/coins add`, capped at
100,000 per request.

## Commands

| Command           | What it does                                                       |
| ----------------- | ------------------------------------------------------------------ |
| `/coins balance`  | Show your balance (ephemeral)                                      |
| `/coins add`      | Add 0–100,000 coins to your account                                |
| `/slots`          | 5×5 slot machine, 12 paylines (5 rows + 5 cols + 2 diagonals)      |
| `/blackjack`      | Classic blackjack vs the dealer with Hit / Stand / Double buttons  |
| `/dice`           | Roll 2d6 against the bot; higher total wins                        |

## Slots

5×5 grid, 12 paylines, anchored left/top. A line pays when its first
3, 4, or 5 cells are the same symbol (counted from the left for rows /
top for columns / origin for diagonals).

**Bet is total.** Per-line stake is `bet / 12`. Winnings are floored to
integers, so very small bets pay less than the symbol-multiplier table
implies.

### Payouts

Win = `(bet / 12) * BASE_MULT[symbol] * LENGTH_MULT[count]`, summed across
all winning lines.

| Symbol | Base mult |
| :----: | :-------: |
|  🍒   |   2       |
|  🍋   |   3       |
|  🍊   |   4       |
|  🍇   |   5       |
|  🔔   |   8       |
|  ⭐   |  12       |
|  💎   |  25       |

| Match length | Length mult |
| :----------: | :---------: |
|  3 in a row  |   ×1        |
|  4 in a row  |   ×4        |
|  5 in a row  |  ×15        |

Source: [`bots/discord/src/gambling/slots.ts`](../../../bots/discord/src/gambling/slots.ts).

## Blackjack

Standard rules. Dealer hits on soft 17. Natural blackjack pays 3:2.

- **Hit** — draw a card. Bust at >21.
- **Stand** — dealer plays, higher hand wins.
- **Double** — only on first action. Doubles the stake, takes exactly one
  more card, then dealer plays.

Game state lives in an in-memory `Map<messageId, Game>`. **A bot restart
mid-hand forfeits the bet** — the message remains but its game state is
gone. Acceptable trade for a hobby bot.

Source: [`bots/discord/src/gambling/blackjack.ts`](../../../bots/discord/src/gambling/blackjack.ts).

## Dice

Both players roll 2d6. Higher total wins 2× the bet (net = +bet). Tie
returns the stake.

Source: [`bots/discord/src/gambling/dice.ts`](../../../bots/discord/src/gambling/dice.ts).

## Wallet model

Single JSON file: `bots/discord/data/wallets.json`. Shape:

```jsonc
{
  "<userId>": 12345,
  "<userId>": 6789
}
```

Loads lazily, caches in memory, serializes writes via a single promise
chain. Concurrent commands from the same user (or different users) won't
clobber each other.

API: `getBalance`, `addCoins`, `tryDebit`, `credit`. `tryDebit` is the
only place that returns `false` — used to gate insufficient-funds errors.

Source: [`bots/discord/src/gambling/wallet.ts`](../../../bots/discord/src/gambling/wallet.ts).

## Design notes

- **One file for all users.** Volume is trivial; per-user files would just
  fragment state. The RPG side uses per-guild files because *world data* is
  guild-scoped; wallet balances are not.
- **Not multi-process safe.** Two bot instances running against the same
  data dir will race. Not a concern unless you go multi-process.
- **Integer floors on slot payouts.** Bets that don't divide evenly by 12
  drop the remainder. Could pay in basis points internally if precision
  matters, but for a casino sim it doesn't.
- **House edge isn't tuned.** Slot symbol multipliers were picked by feel.
  With 7 symbols and the current table, expected return per line for 3-in-
  a-row is generous; 5-in-a-row is rare enough to keep RTP under 100%. If
  the bot starts looking like a money printer, tune `BASE_MULT`.
