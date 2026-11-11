import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";

/** A slash command used in a server: `inGuild()` narrows an interaction to this, and its `guildId` is a string. */
export type GuildCommandInteraction = ChatInputCommandInteraction<"cached" | "raw">;

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}

export interface ContextMenuCommand {
  data: ContextMenuCommandBuilder;
  execute(interaction: MessageContextMenuCommandInteraction): Promise<void>;
}
