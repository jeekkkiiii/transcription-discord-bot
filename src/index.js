import { Client, Events, GatewayIntentBits, MessageFlags, OAuth2Scopes, PermissionFlagsBits } from 'discord.js';
import { config } from './config.js';
import { BOT_PERMISSIONS } from './commands.js';
import { sessions, TranscriptionSession } from './session.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.once(Events.ClientReady, (c) => {
  const invite = c.generateInvite({
    scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
    permissions: BOT_PERMISSIONS,
  });
  console.log(`Logged in as ${c.user.tag}`);
  console.log(`Invite link: ${invite}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || !interaction.inGuild()) return;
  try {
    if (interaction.commandName === 'join') await handleJoin(interaction);
    else if (interaction.commandName === 'leave') await handleLeave(interaction);
  } catch (err) {
    console.error(err);
    const reply = { content: `Something went wrong: ${err.message}`, flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.editReply(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
});

async function handleJoin(interaction) {
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const voiceChannel = member.voice.channel;
  if (!voiceChannel) {
    return interaction.reply({ content: 'Join a voice channel first, then run `/join`.', flags: MessageFlags.Ephemeral });
  }

  const me = interaction.guild.members.me;
  const textChannel = interaction.channel;
  if (!voiceChannel.permissionsFor(me).has(PermissionFlagsBits.Connect)) {
    return interaction.reply({ content: `I don't have permission to join ${voiceChannel}.`, flags: MessageFlags.Ephemeral });
  }
  if (!textChannel?.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
    return interaction.reply({ content: "I can't send messages in this channel.", flags: MessageFlags.Ephemeral });
  }

  sessions.get(interaction.guildId)?.stop();
  await interaction.deferReply();

  const session = new TranscriptionSession(voiceChannel, textChannel);
  await session.start();
  await interaction.editReply(
    `🎙️ Emaq is now transcribing ${voiceChannel} into this channel. **Everyone in the call is being transcribed.** Use \`/leave\` to stop.`,
  );
}

async function handleLeave(interaction) {
  const session = sessions.get(interaction.guildId);
  if (!session) {
    return interaction.reply({ content: "I'm not in a voice channel.", flags: MessageFlags.Ephemeral });
  }
  session.stop();
  await interaction.reply('👋 Stopped transcribing.');
}

// Leave automatically when everyone else has left the call.
client.on(Events.VoiceStateUpdate, (oldState) => {
  const session = sessions.get(oldState.guild.id);
  if (!session || oldState.channelId !== session.voiceChannel.id) return;
  const humans = session.voiceChannel.members.filter((m) => !m.user.bot);
  if (humans.size === 0) {
    session.stop();
    session.textChannel.send('👋 Everyone left, so I stopped transcribing.').catch(() => {});
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const session of sessions.values()) session.stop();
    client.destroy().finally(() => process.exit(0));
  });
}

client.login(config.token);
