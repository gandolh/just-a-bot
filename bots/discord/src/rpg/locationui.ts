import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { Character, MOB_KINDS, World, cheby, effectiveStats, xpToNext } from './world.ts';
import { ITEMS, getItem, isWeapon, shopCatalog } from './items.ts';
import { buyItem, sellItem } from './shop.ts';
import { rollBounty } from './bounty.ts';
import { LocationDef, buildLocations, getLocation } from './locations.ts';

export type Screen = 'location' | 'combat' | 'bag' | 'town' | 'sheet' | 'nearby';

const HP_BAR_LEN = 10;
export function hpBar(hp: number, maxHp: number): string {
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const filled = Math.round(ratio * HP_BAR_LEN);
  return '█'.repeat(filled) + '░'.repeat(HP_BAR_LEN - filled);
}

export interface ActionResult {
  ok: boolean;
  banner?: string;
}

// ── Shared helpers ───────────────────────────────────────────────────────────

function statusLine(char: Character): string {
  const eff = effectiveStats(char);
  return `❤️ ${hpBar(char.hp, char.maxHp)} **${char.hp}/${char.maxHp}**  ⚔️${eff.atk} 🛡️${eff.def}  💰${char.coins}  Lv${char.level} (${xpToNext(char.xp)}→)`;
}

function bountyLine(char: Character): string | null {
  if (!char.bounty) return null;
  const kind = MOB_KINDS[char.bounty.target];
  const label = kind ? `${kind.glyph} ${kind.name.toLowerCase()}s` : char.bounty.target;
  return `🎯 Bounty: slay ${char.bounty.goal} ${label} — **${char.bounty.progress}/${char.bounty.goal}**`;
}

function equipText(char: Character): string {
  const w = char.equipment.weapon ? ITEMS[char.equipment.weapon] : null;
  const a = char.equipment.armor ? ITEMS[char.equipment.armor] : null;
  return [
    w ? `🗡️ ${w.label} (${w.desc ?? `+${w.atk} ATK`})` : '🗡️ — bare hands —',
    a ? `🛡️ ${a.label} (${a.desc ?? `+${a.def} DEF`})` : '🛡️ — no armor —',
  ].join('\n');
}

function inventoryText(char: Character): string {
  if (char.inventory.length === 0) return '— empty —';
  const counts: Record<string, number> = {};
  for (const slug of char.inventory) counts[slug] = (counts[slug] ?? 0) + 1;
  return Object.entries(counts)
    .map(([slug, n]) => {
      const item = ITEMS[slug];
      const label = item ? `${item.glyph} ${item.label}` : slug;
      return n > 1 ? `${label} ×${n}` : label;
    })
    .join('\n');
}

export function nearbyPlayers(world: World, char: Character): Character[] {
  // "Nearby" now means in the same location (no tiles).
  const out: Character[] = [];
  for (const c of Object.values(world.chars)) {
    if (c.userId === char.userId || c.hp <= 0 || c.away) continue;
    if (c.locationId === char.locationId) out.push(c);
  }
  return out;
}

export function hasPotion(char: Character): boolean {
  return char.inventory.includes('healing-potion');
}

// ── Action helpers (reused across screens) ───────────────────────────────────

export function doEquip(char: Character, slug: string): ActionResult {
  const item = getItem(slug);
  if (!item) return { ok: false, banner: 'Unknown item.' };
  if (item.kind !== 'weapon' && item.kind !== 'armor') return { ok: false, banner: `${item.label} is not equippable.` };
  const idx = char.inventory.indexOf(slug);
  if (idx < 0) return { ok: false, banner: `You don't have a ${item.label}.` };
  const slot: 'weapon' | 'armor' = isWeapon(slug) ? 'weapon' : 'armor';
  char.inventory.splice(idx, 1);
  const prev = char.equipment[slot];
  char.equipment[slot] = slug;
  if (prev) char.inventory.push(prev);
  return { ok: true, banner: `🎽 Equipped **${item.label}**${prev ? ` (returned ${ITEMS[prev]?.label ?? prev})` : ''}.` };
}

export function doUnequip(char: Character, slot: 'weapon' | 'armor'): ActionResult {
  const slug = char.equipment[slot];
  if (!slug) return { ok: false, banner: `Nothing equipped in the ${slot} slot.` };
  char.equipment[slot] = null;
  char.inventory.push(slug);
  return { ok: true, banner: `🎽 Unequipped **${ITEMS[slug]?.label ?? slug}**.` };
}

export function doUseItem(char: Character, slug: string): ActionResult {
  const item = getItem(slug);
  if (!item || item.kind !== 'consumable') return { ok: false, banner: `${item?.label ?? slug} can't be used.` };
  const idx = char.inventory.indexOf(slug);
  if (idx < 0) return { ok: false, banner: `You don't have a ${item.label}.` };
  char.inventory.splice(idx, 1);
  const before = char.hp;
  char.hp = Math.min(char.maxHp, char.hp + (item.hp ?? 12));
  return { ok: true, banner: `🧪 Used **${item.label}**. HP ${before} → ${char.hp}.` };
}

export function applyBagSelection(char: Character, slug: string): ActionResult {
  if (!slug) return { ok: true };
  const item = getItem(slug);
  if (!item) return { ok: false, banner: 'Unknown item.' };
  if (item.kind === 'weapon' || item.kind === 'armor') return doEquip(char, slug);
  if (item.kind === 'consumable') return doUseItem(char, slug);
  return { ok: false, banner: `${item.label} can only be sold at the plaza (🏪 Town).` };
}

export function doBuy(char: Character, slug: string): ActionResult {
  const res = buyItem(char, slug);
  if (!res.ok) return { ok: false, banner: res.reason ?? 'Could not buy.' };
  return { ok: true, banner: `🛒 Bought **${res.item?.label}** for ${res.cost}c. Coins: ${char.coins}.` };
}

export function doSell(char: Character, slug: string): ActionResult {
  const res = sellItem(char, slug);
  if (!res.ok) return { ok: false, banner: res.reason ?? 'Could not sell.' };
  return { ok: true, banner: `💰 Sold **${res.item?.label}** for ${res.gained}c. Coins: ${char.coins}.` };
}

export function doRerollBounty(char: Character): ActionResult {
  rollBounty(char);
  return { ok: true, banner: '🎯 Rolled a fresh bounty.' };
}

export function doRest(char: Character): ActionResult {
  if (char.hp >= char.maxHp) return { ok: false, banner: 'You are already at full health.' };
  const heal = Math.max(3, Math.round(char.maxHp * 0.3));
  const before = char.hp;
  char.hp = Math.min(char.maxHp, char.hp + heal);
  return { ok: true, banner: `🏕️ You rest and recover. HP ${before} → ${char.hp}.` };
}

const FOOTER = 'Session stays live ~15 min; if buttons stop responding, run /rpg start again.';

// ── Embeds ───────────────────────────────────────────────────────────────────

export function buildEmbed(
  world: World,
  char: Character,
  screen: Screen,
  banner?: string,
): EmbedBuilder {
  const loc = getLocation(world, char.locationId) ?? buildLocations(world).plaza;

  if (screen === 'combat' && char.encounter) {
    const kind = MOB_KINDS[char.encounter.mobKind];
    const parts = [
      statusLine(char),
      '',
      `⚔️ **Fighting ${kind?.glyph ?? '👹'} ${kind?.name ?? char.encounter.mobKind}**`,
      `${kind?.glyph ?? '👹'} ${hpBar(char.encounter.mobHp, kind?.hp ?? 1)} ${char.encounter.mobHp}/${kind?.hp ?? '?'}`,
    ];
    const recent = char.encounter.log.slice(-4);
    if (recent.length) parts.push('', ...recent);
    if (banner) parts.push('', banner);
    return new EmbedBuilder().setColor(0xe74c3c).setTitle(`${loc.glyph} ${loc.name} — combat`).setDescription(parts.join('\n')).setFooter({ text: FOOTER });
  }

  if (screen === 'bag') {
    const parts = [statusLine(char), '', '**Equipped**', equipText(char), '', '**Inventory**', inventoryText(char)];
    if (banner) parts.push('', banner);
    return new EmbedBuilder().setColor(0x8e44ad).setTitle(`🎒 ${char.name}'s bag`).setDescription(parts.join('\n')).setFooter({ text: FOOTER });
  }

  if (screen === 'town') {
    const lines = shopCatalog().map((i) => {
      const stat = i.atk ? `+${i.atk} ATK` : i.def ? `+${i.def} DEF` : i.desc ?? i.kind;
      return `${i.glyph} **${i.label}** — ${i.buy}c (${stat})`;
    });
    const parts = [statusLine(char), '', '🏪 **Plaza shop**', '', ...lines];
    if (banner) parts.push('', banner);
    return new EmbedBuilder().setColor(0x1abc9c).setTitle('🏪 Town').setDescription(parts.join('\n')).setFooter({ text: FOOTER });
  }

  if (screen === 'sheet') {
    const eff = effectiveStats(char);
    const parts = [
      `Lvl **${char.level}** • ${char.xp} XP (next in ${xpToNext(char.xp)})`,
      `❤️ ${hpBar(char.hp, char.maxHp)} ${char.hp}/${char.maxHp}`,
      `⚔️ ATK ${eff.atk}  🛡️ DEF ${eff.def}  💰 ${char.coins}`,
      `☠️ Kills ${char.kills}  •  💀 Deaths ${char.deaths}  •  📍 ${loc.name}`,
      '', '**Equipped**', equipText(char),
      '', '**Bounty**', bountyLine(char) ?? '— none —',
    ];
    if (banner) parts.push('', banner);
    return new EmbedBuilder().setColor(0x3498db).setTitle(`${char.glyph} ${char.name}`).setDescription(parts.join('\n')).setFooter({ text: FOOTER });
  }

  if (screen === 'nearby') {
    const near = nearbyPlayers(world, char);
    const parts = [statusLine(char), ''];
    if (near.length === 0) parts.push('👥 Nobody else is here right now.');
    else {
      parts.push('👥 **Adventurers here** — duel or trade:');
      for (const p of near) parts.push(`${p.glyph} **${p.name}** — lvl ${p.level}`);
    }
    if (banner) parts.push('', banner);
    return new EmbedBuilder().setColor(0xe67e22).setTitle('👥 Nearby').setDescription(parts.join('\n')).setFooter({ text: FOOTER });
  }

  // Default: the location screen.
  const parts = [statusLine(char), '', `*${loc.description}*`];
  const bl = bountyLine(char);
  if (bl) parts.push('', bl);
  if (banner) parts.push('', banner);
  const others = nearbyPlayers(world, char);
  if (others.length) parts.push('', `👥 Also here: ${others.map((p) => `${p.glyph} ${p.name}`).join(', ')}`);
  return new EmbedBuilder().setColor(0x9b59b6).setTitle(`${loc.glyph} ${loc.name}`).setDescription(parts.join('\n')).setFooter({ text: FOOTER });
}

// ── Rows ─────────────────────────────────────────────────────────────────────

type Row = ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>;

function btn(id: string, label: string, style: ButtonStyle): ButtonBuilder {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
}

export function buildRows(world: World, char: Character, screen: Screen): Row[] {
  const loc = getLocation(world, char.locationId) ?? buildLocations(world).plaza;
  const backRow = (...extra: ButtonBuilder[]): Row =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      btn('rpg:ctl:screen:location', '⬅ Back', ButtonStyle.Secondary),
      ...extra,
    );

  if (screen === 'combat') {
    return [new ActionRowBuilder<ButtonBuilder>().addComponents(
      btn('rpg:ctl:fight', '⚔ Attack', ButtonStyle.Danger),
      btn('rpg:ctl:flee', '🏃 Flee', ButtonStyle.Secondary),
      btn('rpg:ctl:combatpotion', '🧪 Potion', ButtonStyle.Success).setDisabled(!hasPotion(char) || char.hp >= char.maxHp),
    )];
  }

  if (screen === 'bag') {
    const rows: Row[] = [];
    const slugs = [...new Set(char.inventory)];
    if (slugs.length) {
      rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId('rpg:ctl:bagsel').setPlaceholder('Pick an item to equip / use').addOptions(
          slugs.slice(0, 25).map((slug) => {
            const item = ITEMS[slug];
            const n = char.inventory.filter((s) => s === slug).length;
            return {
              label: `${item?.label ?? slug}${n > 1 ? ` ×${n}` : ''}`,
              value: slug,
              description: item?.desc?.slice(0, 90),
              emoji: item?.glyph && /\p{Extended_Pictographic}/u.test(item.glyph) ? item.glyph : undefined,
            };
          }),
        ),
      ));
    }
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      btn('rpg:ctl:unequip:weapon', '🗡 Unequip weapon', ButtonStyle.Secondary),
      btn('rpg:ctl:unequip:armor', '🛡 Unequip armor', ButtonStyle.Secondary),
    ));
    rows.push(backRow());
    return rows;
  }

  if (screen === 'town') {
    const rows: Row[] = [];
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId('rpg:ctl:buysel').setPlaceholder('Buy an item…').addOptions(
        shopCatalog().slice(0, 25).map((i) => ({
          label: `${i.label} — ${i.buy}c`,
          value: i.slug,
          emoji: i.glyph && /\p{Extended_Pictographic}/u.test(i.glyph) ? i.glyph : undefined,
        })),
      ),
    ));
    const sellable = [...new Set(char.inventory)].filter((s) => s !== char.equipment.weapon && s !== char.equipment.armor);
    if (sellable.length) {
      rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId('rpg:ctl:sellsel').setPlaceholder('Sell an item…').addOptions(
          sellable.slice(0, 25).map((slug) => {
            const item = ITEMS[slug];
            return { label: `${item?.label ?? slug} — ${item?.sell ?? 0}c`, value: slug, emoji: item?.glyph && /\p{Extended_Pictographic}/u.test(item.glyph) ? item.glyph : undefined };
          }),
        ),
      ));
    }
    rows.push(backRow());
    return rows;
  }

  if (screen === 'sheet') {
    return [backRow(btn('rpg:ctl:bounty', '🎯 Reroll bounty', ButtonStyle.Primary))];
  }

  if (screen === 'nearby') {
    const rows: Row[] = [];
    for (const p of nearbyPlayers(world, char).slice(0, 4)) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
        btn(`rpg:ctl:noop:${p.userId}`, `${p.glyph} ${p.name}`.slice(0, 80), ButtonStyle.Secondary).setDisabled(true),
        btn(`rpg:ctl:duel:${p.userId}`, '⚔ Duel', ButtonStyle.Danger),
        btn(`rpg:ctl:trade:${p.userId}`, '🤝 Trade', ButtonStyle.Success),
      ));
    }
    rows.push(backRow());
    return rows;
  }

  // Default: the location screen. Actions + travel.
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('rpg:ctl:explore', '🔍 Explore', ButtonStyle.Primary),
    btn('rpg:ctl:rest', '🏕️ Rest', ButtonStyle.Success),
    btn('rpg:ctl:screen:bag', '🎒 Bag', ButtonStyle.Secondary),
    btn('rpg:ctl:screen:sheet', '📋 Me', ButtonStyle.Secondary),
  );
  if (loc.hub) actionRow.addComponents(btn('rpg:ctl:screen:town', '🏪 Town', ButtonStyle.Secondary));

  const rows: Row[] = [actionRow];

  // Travel row: exits to connected locations.
  const all = buildLocations(world);
  const exitBtns = loc.exits
    .map((id) => all[id])
    .filter((l): l is LocationDef => !!l)
    .slice(0, 5)
    .map((l) => btn(`rpg:ctl:travel:${l.id}`, `${l.glyph} ${l.name}`.slice(0, 80), ButtonStyle.Secondary));
  if (exitBtns.length) rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...exitBtns));

  // Utility row: Nearby (if others here) + Exit.
  const util: ButtonBuilder[] = [];
  if (nearbyPlayers(world, char).length) util.push(btn('rpg:ctl:screen:nearby', '👥 Nearby', ButtonStyle.Success));
  util.push(btn('rpg:ctl:exit', '🚪 Exit', ButtonStyle.Secondary));
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...util));

  return rows;
}

// Helper used by handlers to push a combat-log line.
export function pushCombatLog(char: Character, line: string): void {
  if (char.encounter) char.encounter.log.push(line);
}

// Convenience for command handlers: the full message payload for a screen.
export function buildLocationView(
  world: World,
  char: Character,
  screen: Screen = 'location',
  banner?: string,
): { embeds: EmbedBuilder[]; components: Row[] } {
  return {
    embeds: [buildEmbed(world, char, screen, banner)],
    components: buildRows(world, char, screen),
  };
}

export { cheby };
