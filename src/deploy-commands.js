require('dotenv').config();
const { applyRuntimeEnv } = require('./utils/runtimeEnv');
applyRuntimeEnv();
const { getLinkedGuildIds } = require('./utils/helpers');
const { deployGuildCommands, buildCommandBody } = require('./utils/deployCommands');
const { REST, Routes } = require('discord.js');
require('./database/db');

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  if (!token || !clientId) {
    console.error('DISCORD_TOKEN en CLIENT_ID zijn verplicht in .env');
    process.exit(1);
  }

  const body = buildCommandBody();
  const rest = new REST({ version: '10' }).setToken(token);
  const guilds = getLinkedGuildIds();

  await rest.put(Routes.applicationCommands(clientId), { body: [] });
  console.log('Globale commands gewist.');

  if (!guilds.length) {
    console.log('Nog geen gekoppelde servers. Koppel er een via het Reedhall dashboard, daarna opnieuw: npm run deploy');
    return;
  }

  for (const guildId of guilds) {
    await deployGuildCommands(guildId);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
