import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits } from 'discord.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('join')
    .setDescription('Join your voice channel and post a live transcript in this text channel.')
    .setContexts(InteractionContextType.Guild),
  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Stop transcribing and leave the voice channel.')
    .setContexts(InteractionContextType.Guild),
].map((c) => c.toJSON());

// Permissions the bot needs: View Channel, Send Messages, Connect.
export const BOT_PERMISSIONS =
  PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages | PermissionFlagsBits.Connect;
