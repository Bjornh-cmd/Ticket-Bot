const { Events, ActivityType } = require('discord.js');
const { isGuildAllowed } = require('../utils/helpers');
const { startPunishmentChecker } = require('../utils/punishments');
const { startPollChecker } = require('../utils/polls');
const { startGiveawayChecker } = require('../utils/giveaways');
const { createDashboard } = require('../dashboard/server');
const { deployLinkedGuilds } = require('../utils/deployCommands');
const { ensureBotGuildSetup } = require('../utils/botRoleSetup');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`Bot online als ${client.user.tag}`);
    client.user.setActivity('Reedhall desk', { type: ActivityType.Watching });

    for (const [id, guild] of client.guilds.cache) {
      if (!isGuildAllowed(id)) {
        console.log(`Verlaat niet-toegestane server: ${guild.name} (${id})`);
        guild.leave().catch(() => null);
      }
    }

    for (const [id, guild] of client.guilds.cache) {
      if (!isGuildAllowed(id)) continue;
      ensureBotGuildSetup(guild).catch((err) => {
        console.error(`[botRole] backfill failed for ${guild.name}:`, err.message);
      });
    }

    try {
      const result = await deployLinkedGuilds(client);
      console.log(
        `Slash-commands sync: ${result.ok} ok, ${result.skipped} overgeslagen (bot niet in server), ${result.failed} mislukt`
      );
    } catch (err) {
      console.error('Slash-commands sync mislukt:', err.message);
    }

    startPunishmentChecker(client);
    startPollChecker(client);
    startGiveawayChecker(client);
    createDashboard(client);
  },
};
