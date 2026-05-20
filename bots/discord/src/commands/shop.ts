import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import {
  loadWorld,
  ShopEntity,
  updateWorld,
  World,
} from '../dnd/world.ts';
import { entityForUser } from '../dnd/encounter.ts';
import { addCoins, getBalance, tryDebit } from '../gambling/wallet.ts';
import type { Command } from './types.ts';

const SHOP_INTERACT_RANGE_CELLS = 1; // must be adjacent (Chebyshev) to the shop

function chebyshev(a: [number, number], b: [number, number]): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
}

function findShop(world: World, id: string): ShopEntity | null {
  const e = world.entities[id];
  if (!e || e.kind !== 'shop') return null;
  return e;
}

function nearbyShop(world: World, pos: [number, number]): { id: string; shop: ShopEntity } | null {
  for (const [id, e] of Object.entries(world.entities)) {
    if (e.kind !== 'shop') continue;
    if (chebyshev(pos, e.pos) <= SHOP_INTERACT_RANGE_CELLS) return { id, shop: e };
  }
  return null;
}

function defaultBuyback(price: number): number {
  return Math.max(1, Math.floor(price / 2));
}

export const shop: Command = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Buy and sell at a nearby shop (coins shared with /coins gambling balance)')
    .addSubcommand((s) =>
      s
        .setName('browse')
        .setDescription("Show the inventory of a shop you're standing next to")
        .addStringOption((o) => o.setName('id').setDescription('Shop entity id (default: nearest adjacent shop)')),
    )
    .addSubcommand((s) =>
      s
        .setName('buy')
        .setDescription('Buy an item from a nearby shop')
        .addStringOption((o) => o.setName('item').setDescription('Item name').setRequired(true))
        .addIntegerOption((o) => o.setName('qty').setDescription('Quantity (default 1)').setMinValue(1).setMaxValue(99))
        .addStringOption((o) => o.setName('id').setDescription('Shop entity id (default: nearest adjacent shop)')),
    )
    .addSubcommand((s) =>
      s
        .setName('sell')
        .setDescription('Sell an item to a nearby shop')
        .addStringOption((o) => o.setName('item').setDescription('Item name').setRequired(true))
        .addIntegerOption((o) => o.setName('qty').setDescription('Quantity (default 1)').setMinValue(1).setMaxValue(99))
        .addStringOption((o) => o.setName('id').setDescription('Shop entity id (default: nearest adjacent shop)')),
    ),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: 'Use this in a server.', ephemeral: true });
      return;
    }
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const world = await loadWorld(guildId);
    if (!world) {
      await interaction.reply({ content: 'No world here yet.', ephemeral: true });
      return;
    }
    const owner = entityForUser(world, userId);
    if (!owner) {
      await interaction.reply({ content: 'You have no character placed.', ephemeral: true });
      return;
    }
    const sheet = world.characters[userId];
    if (!sheet) {
      await interaction.reply({ content: 'No character sheet.', ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand(true);
    const explicitId = interaction.options.getString('id');

    function resolveShop(): { id: string; shop: ShopEntity } | null {
      if (explicitId) {
        const s = findShop(world!, explicitId);
        if (!s) return null;
        if (chebyshev(owner!.entity.pos, s.pos) > SHOP_INTERACT_RANGE_CELLS) return null;
        return { id: explicitId, shop: s };
      }
      return nearbyShop(world!, owner!.entity.pos);
    }

    if (sub === 'browse') {
      const found = resolveShop();
      if (!found) {
        await interaction.reply({ content: 'No shop within reach. Stand adjacent (within 5 ft) to a shop and try again.', ephemeral: true });
        return;
      }
      const balance = await getBalance(userId);
      const lines = found.shop.inventory.length
        ? found.shop.inventory
            .map((i) => `• **${i.item}** — ${i.price} 🪙${i.qty != null ? ` (×${i.qty} in stock)` : ''}`)
            .join('\n')
        : '*The shelves are bare.*';
      const embed = new EmbedBuilder()
        .setTitle(`🏪 ${found.shop.name}`)
        .setColor(0xd4a017)
        .setDescription(`*"${found.shop.greeting}"*\n\n${lines}`)
        .setFooter({
          text: `Your balance: ${balance.toLocaleString()} 🪙 — short on coins? Try /slots or /blackjack.`,
        });
      await interaction.reply({ embeds: [embed] });
      return;
    }

    const item = interaction.options.getString('item', true);
    const qty = interaction.options.getInteger('qty') ?? 1;

    if (sub === 'buy') {
      const found = resolveShop();
      if (!found) {
        await interaction.reply({ content: 'No shop within reach.', ephemeral: true });
        return;
      }
      const listing = found.shop.inventory.find((i) => i.item === item);
      if (!listing) {
        await interaction.reply({ content: `**${found.shop.name}** doesn't sell **${item}**.`, ephemeral: true });
        return;
      }
      if (listing.qty != null && listing.qty < qty) {
        await interaction.reply({ content: `Only ${listing.qty} in stock.`, ephemeral: true });
        return;
      }
      const cost = listing.price * qty;
      const ok = await tryDebit(userId, cost);
      if (!ok) {
        const balance = await getBalance(userId);
        await interaction.reply({
          content: `Not enough coins. Need **${cost.toLocaleString()}** 🪙, you have **${balance.toLocaleString()}**. Try \`/slots\` or \`/blackjack\` to scrape some together.`,
          ephemeral: true,
        });
        return;
      }
      await updateWorld(guildId, (w) => {
        const s = w.entities[found.id] as ShopEntity;
        const ls = s.inventory.find((i) => i.item === item);
        if (ls?.qty != null) ls.qty -= qty;
        const sht = w.characters[userId];
        const idx = sht.inventory.findIndex((i) => i.item === item);
        if (idx === -1) sht.inventory.push({ item, qty });
        else sht.inventory[idx].qty += qty;
      });
      const balance = await getBalance(userId);
      await interaction.reply(
        `🛒 Bought **${item}** ×${qty} for ${cost} 🪙. Balance: **${balance.toLocaleString()}** 🪙.`,
      );
      return;
    }

    if (sub === 'sell') {
      const found = resolveShop();
      if (!found) {
        await interaction.reply({ content: 'No shop within reach.', ephemeral: true });
        return;
      }
      const stack = sheet.inventory.find((i) => i.item === item);
      if (!stack || stack.qty < qty) {
        await interaction.reply({ content: `You don't have **${item}** ×${qty}.`, ephemeral: true });
        return;
      }
      const listing = found.shop.inventory.find((i) => i.item === item);
      const unit = found.shop.buyBack?.[item] ?? (listing ? defaultBuyback(listing.price) : 1);
      const payout = unit * qty;
      await updateWorld(guildId, (w) => {
        const sht = w.characters[userId];
        const idx = sht.inventory.findIndex((i) => i.item === item);
        if (idx !== -1) {
          sht.inventory[idx].qty -= qty;
          if (sht.inventory[idx].qty <= 0) sht.inventory.splice(idx, 1);
        }
      });
      const balance = await addCoins(userId, payout);
      await interaction.reply(
        `💰 Sold **${item}** ×${qty} for ${payout} 🪙. Balance: **${balance.toLocaleString()}** 🪙.`,
      );
      return;
    }
  },
};
