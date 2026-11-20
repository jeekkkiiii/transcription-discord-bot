# Emaq

Emaq is a Discord bot that joins your voice channel and posts a live transcript of what everyone says into a text channel:

> 21:04:12 **Alex**: okay are we starting the raid now or after dinner
> 21:04:15 **Sam**: after dinner, I need ten minutes

## Commands

| Command  | What it does |
|----------|--------------|
| `/join`  | Joins the voice channel you're in and posts the transcript in the channel where you ran the command. |
| `/leave` | Stops transcribing and leaves. (It also leaves on its own when everyone else has gone.) |

## Setup

You need **Node.js 22.12+** and an API key for a speech-to-text service. The example config uses **Groq's free tier** (sign up at <https://console.groq.com>); OpenAI or any OpenAI-compatible Whisper server also works.

### 1. Create the bot in Discord

1. Go to <https://discord.com/developers/applications> → **New Application**, and name it **Emaq**. (This name, and the avatar you upload on the **Bot** page, is what your server sees.)
2. On **General Information**, copy the **Application ID** → `DISCORD_CLIENT_ID`.
3. On **Bot**, click **Reset Token** and copy it → `DISCORD_TOKEN`. (No privileged intents are needed.)

### 2. Configure and run

```bash
npm install
cp .env.example .env   # then fill in the values
npm run deploy-commands
npm start
```

`npm run deploy-commands` registers `/join` and `/leave`. If you set `DISCORD_GUILD_ID` they show up in that server instantly; otherwise they are registered globally, which can take a few minutes.

### 3. Add it to your server

When the bot starts it prints an **invite link** in the console. Open it, pick your server, and authorise. It asks only for *View Channels*, *Send Messages* and *Connect*.

(You can also build the link yourself: `https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot+applications.commands&permissions=1051648`.)

## Notes

- **Privacy:** the bot announces that the call is being transcribed when it joins. Let people in your server know before using it — audio clips are sent to whichever transcription API you configure.
- **Free tier limits:** Groq's free tier allows 20 requests/minute and 2,000/day. Emaq groups each speaker's talking into ~20-second clips (`BATCH_TARGET_MS`), so a 4–5 hour session with 5 players uses roughly 1,000 requests. The trade-off is that lines show up up to a minute late and can hold a few sentences. If the API says "slow down", Emaq waits and retries instead of dropping lines.
- **Fantasy names:** put your character names, NPCs and places in `TRANSCRIBE_PROMPT` so the model spells them right.
- **Paid option:** OpenAI's `gpt-4o-mini-transcribe` is roughly $0.18 per hour of people talking, with no practical limits.
- **Hosting:** the bot must stay running to be online. Any always-on machine works (a home PC, a Raspberry Pi, or a small VPS / Railway / Fly.io instance).
- Uses `@discordjs/voice` 0.19, which supports Discord's end-to-end encrypted voice (DAVE), now required for voice bots.
- Run the tests with `npm test`.
