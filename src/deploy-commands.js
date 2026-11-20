import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commands } from './commands.js';

const rest = new REST().setToken(config.token);

if (config.guildId) {
  // Guild commands show up instantly — handy while testing.
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
  console.log(`Registered ${commands.length} commands in guild ${config.guildId}.`);
} else {
  // Global commands work in every server the bot is in (can take a few minutes to appear).
  await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
  console.log(`Registered ${commands.length} global commands.`);
}
