const path = require('path');
const { REST, Routes } = require('discord.js');
const { loadCommands } = require('./loaders');
const { getLinkedGuildIds } = require('./helpers');
const { applySlashLocalizations } = require('../i18n');

function buildCommandBody() {
  const commands = loadCommands(path.join(__dirname, '..', 'commands'));
  return [...commands.values()].map((c) => applySlashLocalizations(c.data.toJSON()));
}

function getRest() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  if (!token || !clientId) {
    throw new Error('DISCORD_TOKEN and CLIENT_ID are required');
  }
  return { rest: new REST({ version: '10' }).setToken(token), clientId };
}

/** Register slash commands for one guild (guild-scoped). */
async function deployGuildCommands(guildId) {
  const { rest, clientId } = getRest();
  const body = buildCommandBody();
  await rest.put(Routes.applicationGuildCommands(clientId, String(guildId)), { body });
  console.log(`Commands gedeployed naar guild ${guildId} (${body.length})`);
  return body.length;
}

/** Clear guild-scoped commands (e.g. after unlink). */
async function clearGuildCommands(guildId) {
  const { rest, clientId } = getRest();
  await rest.put(Routes.applicationGuildCommands(clientId, String(guildId)), { body: [] });
  console.log(`Commands gewist voor guild ${guildId}`);
}

/**
 * Deploy to every linked guild the bot is currently in.
 * Fixes servers that were linked before the bot joined (invite flow).
 */
async function deployLinkedGuilds(client) {
  const linked = getLinkedGuildIds();
  if (!linked.length) return { ok: 0, skipped: 0, failed: 0 };

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const guildId of linked) {
    if (client && !client.guilds.cache.has(guildId)) {
      skipped += 1;
      continue;
    }
    try {
      await deployGuildCommands(guildId);
      ok += 1;
    } catch (err) {
      failed += 1;
      console.error(`Deploy commands failed for ${guildId}:`, err.message);
    }
  }

  return { ok, skipped, failed };
}

module.exports = {
  buildCommandBody,
  deployGuildCommands,
  clearGuildCommands,
  deployLinkedGuilds,
};
