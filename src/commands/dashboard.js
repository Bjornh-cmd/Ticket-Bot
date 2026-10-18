const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { isPlatformAdmin, memberHasGuildOwnerPower } = require('../utils/helpers');
const { isPanelStaff } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('Open the Reedhall panel (server owner, admin, or invited panel mod)'),

  async execute(interaction) {
    const userId = String(interaction.user.id);
    const ownerPower = memberHasGuildOwnerPower(interaction.member, interaction.guild);
    const staff = isPanelStaff(interaction.guildId, userId);
    const admin = isPlatformAdmin(interaction.user);

    if (!ownerPower && !staff && !admin) {
      return interaction.reply({
        content:
          'No panel access. You need Discord **Owner**, **Administrator**, or **Manage Server** — or an invite under Access.\n' +
          'Staff without panel access can use `/mod`.',
        ephemeral: true,
      });
    }

    const base = (process.env.DASHBOARD_URL || 'http://localhost:3000').replace(/\/$/, '');
    const guildUrl = `${base}/guild/${interaction.guild.id}`;

    const embed = new EmbedBuilder()
      .setColor(0x0f766e)
      .setTitle('Reedhall panel')
      .setDescription(
        `Open the control room for **${interaction.guild.name}**.\n\n` +
          (ownerPower || admin
            ? 'You have owner-level access (Discord owner / Administrator / Manage Server).'
            : 'You are invited as a panel mod.')
      )
      .setFooter({ text: 'Log in with Discord on the website' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Open panel').setStyle(ButtonStyle.Link).setURL(guildUrl),
      new ButtonBuilder().setLabel('Help').setStyle(ButtonStyle.Link).setURL(`${base}/help`)
    );

    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },
};
