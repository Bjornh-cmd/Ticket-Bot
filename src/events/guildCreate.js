const { Events } = require('discord.js');
const { isGuildAllowed } = require('../utils/helpers');
const { deployGuildCommands } = require('../utils/deployCommands');
const { ensureBotGuildSetup, ensureTicketCategoryPermissions } = require('../utils/botRoleSetup');

module.exports = {
  name: Events.GuildCreate,
  async execute(guild) {
    if (!isGuildAllowed(guild.id)) {
      console.log(
        `Server ${guild.name} (${guild.id}) is nog niet gekoppeld in Reedhall — verlaten. Owner moet eerst koppelen via het dashboard.`
      );
      guild.leave().catch(() => null);
      return;
    }

    console.log(`Reedhall toegevoegd aan gekoppelde server: ${guild.name}`);
    try {
      await ensureBotGuildSetup(guild);
    } catch (err) {
      console.error(`Bot-rol setup mislukt voor ${guild.name}:`, err.message);
    }
    try {
      await deployGuildCommands(guild.id);
    } catch (err) {
      console.error(`Commands deployen mislukt voor ${guild.name}:`, err.message);
    }
  },
};
