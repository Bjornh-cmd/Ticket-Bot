require('dotenv').config();

const path = require('path');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { loadCommands, loadEvents } = require('./utils/loaders');
const { applyRuntimeEnv } = require('./utils/runtimeEnv');

applyRuntimeEnv();
require('./database/db');

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN ontbreekt in .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.commands = loadCommands(path.join(__dirname, 'commands'));
loadEvents(client, path.join(__dirname, 'events'));

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('Login mislukt:', err.message);
  process.exit(1);
});

function shutdown(signal) {
  console.log(`${signal} ontvangen, bot stopt...`);
  client.destroy();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
