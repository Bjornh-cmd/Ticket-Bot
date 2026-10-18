const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { hasModRole } = require('../utils/helpers');
const { getGuildSettings, isPanelStaff } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Mod quick menu (mods only)'),

  async execute(interaction) {
    const settings = getGuildSettings(interaction.guildId);
    if (!hasModRole(interaction.member, settings)) {
      return interaction.reply({
        content: settings.mod_role_id
          ? 'Alleen leden met de **Mod**-rol (of Administrator) kunnen `/mod` gebruiken.'
          : 'Er is nog geen Mod-rol ingesteld. De server-owner moet die in het dashboard zetten.',
        ephemeral: true,
      });
    }

    const base = (process.env.DASHBOARD_URL || 'http://localhost:3000').replace(/\/$/, '');
    const hasPanel =
      String(interaction.guild.ownerId) === String(interaction.user.id) ||
      isPanelStaff(interaction.guildId, interaction.user.id);

    const embed = new EmbedBuilder()
      .setColor(0x0f766e)
      .setTitle('Mod menu')
      .setDescription(
        'Snelle tools voor moderators.\n\n' +
          '**Veelgebruikt:** `/warn` · `/timeout` · `/purge` · `/lock` · `/ticket claim`\n' +
          '**Info:** `/userinfo` · `/warnings` · `/help`'
      )
      .setFooter({
        text: hasPanel
          ? 'Je hebt panel-toegang — gebruik /dashboard'
          : 'Geen panel-toegang — vraag de server-owner om je toe te voegen',
      });

    const row = new ActionRowBuilder();
    if (hasPanel) {
      row.addComponents(
        new ButtonBuilder()
          .setLabel('Open dashboard')
          .setStyle(ButtonStyle.Link)
          .setURL(`${base}/guild/${interaction.guildId}`)
      );
    }
    row.addComponents(
      new ButtonBuilder().setLabel('Help-site').setStyle(ButtonStyle.Link).setURL(`${base}/help`)
    );

    return interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
    });
  },
};
