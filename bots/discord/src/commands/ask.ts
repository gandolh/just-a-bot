import { SlashCommandBuilder } from "discord.js";
import { logger } from "@bots/shared";
import type { Command } from "./types.ts";
import { AskLimiter } from "../ask/limits.ts";
import { answerThroughWicket, ASK_DEADLINE_MS } from "../ask/answer.ts";
import { wicketClient } from "../wicket/client.ts";
import { env } from "../env.ts";

const log = logger.scoped("ask");
const limiter = new AskLimiter();

export const ask: Command = {
  // One option: Wicket picks the model, so members don't.
  data: new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Ask an Ollama-hosted model a question")
    .addStringOption((o) =>
      o.setName("prompt").setDescription("Your question or instruction").setRequired(true).setMaxLength(1500),
    ),
  async execute(interaction) {
    if (!env.WICKET_URL || !env.WICKET_TOKEN) {
      const missing = [!env.WICKET_URL && "`WICKET_URL`", !env.WICKET_TOKEN && "`WICKET_TOKEN`"].filter(Boolean);
      await interaction.reply({
        content: `Ask is not configured: ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} missing on the bot.`,
        ephemeral: true,
      });
      return;
    }

    const prompt = interaction.options.getString("prompt", true);

    // Taken before the first await, so a burst of commands gets one through.
    const slot = limiter.claim(`${interaction.guildId ?? "dm"}:${interaction.user.id}`);
    if (!slot.ok) {
      await interaction.reply({
        content:
          slot.reason === "busy"
            ? "Your last question is still being answered."
            : `You're asking too fast. Wait ${slot.waitSeconds}s.`,
        ephemeral: true,
      });
      return;
    }

    try {
      await interaction.deferReply();
      const result = await answerThroughWicket({
        interaction,
        client: wicketClient({ url: env.WICKET_URL, token: env.WICKET_TOKEN }),
        prompt,
        // From when Discord created the interaction: its 15 minutes started then.
        deadline: interaction.createdTimestamp + ASK_DEADLINE_MS,
        onDeleteError: (err) => log.error("Could not delete the deferred /ask reply", err),
      });
      // The channel no longer shows failures, so the log is where the owner finds them.
      if (result.outcome !== "answered") log.warn(`/ask ${result.outcome}: ${result.reason}`);
    } finally {
      slot.done();
    }
  },
};
