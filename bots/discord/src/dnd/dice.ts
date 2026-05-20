export interface RollResult {
  expression: string;
  rolls: { sides: number; values: number[]; kept: number[]; dropped: number[] }[];
  modifier: number;
  total: number;
  breakdown: string;
}

interface Term {
  count: number;
  sides: number;
  keep?: { side: 'h' | 'l'; n: number };
  drop?: { side: 'h' | 'l'; n: number };
  sign: 1 | -1;
}

interface ParsedExpression {
  terms: Term[];
  modifier: number;
}

const TERM_RE = /([+-]?)\s*(\d*)d(\d+)(?:(kh|kl|dh|dl)(\d+))?/gi;
const MOD_RE = /([+-])\s*(\d+)(?!\s*d)/gi;

export function parseExpression(input: string): ParsedExpression {
  const cleaned = input.replace(/\s+/g, '');
  const terms: Term[] = [];
  let match: RegExpExecArray | null;

  TERM_RE.lastIndex = 0;
  while ((match = TERM_RE.exec(cleaned)) !== null) {
    const [, signStr, countStr, sidesStr, modeStr, modeN] = match;
    const sign: 1 | -1 = signStr === '-' ? -1 : 1;
    const count = countStr ? parseInt(countStr, 10) : 1;
    const sides = parseInt(sidesStr, 10);
    if (count < 1 || count > 100) throw new Error(`dice count must be 1-100 (got ${count})`);
    if (sides < 2 || sides > 1000) throw new Error(`die sides must be 2-1000 (got ${sides})`);
    const term: Term = { count, sides, sign };
    if (modeStr) {
      const n = parseInt(modeN, 10);
      if (modeStr.startsWith('k')) term.keep = { side: modeStr[1] as 'h' | 'l', n };
      else term.drop = { side: modeStr[1] as 'h' | 'l', n };
    }
    terms.push(term);
  }

  let modifier = 0;
  const withoutDice = cleaned.replace(TERM_RE, '');
  MOD_RE.lastIndex = 0;
  while ((match = MOD_RE.exec(withoutDice)) !== null) {
    const sign = match[1] === '-' ? -1 : 1;
    modifier += sign * parseInt(match[2], 10);
  }

  if (terms.length === 0) throw new Error('no dice in expression');
  return { terms, modifier };
}

function rollDie(sides: number): number {
  return 1 + Math.floor(Math.random() * sides);
}

export function rollExpression(input: string): RollResult {
  const parsed = parseExpression(input);
  const rolls: RollResult['rolls'] = [];
  let total = parsed.modifier;
  const parts: string[] = [];

  for (const term of parsed.terms) {
    const values: number[] = [];
    for (let i = 0; i < term.count; i++) values.push(rollDie(term.sides));

    let kept = [...values];
    let dropped: number[] = [];
    if (term.keep) {
      const sorted = [...values].sort((a, b) => (term.keep!.side === 'h' ? b - a : a - b));
      kept = sorted.slice(0, term.keep.n);
      dropped = sorted.slice(term.keep.n);
    } else if (term.drop) {
      const sorted = [...values].sort((a, b) => (term.drop!.side === 'h' ? b - a : a - b));
      dropped = sorted.slice(0, term.drop.n);
      kept = sorted.slice(term.drop.n);
    }

    const subtotal = kept.reduce((s, v) => s + v, 0);
    total += term.sign * subtotal;
    rolls.push({ sides: term.sides, values, kept, dropped });

    const valStr = values
      .map((v) => (dropped.includes(v) && !kept.includes(v) ? `~~${v}~~` : `**${v}**`))
      .join(', ');
    const label = `${term.count}d${term.sides}${term.keep ? `k${term.keep.side}${term.keep.n}` : ''}${term.drop ? `d${term.drop.side}${term.drop.n}` : ''}`;
    parts.push(`${term.sign === -1 ? '−' : parts.length ? '+' : ''}${label}[${valStr}]`);
  }

  if (parsed.modifier !== 0) {
    parts.push(`${parsed.modifier >= 0 ? '+' : '−'}${Math.abs(parsed.modifier)}`);
  }

  return {
    expression: input,
    rolls,
    modifier: parsed.modifier,
    total,
    breakdown: parts.join(' '),
  };
}

export interface IntentResult {
  title: string;
  expression: string;
  result: RollResult;
  extra?: { title: string; expression: string; result: RollResult };
  note?: string;
}

export type Intent =
  | 'attack'
  | 'damage'
  | 'save'
  | 'check'
  | 'initiative'
  | 'death-save'
  | 'advantage'
  | 'disadvantage';

export interface IntentInput {
  intent: Intent;
  mod?: number;
  label?: string;
  damageDice?: string;
}

export function rollIntent(input: IntentInput): IntentResult {
  const mod = input.mod ?? 0;
  const modPart = mod === 0 ? '' : mod > 0 ? `+${mod}` : `${mod}`;

  switch (input.intent) {
    case 'attack': {
      const expr = `1d20${modPart}`;
      const result = rollExpression(expr);
      const nat = result.rolls[0].values[0];
      const note = nat === 20 ? '🎯 Natural 20!' : nat === 1 ? '💀 Natural 1.' : undefined;
      const out: IntentResult = {
        title: `Attack roll${input.label ? ` — ${input.label}` : ''}`,
        expression: expr,
        result,
        note,
      };
      if (input.damageDice) {
        const dmgExpr = nat === 20 ? doubleDice(input.damageDice) : input.damageDice;
        const dmgResult = rollExpression(dmgExpr);
        out.extra = {
          title: nat === 20 ? 'Damage (crit, doubled dice)' : 'Damage',
          expression: dmgExpr,
          result: dmgResult,
        };
      }
      return out;
    }
    case 'damage': {
      const expr = input.damageDice ?? `1d6${modPart}`;
      return {
        title: `Damage${input.label ? ` — ${input.label}` : ''}`,
        expression: expr,
        result: rollExpression(expr),
      };
    }
    case 'save': {
      const expr = `1d20${modPart}`;
      return {
        title: `Saving throw${input.label ? ` — ${input.label.toUpperCase()}` : ''}`,
        expression: expr,
        result: rollExpression(expr),
      };
    }
    case 'check': {
      const expr = `1d20${modPart}`;
      return {
        title: `Ability check${input.label ? ` — ${input.label}` : ''}`,
        expression: expr,
        result: rollExpression(expr),
      };
    }
    case 'initiative': {
      const expr = `1d20${modPart}`;
      return {
        title: 'Initiative',
        expression: expr,
        result: rollExpression(expr),
      };
    }
    case 'death-save': {
      const expr = `1d20`;
      const result = rollExpression(expr);
      const v = result.rolls[0].values[0];
      let note: string;
      if (v === 20) note = '✨ Natural 20 — you regain 1 HP!';
      else if (v === 1) note = '💀 Natural 1 — counts as two failures.';
      else if (v >= 10) note = '✅ Success.';
      else note = '❌ Failure.';
      return { title: 'Death saving throw', expression: expr, result, note };
    }
    case 'advantage': {
      const expr = `2d20kh1${modPart}`;
      return {
        title: `Roll with advantage${input.label ? ` — ${input.label}` : ''}`,
        expression: expr,
        result: rollExpression(expr),
      };
    }
    case 'disadvantage': {
      const expr = `2d20kl1${modPart}`;
      return {
        title: `Roll with disadvantage${input.label ? ` — ${input.label}` : ''}`,
        expression: expr,
        result: rollExpression(expr),
      };
    }
  }
}

function doubleDice(expr: string): string {
  return expr.replace(/(\d*)d(\d+)/gi, (_, count, sides) => {
    const n = count ? parseInt(count, 10) : 1;
    return `${n * 2}d${sides}`;
  });
}
