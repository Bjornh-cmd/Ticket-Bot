const { SlashCommandBuilder } = require('discord.js');
const { baseEmbed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('List of bot commands'),

  async execute(interaction) {
    const base = (process.env.DASHBOARD_URL || 'http://localhost:3000').replace(/\/$/, '');
    const embed = baseEmbed(0x0f766e)
      .setTitle('Reedhall — Help')
      .addFields(
        {
          name: 'Moderatie (Mod-rol)',
          value:
            '`/mod` snelmenu · `/kick` `/ban` `/tempban` `/softban` `/timeout`\n`/warn` `/warnings` `/purge` `/lock` `/addrole` `/removerole`',
        },
        {
          name: 'Panel',
          value:
            '`/dashboard` — owner of uitgenodigde panel-mods\nHelp-site: ' + base + '/help',
        },
        {
          name: 'Tickets',
          value:
            '`/ticket panel` `claim` `add` `remove` `rename` `close`\n`/ticket move` `notes` `priority` `requestclose` `transcript` `reopen`\nHelp: ' +
            base +
            '/help',
        },
        {
          name: 'Info',
          value: '`/ping` `/botinfo` `/avatar` `/userinfo` `/serverinfo` `/roleinfo` `/membercount`',
        }
      );
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
